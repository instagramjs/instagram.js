import { EventEmitter } from 'node:events';
import { Collection } from './collection';
import { DEFAULT_CLIENT_OPTIONS } from './constants';
import type { DeltaResult } from './delta-types';
import { ApiError, AuthError, IgBotError, TimeoutError } from './errors';
import { HttpClient } from './http';
import {
  decodeBytecode,
  dispatchBatch,
  buildSendMessageTask,
  buildLsRequestEnvelope,
  buildLsSyncEnvelope,
  buildLsTypingEnvelope,
  LS_TOPICS,
} from './lightspeed';
import type { LsResponse } from './lightspeed';
import { LruCollection } from './lru-collection';
import { createMessage } from './models/message';
import { Thread } from './models/thread';
import { ClientUser, User } from './models/user';
import { MqttClient } from './mqtt';
import { bootstrapSession, parseAndValidateCookies } from './session';
import type {
  ClientOptions,
  DisconnectEvent,
  MessageDeleteEvent,
  MessageEditEvent,
  MessageSearchResponse,
  RawMessage,
  RawThread,
  RawUser,
  ReactionEvent,
  ReadReceiptEvent,
  RecipientSearchResult,
  SessionData,
  ThreadDeleteEvent,
  ThreadUpdateEvent,
  TypingEvent,
} from './types';
import type { Message } from './models/message';
import type { SendContent } from './media';
import { sendGif, sendLink, sendPhoto, sendVideo, sendVoice } from './media';
import { generateOfflineThreadingId, isRecord, requireNonEmpty, requireNonEmptyArray } from './utils';

type ClientEventMap = {
  ready: [];
  message: [Message];
  messageDelete: [MessageDeleteEvent];
  messageEdit: [MessageEditEvent];
  typingStart: [TypingEvent];
  typingStop: [TypingEvent];
  reaction: [ReactionEvent];
  reactionRemove: [ReactionEvent];
  readReceipt: [ReadReceiptEvent];
  threadUpdate: [ThreadUpdateEvent];
  threadDelete: [ThreadDeleteEvent];
  disconnect: [DisconnectEvent];
  reconnect: [];
  error: [Error];
};

/**
 * The main client for connecting to Instagram's messaging system.
 *
 * @example
 * ```ts
 * const client = new Client({ reconnect: true });
 * client.on('message', (msg) => {
 *   if (msg.type === 'text') {
 *     msg.reply('Hello!');
 *   }
 * });
 * await client.login('sessionid=abc; csrftoken=xyz; ds_user_id=123');
 * ```
 */
export class Client extends EventEmitter<ClientEventMap> {
  readonly threads: LruCollection<string, Thread>;
  readonly users: Collection<string, User>;
  user: ClientUser | null = null;
  readyAt: Date | null = null;
  connected = false;

