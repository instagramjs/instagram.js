import { EventEmitter } from 'node:events';
import { Collection } from './collection';
import { DEFAULT_CLIENT_OPTIONS } from './constants';
import { ApiError, AuthError, IgBotError, TimeoutError } from './errors';
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
import { generateMutationToken, generateOfflineThreadingId, isRecord, requireNonEmpty, requireNonEmptyArray } from './utils';

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

const SLIDE_CONTENT_TYPE_MAP: Record<string, string> = {
  SlideMessageText: 'text',
  SlideMessageImageContent: 'media',
  SlideMessageVideosContent: 'media',
  SlideMessageAnimatedMediaContent: 'animated_media',
  SlideMessageAudiosContent: 'voice_media',
  SlideMessageClip: 'clip',
  SlideMessageAdminText: 'action_log',
  SlideMessageLink: 'link',
  SlideMessageRavenImageContent: 'raven_media',
  SlideMessageRavenVideoContent: 'raven_media',
};

/** @internal */
export function toRawMessage(slide: Record<string, unknown>): RawMessage | null {
  const msg = isRecord(slide['message']) ? slide['message'] : slide;
  const id = msg['id'] ?? msg['message_id'];
  const senderId = msg['sender_fbid'];
  const timestampMs = msg['timestamp_ms'];
  if (typeof id !== 'string' || senderId == null || timestampMs == null) {
    return null;
  }

  const content = isRecord(msg['content']) ? msg['content'] : null;
  const contentTypename = typeof content?.['__typename'] === 'string' ? content['__typename'] : '';
  const itemType = SLIDE_CONTENT_TYPE_MAP[contentTypename] ?? 'text';

  const raw: RawMessage = {
    item_id: id,
    user_id: String(senderId),
    timestamp: String(Number(timestampMs) * 1000),
    item_type: itemType,
  };

  const textBody = msg['text_body'];
  if (typeof textBody === 'string') {
    raw.text = textBody;
  }

  if (msg['igd_is_forwarded'] === true) {
    raw.is_forwarded = true;
  }
  const igdSnippet = msg['igd_snippet'];
  if (typeof igdSnippet === 'string') {
    raw.snippet = igdSnippet;
  }

  switch (contentTypename) {
    case 'SlideMessageImageContent': {
      const atts = Array.isArray(content!['attachments']) ? content!['attachments'] as Record<string, unknown>[] : [];
      const att = isRecord(atts[0]) ? atts[0] : null;
      if (att) {
        const url = typeof att['attachment_cdn_url'] === 'string' ? att['attachment_cdn_url'] : '';
        const previewUrl = typeof att['preview_cdn_url'] === 'string' ? att['preview_cdn_url'] : undefined;
        const width = Number(att['preview_width']) || 0;
        const height = Number(att['preview_height']) || 0;
        raw.media = {
          media_type: 1,
          image_versions2: { candidates: [{ url, width, height }] },
          ...(previewUrl ? { preview_url: previewUrl } : {}),
        };
      }
      break;
    }
    case 'SlideMessageVideosContent': {
      const vids = Array.isArray(content!['videos']) ? content!['videos'] as Record<string, unknown>[] : [];
      const vid = isRecord(vids[0]) ? vids[0] : null;
      if (vid) {
        const url = typeof vid['attachment_cdn_url'] === 'string' ? vid['attachment_cdn_url'] : '';
        const previewUrl = typeof vid['preview_cdn_url'] === 'string' ? vid['preview_cdn_url'] : undefined;
        const width = Number(vid['preview_width']) || 0;
        const height = Number(vid['preview_height']) || 0;
        raw.media = {
          media_type: 2,
          image_versions2: { candidates: [{ url, width, height }] },
          ...(previewUrl ? { preview_url: previewUrl } : {}),
        };
      }
      break;
    }
    case 'SlideMessageXMAContent': {
      const xma = isRecord(content!['xma']) ? content!['xma'] : null;
      if (!xma) break;
      const targetUrl = typeof xma['target_url'] === 'string' ? xma['target_url'] : '';
      const targetId = typeof xma['target_id'] === 'string' || typeof xma['target_id'] === 'number' ? String(xma['target_id']) : '';
      const previewImage = isRecord(xma['preview_image']) ? xma['preview_image'] : null;
      const thumbnailUrl = typeof previewImage?.['url'] === 'string' ? previewImage['url'] : null;
      const headerTitle = typeof xma['header_title_text'] === 'string' ? xma['header_title_text'] : null;
      const eyebrowText = typeof xma['eyebrow_text'] === 'string' ? xma['eyebrow_text'] : null;
      const xmaTextBody = typeof content!['xma_text_body'] === 'string' ? content!['xma_text_body'] : null;

      if (targetUrl.includes('/reel/')) {
        raw.item_type = 'reel_share';
        raw.reel_share = {
          ...(eyebrowText ? { text: eyebrowText } : {}),
          media: {
            id: targetId,
            ...(thumbnailUrl ? { image_versions2: { candidates: [{ url: thumbnailUrl, width: 0, height: 0 }] } } : {}),
            ...(headerTitle ? { user: { pk: '', username: headerTitle } } : {}),
          },
        };
      } else if (targetUrl.includes('/stories/')) {
        raw.item_type = 'story_share';
        raw.story_share = {
          media: {
            id: targetId,
            ...(thumbnailUrl ? { image_versions2: { candidates: [{ url: thumbnailUrl, width: 0, height: 0 }] } } : {}),
            ...(headerTitle ? { user: { pk: '', username: headerTitle } } : {}),
          },
        };
      } else if (targetUrl.includes('/p/')) {
        raw.item_type = 'media_share';
        const codeMatch = targetUrl.match(/\/p\/([^/?]+)/);
        raw.media_share = {
          id: targetId,
          code: codeMatch?.[1] ?? '',
          ...(thumbnailUrl ? { image_versions2: { candidates: [{ url: thumbnailUrl, width: 0, height: 0 }] } } : {}),
          ...(headerTitle ? { user: { pk: '', username: headerTitle } } : {}),
        };
      } else {
        raw.item_type = 'link';
        raw.link = {
          ...(xmaTextBody ? { text: xmaTextBody } : {}),
          link_context: {
            link_url: targetUrl,
            ...(headerTitle ? { link_title: headerTitle } : {}),
            ...(eyebrowText ? { link_summary: eyebrowText } : {}),
            ...(thumbnailUrl ? { link_image_url: thumbnailUrl } : {}),
          },
        };
      }
      break;
    }
    case 'SlideMessageAudiosContent': {
      const audioAtts = Array.isArray(content!['audio_attachments']) ? content!['audio_attachments'] as Record<string, unknown>[] : [];
      const audioAtt = isRecord(audioAtts[0]) ? audioAtts[0] : null;
      if (audioAtt) {
        const audioUrl = typeof audioAtt['attachment_cdn_url'] === 'string' ? audioAtt['attachment_cdn_url'] : '';
        const durationMs = Number(audioAtt['playable_duration_ms']) || 0;
        const waveform = Array.isArray(audioAtt['waveform_data']) ? audioAtt['waveform_data'] as number[] : undefined;
        raw.voice_media = {
          media: {
            audio: {
              audio_src: audioUrl,
              duration: durationMs,
              ...(waveform ? { waveform_data: waveform } : {}),
            },
          },
        };
      }
      break;
    }
    case 'SlideMessageAnimatedMediaContent': {
      const anims = Array.isArray(content!['animated_media']) ? content!['animated_media'] as Record<string, unknown>[] : [];
      const anim = isRecord(anims[0]) ? anims[0] : null;
      if (anim) {
        const gifUrl = typeof anim['attachment_webp_url'] === 'string' ? anim['attachment_webp_url'] : '';
        const width = Number(anim['preview_width']) || 0;
        const height = Number(anim['preview_height']) || 0;
        const stickerFlag = anim['is_sticker'] === true;
        const mp4Url = typeof anim['attachment_mp4_url'] === 'string' ? anim['attachment_mp4_url'] : undefined;
        raw.animated_media = {
          images: { fixed_height: { url: gifUrl, width, height } },
          ...(stickerFlag ? { is_sticker: true } : {}),
          ...(mp4Url ? { mp4_url: mp4Url } : {}),
        };
      }
      break;
    }
    case 'SlideMessageAdminText': {
      const fragments = Array.isArray(content!['text_fragments']) ? content!['text_fragments'] as Record<string, unknown>[] : [];
      const description = fragments
        .map((f) => (typeof f['plaintext'] === 'string' ? f['plaintext'] : ''))
        .join('');
      raw.action_log = { description };
      break;
    }
    case 'SlideMessageRavenImageContent':
    case 'SlideMessageRavenVideoContent': {
      const viewMode = content!['view_mode'];
      const viewModeStr = typeof viewMode === 'number' ? String(viewMode) : typeof viewMode === 'string' ? viewMode : null;
      const visualMedia: RawMessage['visual_media'] = {
        ...(viewModeStr ? { view_mode: viewModeStr } : {}),
        media: {
          media_type: contentTypename === 'SlideMessageRavenVideoContent' ? 2 : 1,
        },
      };
      const attachment = isRecord(content!['attachment']) ? content!['attachment'] : null;
      if (attachment) {
        const url = typeof attachment['attachment_cdn_url'] === 'string' ? attachment['attachment_cdn_url'] : null;
        if (url && visualMedia.media) {
          visualMedia.media.image_versions2 = { candidates: [{ url, width: 0, height: 0 }] };
        }
      }
      raw.visual_media = visualMedia;
      break;
    }
  }

  const reactions = msg['reactions'];
  if (isRecord(reactions) && Array.isArray(reactions['likes'])) {
    raw.reactions = { likes: reactions['likes'] as Array<{ sender_id: string | number; emoji: string; timestamp: string | number }> };
  }

  const repliedToId = msg['replied_to_message_id'];
  if (typeof repliedToId === 'string') {
    raw.replied_to_message = { item_id: repliedToId, user_id: '', timestamp: '0' };
  }

  return raw;
}

