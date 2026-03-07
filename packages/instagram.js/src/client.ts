import { EventEmitter } from 'node:events';
import { Collection } from './collection';
import { DEFAULT_CLIENT_OPTIONS, TYPING_TTL } from './constants';
import { HttpClient } from './http';
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
  RawDelta,
  RawMessage,
  RawThread,
  ReactionEvent,
  ReadReceiptEvent,
  RecipientSearchResult,
  SessionData,
  ThreadDeleteEvent,
  ThreadUpdateEvent,
  TypingEvent,
} from './types';
import type { Message } from './models/message';
import { generateMutationToken, generateOfflineThreadingId, isRecord } from './utils';

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
  resync: [];
  error: [Error];
  rawDelta: [RawDelta];
};

function isValidDeltaOp(op: unknown): op is RawDelta['op'] {
  return op === 'add' || op === 'remove' || op === 'replace';
}

function parseDeltaValue(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return isRecord(value) ? value : null;
}

function hasRawMessageFields(obj: Record<string, unknown>): obj is RawMessage {
  return (
    typeof obj['item_id'] === 'string' &&
    'user_id' in obj &&
    'timestamp' in obj &&
    typeof obj['item_type'] === 'string'
  );
}

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
  private readonly typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly maxCachedMessages: number;
  private session: SessionData | null = null;

  constructor(options?: ClientOptions) {
    super();
    this.options = {
      reconnect: options?.reconnect ?? DEFAULT_CLIENT_OPTIONS.reconnect,
      reconnectInterval: options?.reconnectInterval ?? DEFAULT_CLIENT_OPTIONS.reconnectInterval,
      reconnectMaxRetries: options?.reconnectMaxRetries ?? DEFAULT_CLIENT_OPTIONS.reconnectMaxRetries,
      syncOnConnect: options?.syncOnConnect ?? DEFAULT_CLIENT_OPTIONS.syncOnConnect,
      maxCachedThreads: options?.maxCachedThreads ?? DEFAULT_CLIENT_OPTIONS.maxCachedThreads,
      maxCachedMessages: options?.maxCachedMessages ?? DEFAULT_CLIENT_OPTIONS.maxCachedMessages,
      mqttKeepAlive: options?.mqttKeepAlive ?? DEFAULT_CLIENT_OPTIONS.mqttKeepAlive,
      docIds: options?.docIds ?? {},
    };
    this.threads = new LruCollection(this.options.maxCachedThreads);
    this.users = new Collection();
    this.maxCachedMessages = this.options.maxCachedMessages;
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
      const inboxData = await this.http.graphql<{
        data?: { viewer?: { message_threads?: { nodes?: RawThread[] }; seq_id?: number } };
      }>('IGDInboxTrayQuery', {});

      const viewer = inboxData.data?.viewer;
      if (viewer?.seq_id !== undefined) {
        this.seqId = viewer.seq_id;
        session.seqId = viewer.seq_id;
      }

      const threadNodes = viewer?.message_threads?.nodes ?? [];
      for (const rawThread of threadNodes) {
        const thread = Thread.from(rawThread, this);
        this.threads.set(thread.id, thread);

        for (const participant of thread.participants) {
          if (!this.users.has(participant.user.id)) {
            this.users.set(participant.user.id, participant.user);
          }
        }
      }
    }

    this.user = new ClientUser({
      id: cookies.ds_user_id,
      igScopedId: session.igScopedId,
      client: this,
    });
    this.users.set(this.user.id, this.user);

    this.mqtt = new MqttClient(session, { keepAlive: this.options.mqttKeepAlive });

    this.mqtt.on('message', (topic, payload) => {
      if (topic === '/ig_message_sync') {
        this.handleDeltaMessage(payload);
      }
    });

    this.mqtt.on('disconnect', () => {
      this.connected = false;
      if (this.options.reconnect) {
        this.attemptReconnect();
      } else {
        this.emit('disconnect', {
          reason: 'connection_lost',
          willReconnect: false,
        });
      }
    });

    this.mqtt.on('error', (err) => {
      this.emit('error', err);
    });

    await this.mqtt.connect();
    await this.mqtt.subscribe(['/ig_message_sync', '/ig_send_message_response']);

    this.mqtt.publish(
      '/ig_sub_iris',
      JSON.stringify({
        seq_id: this.seqId,
        snapshot_at_ms: Date.now(),
        snapshot_app_version: 'web',
        subscription_type: 'slide_gql',
      }),
      1,
    );

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

    for (const timer of this.typingTimers.values()) {
      clearTimeout(timer);
    }
    this.typingTimers.clear();

    if (this.mqtt) {
      this.mqtt.disconnect();
      this.mqtt = null;
    }

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
      throw new Error('Client not connected');
    }
    return this.http;
  }

  private requireMqtt(): MqttClient {
    if (!this.mqtt) {
      throw new Error('Client not connected');
    }
    return this.mqtt;
  }

  private deviceId(): string {
    return this.session?.deviceId ?? '';
  }

  // -- MQTT actions --

  /** Send a text message to a thread. */
  sendText(threadId: string, text: string, replyToId?: string): void {
    this.requireMqtt().publish(
      '/ig_send_message',
      JSON.stringify({
        action: 'send_item',
        item_type: 'text',
        text,
        thread_id: threadId,
        mutation_token: generateMutationToken(),
        client_context: generateOfflineThreadingId(),
        device_id: this.deviceId(),
        replied_to_item_id: replyToId ?? null,
        replied_to_client_context: null,
      }),
      1,
    );
  }

  /** Send a reaction to a message. */
  sendReaction(threadId: string, itemId: string, emoji: string): void {
    this.requireMqtt().publish(
      '/ig_send_message',
      JSON.stringify({
        action: 'send_item',
        item_type: 'reaction',
        reaction_status: 'created',
        emoji,
        item_id: itemId,
        thread_id: threadId,
        node_type: 'item',
        mutation_token: generateMutationToken(),
        client_context: generateOfflineThreadingId(),
        device_id: this.deviceId(),
      }),
      1,
    );
  }

  /** Remove a reaction from a message. */
  removeReaction(threadId: string, itemId: string): void {
    this.requireMqtt().publish(
      '/ig_send_message',
      JSON.stringify({
        action: 'send_item',
        item_type: 'reaction',
        reaction_status: 'deleted',
        item_id: itemId,
        thread_id: threadId,
        node_type: 'item',
        mutation_token: generateMutationToken(),
        client_context: generateOfflineThreadingId(),
        device_id: this.deviceId(),
      }),
      1,
    );
  }

  /** Send a typing indicator. */
  sendTyping(threadId: string, status: 0 | 1): void {
    this.requireMqtt().publish(
      '/ig_send_message',
      JSON.stringify({
        action: 'indicate_activity',
        activity_status: status,
        thread_id: threadId,
      }),
      0,
    );
  }

  // -- GraphQL actions --

  /** Mark a thread as read. */
  async markAsRead(threadId: string, lastMessageTimestamp: string): Promise<void> {
    await this.requireHttp().graphql('useIGDMarkThreadAsReadMutation', {
      threadId,
      lastSeenMessageTimestamp: lastMessageTimestamp,
    });
  }

  /** Edit a message's text. */
  async editMessage(threadId: string, itemId: string, newText: string): Promise<void> {
    await this.requireHttp().graphql('IGDirectEditMessageMutation', {
      thread_id: threadId,
      item_id: itemId,
      text: newText,
    });
  }

  /** Unsend (delete) a message. */
  async unsendMessage(threadId: string, itemId: string): Promise<void> {
    await this.requireHttp().graphql('IGDMessageUnsendDialogOffMsysMutation', {
      thread_id: threadId,
      item_id: itemId,
    });
  }

  /** Edit a thread's name. */
  async editThreadName(threadId: string, name: string): Promise<void> {
    await this.requireHttp().graphql('IGDEditThreadNameDialogOffMsysMutation', {
      thread_id: threadId,
      name,
    });
  }

  /** Delete a thread. */
  async deleteThread(threadId: string): Promise<void> {
    await this.requireHttp().graphql('IGDInboxInfoDeleteThreadDialogOffMsysMutation', {
      thread_id: threadId,
    });
  }

  /** Mute or unmute a thread. */
  async muteThread(threadId: string, muted: boolean): Promise<void> {
    await this.requireHttp().graphql('IGDInboxInfoMuteToggleOffMsysMutation', {
      thread_id: threadId,
      muted,
    });
  }

  /** Set a participant's nickname. */
  async setNickname(threadId: string, userId: string, nickname: string | null): Promise<void> {
    await this.requireHttp().graphql('useIGDEditNicknameMutation', {
      thread_id: threadId,
      user_id: userId,
      nickname: nickname ?? '',
    });
  }

  /** Fetch a thread by ID. */
  async fetchThread(threadId: string): Promise<Thread> {
    const result = await this.requireHttp().graphql<{
      data?: { thread?: RawThread };
    }>('IGDThreadDetailMainViewContainerQuery', {
      thread_id: threadId,
    });

    const raw = result.data?.thread;
    if (!raw) {
      throw new Error(`Thread ${threadId} not found`);
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
    return this.createGroupThread([userId]);
  }

  /** Search users. */
  async searchUsers(query: string): Promise<RecipientSearchResult> {
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
    await this.requireHttp().rest('/api/v1/direct_v2/threads/approve_multiple/', {
      method: 'POST',
      body: { thread_ids: JSON.stringify(threadIds) },
    });
  }

  /** Decline pending message requests. */
  async declineThreads(threadIds: string[]): Promise<void> {
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

  // -- Delta processing --

  private handleDeltaMessage(payload: Buffer): void {
    let parsed: Record<string, unknown>;
    try {
      const raw: unknown = JSON.parse(payload.toString());
      if (!isRecord(raw)) {
        this.emit('error', new Error('Delta message is not an object'));
        return;
      }
      parsed = raw;
    } catch {
      this.emit('error', new Error('Failed to parse delta message'));
      return;
    }

    if (parsed['event'] !== 'patch' || !Array.isArray(parsed['data'])) {
      return;
    }

    const seqId = parsed['seq_id'];
    if (typeof seqId === 'number' && seqId > this.seqId) {
      this.seqId = seqId;
    }

    const data = parsed['data'] as unknown[];
    for (const delta of data) {
      if (!isRecord(delta)) {
        continue;
      }

      const op = delta['op'];
      const path = delta['path'];
      if (typeof op !== 'string' || typeof path !== 'string' || !isValidDeltaOp(op)) {
        continue;
      }

      const rawDelta: RawDelta = {
        op,
        path,
        value: delta['value'],
        seqId: typeof seqId === 'number' ? seqId : this.seqId,
      };
      this.emit('rawDelta', rawDelta);

      try {
        this.processDelta(rawDelta);
      } catch (err) {
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  private processDelta(delta: RawDelta): void {
    const { op, path, value } = delta;

    const itemMatch = path.match(
      /^\/direct_v2\/threads\/([^/]+)\/items\/([^/]+)$/,
    );
    if (itemMatch) {
      const threadId = itemMatch[1]!;
      const itemId = itemMatch[2]!;
      this.handleItemDelta(op, threadId, itemId, value);
      return;
    }

    const reactionMatch = path.match(
      /^\/direct_v2\/threads\/([^/]+)\/items\/([^/]+)\/reactions\/likes\/([^/]+)$/,
    );
    if (reactionMatch) {
      const threadId = reactionMatch[1]!;
      const itemId = reactionMatch[2]!;
      const userId = reactionMatch[3]!;
      this.handleReactionDelta(op, threadId, itemId, userId, value);
      return;
    }

    const typingMatch = path.match(
      /^\/direct_v2\/threads\/([^/]+)\/activity_indicator_id\/([^/]+)$/,
    );
    if (typingMatch) {
      const threadId = typingMatch[1]!;
      this.handleTypingDelta(threadId, value);
      return;
    }

    const readMatch = path.match(
      /^\/direct_v2\/threads\/([^/]+)\/participants\/([^/]+)\/has_seen$/,
    );
    if (readMatch) {
      const threadId = readMatch[1]!;
      const userId = readMatch[2]!;
      this.handleReadReceiptDelta(threadId, userId, value);
      return;
    }

    const adminMatch = path.match(
      /^\/direct_v2\/threads\/([^/]+)\/admin_user_ids\/([^/]+)$/,
    );
    if (adminMatch) {
      const threadId = adminMatch[1]!;
      const userId = adminMatch[2]!;
      this.handleAdminDelta(op, threadId, userId);
      return;
    }

    const settingsMatch = path.match(
      /^\/direct_v2\/threads\/([^/]+)\/dm_settings$/,
    );
    if (settingsMatch) {
      const threadId = settingsMatch[1]!;
      const thread = this.threads.get(threadId);
      if (thread) {
        this.emit('threadUpdate', { thread, changes: {} });
      }
      return;
    }

    const threadDeleteMatch = path.match(
      /^\/direct_v2\/inbox\/threads\/([^/]+)$/,
    );
    if (threadDeleteMatch && op === 'remove') {
      const threadId = threadDeleteMatch[1]!;
      this.threads.delete(threadId);
      this.emit('threadDelete', { threadId });
    }
  }

  private handleItemDelta(
    op: string,
    threadId: string,
    itemId: string,
    value: unknown,
  ): void {
    const thread = this.threads.get(threadId);

    if (op === 'add') {
      const obj = parseDeltaValue(value);
      if (!obj || !hasRawMessageFields(obj)) {
        return;
      }

      const userId = String(obj.user_id);

      if (this.user && userId === this.user.id) {
        return;
      }

      let author = this.users.get(userId);
      if (!author) {
        author = new User({ id: userId, partial: true, client: this });
        this.users.set(userId, author);
      }

      const message = createMessage({ raw: obj, threadId, author, client: this });

      if (thread) {
        thread.messages.set(message.id, message);
      }

      this.emit('message', message);
    } else if (op === 'remove') {
      const message = thread?.messages.get(itemId) ?? null;
      if (thread) {
        thread.messages.delete(itemId);
      }
      this.emit('messageDelete', {
        messageId: itemId,
        message,
        thread: thread ?? new Thread({ id: threadId, client: this }),
        timestamp: new Date(),
      });
    } else if (op === 'replace') {
      if (!thread) {
        return;
      }
      const existing = thread.messages.get(itemId);
      if (!existing) {
        return;
      }

      const obj = parseDeltaValue(value);
      if (!obj) {
        return;
      }

      const newText = typeof obj['text'] === 'string' ? obj['text'] : null;
      const oldText = 'text' in existing ? (existing as unknown as { text: string }).text : null;

      if (newText !== null && oldText !== null && newText !== oldText) {
        (existing as unknown as { text: string }).text = newText;
        this.emit('messageEdit', {
          message: existing,
          thread,
          oldText,
          timestamp: new Date(),
        });
      }
    }
  }

  private handleReactionDelta(
    op: string,
    threadId: string,
    itemId: string,
    userId: string,
    value: unknown,
  ): void {
    const thread = this.threads.get(threadId);
    if (!thread) {
      return;
    }

    const message = thread.messages.get(itemId) ?? null;
    const participant = thread.participants.find((p) => p.user.id === userId) ?? {
      user: this.users.get(userId) ?? new User({ id: userId, partial: true }),
      isAdmin: false,
      nickname: null,
    };

    const obj = parseDeltaValue(value);
    const emoji = typeof obj?.['emoji'] === 'string' ? obj['emoji'] : '';

    if (op === 'remove') {
      this.emit('reactionRemove', {
        message,
        messageId: itemId,
        thread,
        participant,
        emoji,
        timestamp: new Date(),
      });
    } else {
      this.emit('reaction', {
        message,
        messageId: itemId,
        thread,
        participant,
        emoji,
        timestamp: new Date(),
      });
    }
  }

  private handleTypingDelta(threadId: string, value: unknown): void {
    const thread = this.threads.get(threadId);
    if (!thread) {
      return;
    }

    const obj = parseDeltaValue(value);
    if (!obj) {
      return;
    }

    const senderId = String(obj['sender_id'] ?? '');
    const status = typeof obj['activity_status'] === 'number' ? obj['activity_status'] : 0;
    const ttl = typeof obj['ttl'] === 'number' ? obj['ttl'] : TYPING_TTL;

    const participant = thread.participants.find((p) => p.user.id === senderId) ?? {
      user: this.users.get(senderId) ?? new User({ id: senderId, partial: true }),
      isAdmin: false,
      nickname: null,
    };

    const timerKey = `${threadId}:${senderId}`;

    if (status === 0) {
      const existingTimer = this.typingTimers.get(timerKey);
      if (existingTimer) {
        clearTimeout(existingTimer);
        this.typingTimers.delete(timerKey);
      }
      this.emit('typingStop', { thread, participant, timestamp: new Date() });
    } else {
      const existingTimer = this.typingTimers.get(timerKey);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      this.emit('typingStart', { thread, participant, timestamp: new Date() });

      const timer = setTimeout(() => {
        this.typingTimers.delete(timerKey);
        this.emit('typingStop', { thread, participant, timestamp: new Date() });
      }, ttl);
      this.typingTimers.set(timerKey, timer);
    }
  }

  private handleReadReceiptDelta(
    threadId: string,
    userId: string,
    value: unknown,
  ): void {
    const thread = this.threads.get(threadId);
    if (!thread) {
      return;
    }

    const obj = parseDeltaValue(value);

    const participant = thread.participants.find((p) => p.user.id === userId) ?? {
      user: this.users.get(userId) ?? new User({ id: userId, partial: true }),
      isAdmin: false,
      nickname: null,
    };

    const itemId = typeof obj?.['item_id'] === 'string' ? obj['item_id'] : '';
    const rawTimestamp = obj?.['timestamp'];
    const timestamp = typeof rawTimestamp === 'number' ? new Date(rawTimestamp) : new Date();

    this.emit('readReceipt', {
      thread,
      participant,
      messageId: itemId,
      timestamp,
    });
  }

  private handleAdminDelta(
    op: string,
    threadId: string,
    userId: string,
  ): void {
    const thread = this.threads.get(threadId);
    if (!thread) {
      return;
    }

    const participant = thread.participants.find((p) => p.user.id === userId) ?? {
      user: this.users.get(userId) ?? new User({ id: userId, partial: true }),
      isAdmin: false,
      nickname: null,
    };

    const isAdmin = op === 'add';
    participant.isAdmin = isAdmin;

    this.emit('threadUpdate', {
      thread,
      changes: {
        adminChange: { participant, isAdmin },
      },
    });
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.options.reconnectMaxRetries) {
      this.emit('disconnect', {
        reason: 'connection_lost',
        willReconnect: false,
      });
      return;
    }

    const delay = Math.min(
      this.options.reconnectInterval * Math.pow(2, this.reconnectAttempts),
      60_000,
    );
    this.reconnectAttempts++;

    this.emit('disconnect', {
      reason: 'connection_lost',
      willReconnect: true,
    });

    this.reconnectTimer = setTimeout(async () => {
      try {
        if (this.mqtt) {
          await this.mqtt.connect();
          await this.mqtt.subscribe(['/ig_message_sync', '/ig_send_message_response']);
          this.mqtt.publish(
            '/ig_sub_iris',
            JSON.stringify({
              seq_id: this.seqId,
              snapshot_at_ms: Date.now(),
              snapshot_app_version: 'web',
              subscription_type: 'slide_gql',
            }),
            1,
          );
          this.connected = true;
          this.reconnectAttempts = 0;
          this.emit('reconnect');
        }
      } catch {
        this.attemptReconnect();
      }
    }, delay);
  }
}