  private readonly options: Required<ClientOptions>;
  private http: HttpClient | null = null;
  private mqtt: MqttClient | null = null;
  private seqId = 0;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectStabilityTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly maxCachedMessages: number;
  private readonly sendTimeout: number;
  private readonly pendingLsRequests = new Map<number, {
    resolve: () => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private session: SessionData | null = null;
  private lsRequestId = 10;
  private lsEpochId = '';
  private lsSyncCursor: string | null = null;
  private lsSyncDatabase = 1;

  constructor(options?: ClientOptions) {
    super();
    this.options = {
      reconnect: options?.reconnect ?? DEFAULT_CLIENT_OPTIONS.reconnect,
      reconnectInterval: options?.reconnectInterval ?? DEFAULT_CLIENT_OPTIONS.reconnectInterval,
      reconnectMaxRetries: options?.reconnectMaxRetries ?? DEFAULT_CLIENT_OPTIONS.reconnectMaxRetries,
      sendTimeout: options?.sendTimeout ?? DEFAULT_CLIENT_OPTIONS.sendTimeout,
      syncOnConnect: options?.syncOnConnect ?? DEFAULT_CLIENT_OPTIONS.syncOnConnect,
      maxCachedThreads: options?.maxCachedThreads ?? DEFAULT_CLIENT_OPTIONS.maxCachedThreads,
      maxCachedMessages: options?.maxCachedMessages ?? DEFAULT_CLIENT_OPTIONS.maxCachedMessages,
      mqttKeepAlive: options?.mqttKeepAlive ?? DEFAULT_CLIENT_OPTIONS.mqttKeepAlive,
      docIds: options?.docIds ?? {},
    };
    this.threads = new LruCollection(this.options.maxCachedThreads);
    this.users = new Collection();
    this.maxCachedMessages = this.options.maxCachedMessages;
    this.sendTimeout = this.options.sendTimeout;
  }

  get uptime(): number | null {
    if (!this.readyAt) {
      return null;
    }
    return Date.now() - this.readyAt.getTime();
  }

  /**
   * Connect and authenticate with Instagram.
   *
   * @example
   * ```ts
   * const client = new Client();
   * await client.login('sessionid=abc; csrftoken=xyz; ds_user_id=123');
   * ```
   */
  async login(cookieString: string): Promise<void> {
    const cookies = parseAndValidateCookies(cookieString);
    const session = await bootstrapSession(cookies);

    this.session = session;
    this.http = new HttpClient(session, this.options.docIds);

    if (this.options.syncOnConnect) {
      await this.syncInbox();
    }

    this.user = new ClientUser({
      id: cookies.ds_user_id,
      username: session.username,
      igScopedId: session.igScopedId,
      client: this,
    });
    this.users.set(this.user.id, this.user);

    this.lsEpochId = generateOfflineThreadingId();

    this.mqtt = new MqttClient(session, { keepAlive: this.options.mqttKeepAlive });

    this.mqtt.on('message', (topic, payload) => {
      if (topic === LS_TOPICS.RESPONSE) {
        this.handleLsResponse(payload);
      }
    });

    this.mqtt.on('disconnect', () => {
      this.connected = false;
      if (this.options.reconnect) {
        this.emit('disconnect', {
          reason: 'connection_lost',
          willReconnect: true,
        });
        this.attemptReconnect();
      } else {
        this.emit('disconnect', {
          reason: 'connection_lost',
          willReconnect: false,
        });
      }
    });

    this.mqtt.on('error', (err) => {
      if (this.connected) {
        this.emit('error', err);
      }
    });

    await this.mqtt.connect();
    await this.mqtt.subscribe([
      LS_TOPICS.RESPONSE,
      LS_TOPICS.APP_SETTINGS,
    ]);

    this.publishLsSync();

    this.connected = true;
    this.readyAt = new Date();
    this.reconnectAttempts = 0;
    this.emit('ready');
  }

  /** Disconnect and clean up all state. */
  async destroy(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.reconnectStabilityTimer) {
      clearTimeout(this.reconnectStabilityTimer);
      this.reconnectStabilityTimer = null;
    }

    for (const timer of this.typingTimers.values()) {
      clearTimeout(timer);
    }
    this.typingTimers.clear();

    for (const entry of this.pendingLsRequests.values()) {
      clearTimeout(entry.timer);
      entry.reject(new IgBotError('Client destroyed', 'CLIENT_DESTROYED'));
    }
    this.pendingLsRequests.clear();

    if (this.mqtt) {
      this.mqtt.disconnect();
      this.mqtt = null;
    }

    this.emit('disconnect', { reason: 'destroyed', willReconnect: false });

    this.threads.clear();
    this.users.clear();
    this.user = null;
    this.connected = false;
    this.readyAt = null;
    this.http = null;
    this.session = null;
    this.removeAllListeners();
  }

  /** Get the current sequence ID. */
  getSeqId(): number {
    return this.seqId;
  }

  private requireHttp(): HttpClient {
    if (!this.http) {
      throw new IgBotError('Client not connected', 'NOT_CONNECTED');
    }
    return this.http;
  }

  private requireMqtt(): MqttClient {
    if (!this.mqtt) {
      throw new IgBotError('Client not connected', 'NOT_CONNECTED');
    }
    return this.mqtt;
  }

  private deviceId(): string {
    return this.session?.deviceId ?? '';
  }