function extractUserDict(slide: Record<string, unknown>): RawUser | null {
  const msg = isRecord(slide['message']) ? slide['message'] : slide;
  const sender = isRecord(msg['sender']) ? msg['sender'] : null;
  const userDict = isRecord(sender?.['user_dict']) ? sender!['user_dict'] : null;
  if (!userDict) return null;
  const pk = userDict['pk'] ?? userDict['id'] ?? msg['sender_fbid'];
  if (pk == null) return null;
  const result: RawUser = { pk: String(pk) };
  if (typeof userDict['username'] === 'string') result.username = userDict['username'];
  if (typeof userDict['full_name'] === 'string') result.full_name = userDict['full_name'];
  if (typeof userDict['profile_pic_url'] === 'string') result.profile_pic_url = userDict['profile_pic_url'];
  if (typeof userDict['is_verified'] === 'boolean') result.is_verified = userDict['is_verified'];
  return result;
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
  private reconnectStabilityTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly maxCachedMessages: number;
  private readonly sendTimeout: number;
  private readonly pendingSends: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];
  private session: SessionData | null = null;
  private irisRetryAttempts = 0;
  private irisRetryTimer: ReturnType<typeof setTimeout> | null = null;

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

    this.mqtt = new MqttClient(session, { keepAlive: this.options.mqttKeepAlive });

    this.mqtt.on('message', (topic, payload) => {
      if (topic === '/ig_message_sync') {
        this.handleDeltaMessage(payload);
      } else if (topic === '/ig_send_message_response') {
        this.handleSendResponse(payload);
      } else if (topic === '/ig_sub_iris_response') {
        this.handleIrisResponse(payload);
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
    await this.mqtt.subscribe(['/ig_message_sync', '/ig_sub_iris_response']);

    this.publishIrisSubscription();

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

    if (this.irisRetryTimer) {
      clearTimeout(this.irisRetryTimer);
      this.irisRetryTimer = null;
    }

    for (const timer of this.typingTimers.values()) {
      clearTimeout(timer);
    }
    this.typingTimers.clear();

    for (const entry of this.pendingSends) {
      clearTimeout(entry.timer);
      entry.reject(new IgBotError('Client destroyed', 'CLIENT_DESTROYED'));
    }
    this.pendingSends.length = 0;

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

  /** Send a text message to a thread. */
  sendText(threadId: string, text: string, replyToId?: string): Promise<void> {
    requireNonEmpty(threadId, 'threadId');
    requireNonEmpty(text, 'text');
    const mqtt = this.requireMqtt();

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.pendingSends.findIndex((e) => e.resolve === resolve);
        if (idx !== -1) {
          this.pendingSends.splice(idx, 1);
        }
        reject(new TimeoutError('Send response timed out'));
      }, this.sendTimeout);

      this.pendingSends.push({ resolve, reject, timer });

      mqtt.publish(
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
      );
    });
  }

  /** Send a reaction to a message. */
  sendReaction(threadId: string, itemId: string, emoji: string): void {
    requireNonEmpty(threadId, 'threadId');
    requireNonEmpty(itemId, 'itemId');
    requireNonEmpty(emoji, 'emoji');
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
    );
  }

  /** Remove a reaction from a message. */
  removeReaction(threadId: string, itemId: string): void {
    requireNonEmpty(threadId, 'threadId');
    requireNonEmpty(itemId, 'itemId');
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
    );
  }

  /** Send a typing indicator. */
  sendTyping(threadId: string, status: 0 | 1): void {
    requireNonEmpty(threadId, 'threadId');
    this.requireMqtt().publish(
      '/ig_send_message',
      JSON.stringify({
        action: 'indicate_activity',
        activity_status: status,
        thread_id: threadId,
      }),
    );
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

  private handleSendResponse(payload: Buffer): void {
    let parsed: Record<string, unknown>;
    try {
      const raw: unknown = JSON.parse(payload.toString());
      if (!isRecord(raw)) {
        return;
      }
      parsed = raw;
    } catch (err) {
      this.emit('error', new ApiError('Failed to parse send response', err instanceof Error ? err : undefined));
      return;
    }

    const inner = isRecord(parsed['payload']) ? parsed['payload'] : null;
    if (inner && inner['activity_status'] != null) {
      return;
    }

    const entry = this.pendingSends.shift();
    if (!entry) {
      return;
    }
    clearTimeout(entry.timer);

    if (parsed['status'] === 'ok') {
      entry.resolve();
    } else {
      entry.reject(
        new ApiError(`Send failed: ${String(parsed['status'] ?? 'unknown')}`),
      );
    }
  }

  // -- Delta processing --

  private handleDeltaMessage(payload: Buffer): void {
    let parsed: Record<string, unknown>;
    try {
      const raw: unknown = JSON.parse(payload.toString());
      const obj = Array.isArray(raw) ? raw[0] : raw;
      if (!isRecord(obj)) {
        this.emit('error', new Error('Delta message is not an object'));
        return;
      }
      parsed = obj;
    } catch {
      this.emit('error', new Error('Failed to parse delta message'));
      return;
    }

    const data = isRecord(parsed['data']) ? parsed['data'] : null;
    const mutations = Array.isArray(data?.['slide_delta_processor'])
      ? (data!['slide_delta_processor'] as unknown[])
      : null;
    if (!mutations) {
      return;
    }

    for (const mutation of mutations) {
      if (!isRecord(mutation)) {
        continue;
      }

      const typename = mutation['__typename'];
      const rawSeqId = mutation['uq_seq_id'];
      if (typeof typename !== 'string' || typeof rawSeqId !== 'string') {
        continue;
      }

      const seqId = Number(rawSeqId);
      if (seqId > this.seqId) {
        this.seqId = seqId;
      }

      this.emit('rawDelta', mutation as RawDelta);

      try {
        this.processSlide(typename, mutation);
      } catch (err) {
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  private processSlide(typename: string, mutation: Record<string, unknown>): void {
    switch (typename) {
      case 'SlideUQPPNewMessage':
        this.handleSlideNewMessage(mutation);
        break;
      case 'SlideUQPPAdminTextMessage':
        this.handleSlideNewMessage(mutation);
        break;
      case 'SlideUQPPNewRavenMessage':
        this.handleSlideNewMessage(mutation);
        break;
      case 'SlideUQPPDeleteMessage':
        this.handleSlideDeleteMessage(mutation);
        break;
      case 'SlideUQPPCreateReaction':
        this.handleSlideReaction(mutation, 'reaction');
        break;
      case 'SlideUQPPDeleteReaction':
        this.handleSlideReaction(mutation, 'reactionRemove');
        break;
      case 'SlideUQPPReadReceipt':
        this.handleSlideReadReceipt(mutation);
        break;
      case 'SlideUQPPChangeMuteSettings':
        this.handleSlideThreadUpdate(mutation);
        break;
      case 'SlideUQPPThreadName':
        this.handleSlideThreadUpdate(mutation);
        break;
      case 'SlideUQPPDeleteThread':
        this.handleSlideDeleteThread(mutation);
        break;
    }
  }

  private handleSlideNewMessage(mutation: Record<string, unknown>): void {
    const raw = toRawMessage(mutation);
    if (!raw) {
      return;
    }

    const msg = isRecord(mutation['message']) ? mutation['message'] : mutation;
    const threadId = typeof msg['thread_fbid'] === 'string' ? msg['thread_fbid'] : '';
    const userId = raw.user_id;

    if (this.user && String(userId) === this.user.id) {
      return;
    }

    const userDict = extractUserDict(mutation);
    let author = this.users.get(String(userId));
    if (!author) {
      author = new User({
        id: String(userId),
        partial: !userDict,
        client: this,
        ...(userDict?.username ? { username: userDict.username } : {}),
        ...(userDict?.profile_pic_url ? { profilePicUrl: userDict.profile_pic_url } : {}),
      });
      this.users.set(author.id, author);
    } else if (userDict?.username && !author.username) {
      author.username = userDict.username;
    }

    const message = createMessage({ raw, threadId, author, client: this });

    const thread = this.threads.get(threadId);
    if (thread) {
      thread.messages.set(message.id, message);
    }

    this.emit('message', message);
  }

  private handleSlideDeleteMessage(mutation: Record<string, unknown>): void {
    const threadId = typeof mutation['thread_fbid'] === 'string' ? mutation['thread_fbid'] : '';
    const messageId = typeof mutation['message_id'] === 'string' ? mutation['message_id'] : '';

    const thread = this.threads.get(threadId);
    const message = thread?.messages.get(messageId) ?? null;
    if (thread) {
      thread.messages.delete(messageId);
    }

    this.emit('messageDelete', {
      messageId,
      message,
      thread: thread ?? new Thread({ id: threadId, client: this }),
      timestamp: new Date(),
    });
  }

  private handleSlideReaction(
    mutation: Record<string, unknown>,
    event: 'reaction' | 'reactionRemove',
  ): void {
    const threadId = typeof mutation['thread_fbid'] === 'string' ? mutation['thread_fbid'] : '';
    const messageId = typeof mutation['message_id'] === 'string' ? mutation['message_id'] : '';

    const thread = this.threads.get(threadId);
    if (!thread) {
      return;
    }

    const message = thread.messages.get(messageId) ?? null;
    const reactionData = isRecord(mutation['reaction']) ? mutation['reaction'] : {};
    const emoji = typeof reactionData['reaction'] === 'string' ? reactionData['reaction'] : '';
    const senderId = typeof reactionData['sender_id'] === 'string'
      ? reactionData['sender_id']
      : typeof reactionData['actor_fbid'] === 'string'
        ? reactionData['actor_fbid']
        : '';

    const participant = thread.participants.find((p) => p.user.id === senderId) ?? {
      user: this.users.get(senderId) ?? new User({ id: senderId, partial: true }),
      isAdmin: false,
      nickname: null,
    };

    this.emit(event, {
      message,
      messageId,
      thread,
      participant,
      emoji,
      timestamp: new Date(),
    });
  }

  private handleSlideReadReceipt(mutation: Record<string, unknown>): void {
    const threadId = typeof mutation['thread_fbid'] === 'string' ? mutation['thread_fbid'] : '';
    const thread = this.threads.get(threadId);
    if (!thread) {
      return;
    }

    const receipt = isRecord(mutation['read_receipt']) ? mutation['read_receipt'] : {};
    const userId = typeof receipt['participant_fbid'] === 'string' ? receipt['participant_fbid'] : '';
    const rawTimestamp = receipt['watermark_timestamp_ms'];
    const timestamp = typeof rawTimestamp === 'string' ? new Date(Number(rawTimestamp)) : new Date();

    const participant = thread.participants.find((p) => p.user.id === userId) ?? {
      user: this.users.get(userId) ?? new User({ id: userId, partial: true }),
      isAdmin: false,
      nickname: null,
    };

    this.emit('readReceipt', {
      thread,
      participant,
      messageId: '',
      timestamp,
    });
  }

  private handleSlideThreadUpdate(mutation: Record<string, unknown>): void {
    const threadId = typeof mutation['thread_fbid'] === 'string' ? mutation['thread_fbid'] : '';
    const thread = this.threads.get(threadId);
    if (!thread) {
      return;
    }

    const changes: ThreadUpdateEvent['changes'] = {};

    if (typeof mutation['thread_name'] === 'string') {
      changes.name = mutation['thread_name'];
    }
    if (typeof mutation['is_muted_now'] === 'boolean') {
      changes.muted = mutation['is_muted_now'];
    }

    this.emit('threadUpdate', { thread, changes });
  }

  private handleSlideDeleteThread(mutation: Record<string, unknown>): void {
    const threadId = typeof mutation['thread_fbid'] === 'string' ? mutation['thread_fbid'] : '';
    this.threads.delete(threadId);
    this.emit('threadDelete', { threadId });
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
          await this.mqtt.connect();
          await this.mqtt.subscribe(['/ig_message_sync', '/ig_sub_iris_response']);
          this.publishIrisSubscription();
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

  private publishIrisSubscription(): void {
    this.requireMqtt().publish(
      '/ig_sub_iris',
      JSON.stringify({
        seq_id: this.seqId,
        snapshot_at_ms: Date.now(),
        snapshot_app_version: 'web',
        subscription_type: 'slide_gql',
        graphql_config: JSON.stringify({
          slide_doc_id: '26744961355092044',
          variables: {
            enable_off_msys_messages_list: true,
            __relay_internal__pv__IGDEnableOffMsysPinnedMessagesQErelayprovider: false,
          },
        }),
      }),
    );
  }

  private handleIrisResponse(payload: Buffer): void {
    let parsed: Record<string, unknown>;
    try {
      const raw: unknown = JSON.parse(payload.toString());
      if (!isRecord(raw)) {
        return;
      }
      parsed = raw;
    } catch (err) {
      this.emit('error', new ApiError('Failed to parse Iris response', err instanceof Error ? err : undefined));
      return;
    }

    const errorType = parsed['error_type'];

    if (errorType === 1) {
      this.irisRetryAttempts = 0;
      this.performResync();
    } else if (errorType === 2) {
      const delay = Math.min(Math.pow(2, this.irisRetryAttempts), 64) * 1000;
      this.irisRetryAttempts++;
      this.irisRetryTimer = setTimeout(() => {
        this.irisRetryTimer = null;
        this.publishIrisSubscription();
      }, delay);
    } else {
      this.irisRetryAttempts = 0;
    }
  }

  private async performResync(): Promise<void> {
    try {
      await this.syncInbox();
      this.publishIrisSubscription();
      this.emit('resync');
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }
}