  private async syncInbox(): Promise<void> {
    const http = this.requireHttp();
    const inboxData = await http.graphql<{
      data?: {
        get_slide_mailbox_for_iris_subscription?: {
          iris_inactive_subscription_uq_seq_id?: string;
        };
      };
    }>('PolarisDirectInboxQuery', {
      device_id_for_iris_subscription: this.deviceId(),
      __relay_internal__pv__IGDEnableOffMsysThreadListQErelayprovider: true,
      __relay_internal__pv__IGDIsProfessionalAccountGKrelayprovider: false,
      __relay_internal__pv__IGDPinnedThreadsRenderEnabledGKrelayprovider: true,
      __relay_internal__pv__IGDMaxUnreadMessagesCountrelayprovider: 5,
      __relay_internal__pv__IGDThreadListActionsEnabledGKrelayprovider: true,
    });

    const mailbox = inboxData.data?.get_slide_mailbox_for_iris_subscription;
    const rawSeqId = mailbox?.iris_inactive_subscription_uq_seq_id;
    if (rawSeqId) {
      const seqId = Number(rawSeqId);
      this.seqId = seqId;
      if (this.session) {
        this.session.seqId = seqId;
      }
    }
  }

  // -- MQTT actions --

  /**
   * Send a message to a thread.
   *
   * @example
   * ```ts
   * await client.send('thread-id', 'Hello!');
   * const msg = await client.send('thread-id', { photo: imageBuffer });
   * ```
   */
  send(threadId: string, content: string): Promise<void>;
  send(threadId: string, content: SendContent): Promise<Message>;
  send(threadId: string, content: string | SendContent): Promise<void | Message> {
    requireNonEmpty(threadId, 'threadId');
    if (typeof content === 'string') return this.sendText(threadId, content);
    return this.sendMedia(threadId, content);
  }

  /** Send a text message to a thread via Lightspeed. */
  sendText(threadId: string, text: string, replyToId?: string): Promise<void> {
    requireNonEmpty(threadId, 'threadId');
    requireNonEmpty(text, 'text');

    const requestId = this.nextLsRequestId();
    const otid = generateOfflineThreadingId();
    const task = buildSendMessageTask({
      threadId,
      text,
      otid,
      replyToId,
      markRead: true,
    });
    const envelope = buildLsRequestEnvelope({
      tasks: [task],
      epochId: this.lsEpochId,
      requestId,
    });

    return this.publishLsRequest(requestId, envelope);
  }

  /** Send a reaction to a message. */
  sendReaction(threadId: string, itemId: string, emoji: string): void {
    requireNonEmpty(threadId, 'threadId');
    requireNonEmpty(itemId, 'itemId');
    requireNonEmpty(emoji, 'emoji');
    this.requireHttp().graphql('IGDirectReactionSendMutation', {
      thread_id: threadId,
      item_id: itemId,
      reaction_status: 'created',
      emoji,
    }).catch((err: unknown) => {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    });
  }

  /** Remove a reaction from a message. */
  removeReaction(threadId: string, itemId: string): void {
    requireNonEmpty(threadId, 'threadId');
    requireNonEmpty(itemId, 'itemId');
    this.requireHttp().graphql('IGDirectReactionSendMutation', {
      thread_id: threadId,
      item_id: itemId,
      reaction_status: 'deleted',
    }).catch((err: unknown) => {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    });
  }

  /** Send a typing indicator via Lightspeed. */
  sendTyping(threadId: string, status: 0 | 1): void {
    requireNonEmpty(threadId, 'threadId');
    const requestId = this.nextLsRequestId();
    const thread = this.threads.get(threadId);
    const envelope = buildLsTypingEnvelope(
      {
        threadKey: threadId,
        isGroupThread: thread?.isGroup ?? false,
        isTyping: status === 1,
      },
      requestId,
    );
    this.requireMqtt().publish(LS_TOPICS.REQUEST, JSON.stringify(envelope));
  }

  // -- Media actions --

  /** Send media content to a thread. */
  async sendMedia(threadId: string, content: SendContent): Promise<Message> {
    const http = this.requireHttp();

    if ('photo' in content) {
      return sendPhoto({
        http, threadId, client: this,
        photo: content.photo,
        ...(content.filename !== undefined ? { filename: content.filename } : {}),
      });
    }
    if ('video' in content) {
      return sendVideo({
        http, threadId, client: this,
        video: content.video,
        ...(content.filename !== undefined ? { filename: content.filename } : {}),
      });
    }
    if ('gif' in content) {
      return sendGif({
        http, threadId, client: this,
        gifId: content.gif,
        ...(content.isSticker !== undefined ? { isSticker: content.isSticker } : {}),
      });
    }
    if ('voice' in content) {
      return sendVoice({
        http, threadId, client: this,
        voice: content.voice,
        duration: content.duration,
        ...(content.waveform !== undefined ? { waveform: content.waveform } : {}),
      });
    }
    // Only LinkContent remains
    return sendLink({
      http, threadId, client: this,
      url: content.link,
      ...(content.text !== undefined ? { text: content.text } : {}),
    });
  }

  // -- GraphQL actions --

  /** Mark a thread as read. */
  async markAsRead(threadId: string, lastMessageTimestamp: string): Promise<void> {
    requireNonEmpty(threadId, 'threadId');
    requireNonEmpty(lastMessageTimestamp, 'lastMessageTimestamp');
    await this.requireHttp().graphql('useIGDMarkThreadAsReadMutation', {
      threadId,
      lastSeenMessageTimestamp: lastMessageTimestamp,
    });
  }

  /** Edit a message's text. */
  async editMessage(threadId: string, itemId: string, newText: string): Promise<void> {
    requireNonEmpty(threadId, 'threadId');
    requireNonEmpty(itemId, 'itemId');
    requireNonEmpty(newText, 'newText');
    await this.requireHttp().graphql('IGDirectEditMessageMutation', {
      thread_id: threadId,
      item_id: itemId,
      text: newText,
    });
  }

  /** Unsend (delete) a message. */
  async unsendMessage(threadId: string, itemId: string): Promise<void> {
    requireNonEmpty(threadId, 'threadId');
    requireNonEmpty(itemId, 'itemId');
    await this.requireHttp().graphql('IGDMessageUnsendDialogOffMsysMutation', {
      thread_id: threadId,
      item_id: itemId,
    });
  }

  /** Edit a thread's name. */
  async editThreadName(threadId: string, name: string): Promise<void> {
    requireNonEmpty(threadId, 'threadId');
    await this.requireHttp().graphql('IGDEditThreadNameDialogOffMsysMutation', {
      thread_id: threadId,
      name,
    });
  }

  /** Delete a thread. */
  async deleteThread(threadId: string): Promise<void> {
    requireNonEmpty(threadId, 'threadId');
    await this.requireHttp().graphql('IGDInboxInfoDeleteThreadDialogOffMsysMutation', {
      thread_id: threadId,
    });
  }

  /** Mute or unmute a thread. */
  async muteThread(threadId: string, muted: boolean): Promise<void> {
    requireNonEmpty(threadId, 'threadId');
    await this.requireHttp().graphql('IGDInboxInfoMuteToggleOffMsysMutation', {
      thread_id: threadId,
      muted,
    });
  }

  /** Set a participant's nickname. */
  async setNickname(threadId: string, userId: string, nickname: string | null): Promise<void> {
    requireNonEmpty(threadId, 'threadId');
    requireNonEmpty(userId, 'userId');
    await this.requireHttp().graphql('useIGDEditNicknameMutation', {
      thread_id: threadId,
      user_id: userId,
      nickname: nickname ?? '',
    });
  }

  /** Fetch a thread by ID. */
  async fetchThread(threadId: string): Promise<Thread> {
    requireNonEmpty(threadId, 'threadId');
    const result = await this.requireHttp().graphql<{
      data?: { thread?: RawThread };
    }>('IGDThreadDetailMainViewContainerQuery', {
      thread_id: threadId,
    });

    const raw = result.data?.thread;
    if (!raw) {
      throw new ApiError(`Thread ${threadId} not found`);
    }

    return Thread.from(raw, this);
  }

  /** Fetch inbox threads. */
  async fetchInbox(options?: { cursor?: string }): Promise<Thread[]> {
    const result = await this.requireHttp().graphql<{
      data?: { viewer?: { message_threads?: { nodes?: RawThread[] } } };
    }>('IGDInboxTrayQuery', {
      cursor: options?.cursor,
    });

    const nodes = result.data?.viewer?.message_threads?.nodes ?? [];
    return nodes.map((raw) => Thread.from(raw, this));
  }

  /** Fetch messages for a thread. */
  async fetchMessages(threadId: string, options?: { before?: string; limit?: number }): Promise<Message[]> {
    const result = await this.requireHttp().graphql<{
      data?: { thread?: { items?: RawMessage[] } };
    }>('IGDMessageListOffMsysQuery', {
      thread_id: threadId,
      before: options?.before,
      message_limit: options?.limit ?? 20,
    });

    const items = result.data?.thread?.items ?? [];
    return items.map((raw) => {
      const author = new User({ id: String(raw.user_id), partial: true, client: this });
      return createMessage({ raw, threadId, author, client: this });
    });
  }

  // -- REST actions --

  /** Create a group thread. */
  async createGroupThread(userIds: string[], name?: string): Promise<Thread> {
    requireNonEmptyArray(userIds, 'userIds');
    const body: Record<string, string> = {
      recipient_users: JSON.stringify(userIds),
    };
    if (name) {
      body['thread_title'] = name;
    }

    const result = await this.requireHttp().rest<RawThread>(
      '/api/v1/direct_v2/create_group_thread/',
      { method: 'POST', body },
    );

    return Thread.from(result, this);
  }

  /** Create or retrieve a 1-1 thread. */
  async createThread(userId: string): Promise<Thread> {
    requireNonEmpty(userId, 'userId');
    return this.createGroupThread([userId]);
  }

  /** Search users. */
  async searchUsers(query: string): Promise<RecipientSearchResult> {
    requireNonEmpty(query, 'query');
    return this.requireHttp().rest<RecipientSearchResult>(
      '/api/v1/direct_v2/ranked_recipients/',
      {
        query: {
          mode: 'universal',
          query,
          show_threads: 'true',
        },
      },
    );
  }

  /** Search messages across threads. */
  async searchMessages(query: string, options?: { offset?: number }): Promise<MessageSearchResponse> {
    return this.requireHttp().rest<MessageSearchResponse>(
      '/api/v1/direct_v2/search_secondary/',
      {
        query: {
          query,
          result_types: JSON.stringify(['message_content']),
          offsets: JSON.stringify({ message_content: options?.offset ?? 0 }),
        },
      },
    );
  }

  /** Search messages within a thread. */
  async searchInThread(threadId: string, query: string, options?: { offset?: number }): Promise<MessageSearchResponse> {
    return this.requireHttp().rest<MessageSearchResponse>(
      '/api/v1/direct_v2/in_thread_message_search/',
      {
        query: {
          id: threadId,
          query,
          offset: String(options?.offset ?? 0),
        },
      },
    );
  }

  /** Fetch pending message request threads. */
  async fetchPendingThreads(): Promise<Thread[]> {
    const result = await this.requireHttp().rest<{
      inbox?: { threads?: RawThread[] };
    }>('/api/v1/direct_v2/pending_inbox/');

    const threads = result.inbox?.threads ?? [];
    return threads.map((raw) => Thread.from(raw, this));
  }

  /** Approve pending message requests. */
  async approveThreads(threadIds: string[]): Promise<void> {
    requireNonEmptyArray(threadIds, 'threadIds');
    await this.requireHttp().rest('/api/v1/direct_v2/threads/approve_multiple/', {
      method: 'POST',
      body: { thread_ids: JSON.stringify(threadIds) },
    });
  }

  /** Decline pending message requests. */
  async declineThreads(threadIds: string[]): Promise<void> {
    requireNonEmptyArray(threadIds, 'threadIds');
    await this.requireHttp().rest('/api/v1/direct_v2/threads/decline_multiple/', {
      method: 'POST',
      body: { thread_ids: JSON.stringify(threadIds) },
    });
  }

  /** Decline all pending message requests. */
  async declineAllThreads(): Promise<void> {
    await this.requireHttp().rest('/api/v1/direct_v2/threads/decline_all/', {
      method: 'POST',
    });
  }

  private nextLsRequestId(): number {
    return this.lsRequestId++;
  }

  private publishLsRequest(
    requestId: number,
    envelope: { app_id: string; payload: string; request_id: number; type: number },
  ): Promise<void> {
    const mqtt = this.requireMqtt();

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingLsRequests.delete(requestId);
        reject(new TimeoutError('Send response timed out'));
      }, this.sendTimeout);

      this.pendingLsRequests.set(requestId, { resolve, reject, timer });
      mqtt.publish(LS_TOPICS.REQUEST, JSON.stringify(envelope));
    });
  }

  private publishLsSync(): void {
    const requestId = this.nextLsRequestId();
    const envelope = buildLsSyncEnvelope({
      database: this.lsSyncDatabase,
      epochId: this.lsEpochId,
      requestId,
      lastAppliedCursor: this.lsSyncCursor,
    });
    this.requireMqtt().publish(LS_TOPICS.REQUEST, JSON.stringify(envelope));
  }

  private handleLsResponse(payload: Buffer): void {
    let parsed: LsResponse;
    try {
      const raw: unknown = JSON.parse(payload.toString());
      if (!isRecord(raw)) return;
      // Decode the string-encoded payload field
      const payloadStr = raw['payload'];
      const decodedPayload = typeof payloadStr === 'string' ? JSON.parse(payloadStr) : payloadStr;
      parsed = {
        request_id: typeof raw['request_id'] === 'number' ? raw['request_id'] : null,
        payload: decodedPayload as LsResponse['payload'],
        sp: Array.isArray(raw['sp']) ? raw['sp'] as string[] : [],
        target: typeof raw['target'] === 'number' ? raw['target'] : 0,
      };
    } catch (err) {
      this.emit('error', new ApiError('Failed to parse Lightspeed response', err instanceof Error ? err : undefined));
      return;
    }

    // Resolve pending request if this is a response to a task request
    if (parsed.request_id != null) {
      const entry = this.pendingLsRequests.get(parsed.request_id);
      if (entry) {
        this.pendingLsRequests.delete(parsed.request_id);
        clearTimeout(entry.timer);
        entry.resolve();
      }
    }

    // Decode bytecode and dispatch stored procedure calls as a batch
    // so attachment SPs can be correlated with their parent message SPs
    if (parsed.payload?.step) {
      const calls = decodeBytecode(parsed.payload.step, parsed.sp);
      try {
        const deltas = dispatchBatch(calls);
        for (const delta of deltas) {
          try {
            this.applyDelta(delta);
          } catch (err) {
            this.emit('error', err instanceof Error ? err : new Error(String(err)));
          }
        }
      } catch (err) {
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  // -- Delta processing --

  private applyDelta(delta: DeltaResult): void {
    switch (delta.type) {
      case 'newMessage': {
        const userId = delta.raw.user_id;
        if (this.user && String(userId) === this.user.id) return;

        let author = this.users.get(String(userId));
        if (!author) {
          author = new User({
            id: String(userId),
            partial: !delta.userDict,
            client: this,
            ...(delta.userDict?.username ? { username: delta.userDict.username } : {}),
            ...(delta.userDict?.profile_pic_url ? { profilePicUrl: delta.userDict.profile_pic_url } : {}),
          });
          this.users.set(author.id, author);
        } else if (delta.userDict?.username && !author.username) {
          author.username = delta.userDict.username;
        }

        const message = createMessage({ raw: delta.raw, threadId: delta.threadId, author, client: this });
        const thread = this.threads.get(delta.threadId);
        if (thread) {
          thread.messages.set(message.id, message);
        }
        this.emit('message', message);
        break;
      }
      case 'deleteMessage': {
        const thread = this.threads.get(delta.threadId);
        const message = thread?.messages.get(delta.messageId) ?? null;
        if (thread) {
          thread.messages.delete(delta.messageId);
        }
        this.emit('messageDelete', {
          messageId: delta.messageId,
          message,
          thread: thread ?? new Thread({ id: delta.threadId, client: this }),
          timestamp: new Date(),
        });
        break;
      }
      case 'reaction': {
        const thread = this.threads.get(delta.threadId);
        if (!thread) return;
        const message = thread.messages.get(delta.messageId) ?? null;
        const participant = thread.participants.find((p) => p.user.id === delta.senderId) ?? {
          user: this.users.get(delta.senderId) ?? new User({ id: delta.senderId, partial: true }),
          isAdmin: false,
          nickname: null,
        };
        const event = delta.action === 'add' ? 'reaction' as const : 'reactionRemove' as const;
        this.emit(event, {
          message,
          messageId: delta.messageId,
          thread,
          participant,
          emoji: delta.emoji,
          timestamp: new Date(),
        });
        break;
      }
      case 'readReceipt': {
        const thread = this.threads.get(delta.threadId);
        if (!thread) return;
        const participant = thread.participants.find((p) => p.user.id === delta.userId) ?? {
          user: this.users.get(delta.userId) ?? new User({ id: delta.userId, partial: true }),
          isAdmin: false,
          nickname: null,
        };
        this.emit('readReceipt', {
          thread,
          participant,
          messageId: '',
          timestamp: delta.timestamp,
        });
        break;
      }
      case 'threadUpdate': {
        const thread = this.threads.get(delta.threadId);
        if (!thread) return;
        const changes: ThreadUpdateEvent['changes'] = {};
        if (delta.name !== undefined) changes.name = delta.name;
        if (delta.muted !== undefined) changes.muted = delta.muted;
        this.emit('threadUpdate', { thread, changes });
        break;
      }
      case 'threadDelete': {
        this.threads.delete(delta.threadId);
        this.emit('threadDelete', { threadId: delta.threadId });
        break;
      }
      case 'typing': {
        const thread = this.threads.get(delta.threadId);
        if (!thread) return;
        if (this.user && delta.senderId === this.user.id) return;

        const participant = thread.participants.find((p) => p.user.id === delta.senderId) ?? {
          user: this.users.get(delta.senderId) ?? new User({ id: delta.senderId, partial: true }),
          isAdmin: false,
          nickname: null,
        };

        const event = delta.isTyping ? 'typingStart' as const : 'typingStop' as const;
        this.emit(event, {
          thread,
          participant,
          timestamp: new Date(),
        });

        // Auto-clear typing after TTL
        const timerKey = `${delta.threadId}:${delta.senderId}`;
        const existingTimer = this.typingTimers.get(timerKey);
        if (existingTimer) clearTimeout(existingTimer);

        if (delta.isTyping) {
          this.typingTimers.set(timerKey, setTimeout(() => {
            this.typingTimers.delete(timerKey);
            this.emit('typingStop', { thread, participant, timestamp: new Date() });
          }, 22_000));
        } else {
          this.typingTimers.delete(timerKey);
        }
        break;
      }
      case 'editMessage': {
        const thread = this.threads.get(delta.threadId);
        if (!thread) return;
        const message = thread.messages.get(delta.messageId);
        if (!message) return;
        const oldText = delta.oldText;
        if ('text' in message && typeof delta.newText === 'string') {
          (message as { text: string }).text = delta.newText;
        }
        this.emit('messageEdit', {
          message,
          thread,
          oldText,
          timestamp: new Date(),
        });
        break;
      }
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectStabilityTimer) {
      clearTimeout(this.reconnectStabilityTimer);
      this.reconnectStabilityTimer = null;
    }

    if (this.reconnectAttempts >= this.options.reconnectMaxRetries) {
      this.emit('disconnect', {
        reason: 'connection_lost',
        willReconnect: false,
      });
      return;
    }

    const delay = Math.min(
      this.options.reconnectInterval * Math.pow(2, this.reconnectAttempts),
      300_000,
    );
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(async () => {
      try {
        if (this.mqtt) {
          this.lsEpochId = generateOfflineThreadingId();
          await this.mqtt.connect();
          await this.mqtt.subscribe([
            LS_TOPICS.RESPONSE,
            LS_TOPICS.APP_SETTINGS,
          ]);
          this.publishLsSync();
          this.connected = true;
          this.reconnectStabilityTimer = setTimeout(() => {
            this.reconnectAttempts = 0;
            this.reconnectStabilityTimer = null;
          }, 30_000);
          this.emit('reconnect');
        }
      } catch (err) {
        if (err instanceof AuthError) {
          this.emit('disconnect', { reason: 'auth_expired', willReconnect: false });
          return;
        }
        this.attemptReconnect();
      }
    }, delay);
  }

}
