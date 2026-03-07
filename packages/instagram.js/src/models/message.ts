import type { Client } from '../client';
import { ITEM_TYPE_MAP } from '../constants';
import type { SendContent } from '../media';
import type {
  MessageType,
  RawMessage,
  Reaction,
  RepliedMessage,
  SharedPost,
  SharedReel,
  SharedStory,
} from '../types';
import { assertNever } from '../utils';
import { User } from './user';

function parseReactions(raw: RawMessage['reactions']): Reaction[] {
  if (!raw?.likes) {
    return [];
  }
  return raw.likes.map((r) => ({
    emoji: r.emoji,
    userId: String(r.sender_id),
    timestamp: new Date(Number(r.timestamp) / 1000),
  }));
}

function parseRepliedTo(raw: RawMessage['replied_to_message']): RepliedMessage | null {
  if (!raw) {
    return null;
  }
  return {
    id: raw.item_id,
    text: raw.text ?? null,
    userId: String(raw.user_id),
    timestamp: new Date(Number(raw.timestamp) / 1000),
  };
}

type BaseMessageData = {
  readonly id: string;
  readonly threadId: string;
  readonly author: User;
  readonly timestamp: Date;
  readonly reactions: readonly Reaction[];
  readonly repliedTo: RepliedMessage | null;
  readonly rawType: string;
  readonly client?: Client;
};

/** Base class for all message types. Holds shared fields and action methods. */
export abstract class BaseMessage {
  readonly id: string;
  readonly threadId: string;
  readonly author: User;
  readonly timestamp: Date;
  readonly reactions: readonly Reaction[];
  readonly repliedTo: RepliedMessage | null;
  readonly rawType: string;
  abstract readonly type: MessageType;
  declare readonly client: Client;

  constructor(data: BaseMessageData) {
    this.id = data.id;
    this.threadId = data.threadId;
    this.author = data.author;
    this.timestamp = data.timestamp;
    this.reactions = data.reactions;
    this.repliedTo = data.repliedTo;
    this.rawType = data.rawType;

    if (data.client !== undefined) {
      Object.defineProperty(this, 'client', {
        value: data.client,
        writable: true,
        enumerable: false,
        configurable: true,
      });
    }
  }

  private requireClient(): Client {
    if (!this.client) {
      throw new Error('No client attached');
    }
    return this.client;
  }

  /**
   * Reply to this message.
   *
   * @example
   * ```ts
   * client.on('message', (msg) => {
   *   msg.reply('Got it!');
   *   msg.reply({ photo: imageBuffer });
   * });
   * ```
   */
  reply(content: string): Promise<void>;
  reply(content: SendContent): Promise<Message>;
  reply(content: string | SendContent): Promise<void> | Promise<Message> {
    const client = this.requireClient();
    if (typeof content === 'string') {
      return client.sendText(this.threadId, content, this.id);
    }
    return client.sendMedia(this.threadId, content);
  }

  /** Edit this message's text. */
  async edit(text: string): Promise<void> {
    await this.requireClient().editMessage(this.threadId, this.id, text);
  }

  /** React to this message with an emoji. */
  react(emoji: string): void {
    this.requireClient().sendReaction(this.threadId, this.id, emoji);
  }

  /** Remove your reaction from this message. */
  unreact(): void {
    this.requireClient().removeReaction(this.threadId, this.id);
  }

  /** Unsend (delete) this message. */
  async delete(): Promise<void> {
    await this.requireClient().unsendMessage(this.threadId, this.id);
  }
}

export class TextMessage extends BaseMessage {
  readonly type = 'text' satisfies MessageType;
  readonly text: string;

  constructor(data: BaseMessageData & { readonly text: string }) {
    super(data);
    this.text = data.text;
  }
}

export class MediaMessage extends BaseMessage {
  readonly type = 'media' satisfies MessageType;
  readonly mediaUrl: string;
  readonly mediaType: 'image' | 'video';
  readonly width: number;
  readonly height: number;

  constructor(data: BaseMessageData & { readonly mediaUrl: string; readonly mediaType: 'image' | 'video'; readonly width: number; readonly height: number }) {
    super(data);
    this.mediaUrl = data.mediaUrl;
    this.mediaType = data.mediaType;
    this.width = data.width;
    this.height = data.height;
  }
}

export class LikeMessage extends BaseMessage {
  readonly type = 'like' satisfies MessageType;
}

export class LinkMessage extends BaseMessage {
  readonly type = 'link' satisfies MessageType;
  readonly text: string | null;
  readonly url: string;
  readonly title: string | null;
  readonly summary: string | null;
  readonly thumbnailUrl: string | null;

  constructor(data: BaseMessageData & { readonly text: string | null; readonly url: string; readonly title: string | null; readonly summary: string | null; readonly thumbnailUrl: string | null }) {
    super(data);
    this.text = data.text;
    this.url = data.url;
    this.title = data.title;
    this.summary = data.summary;
    this.thumbnailUrl = data.thumbnailUrl;
  }
}

export class MediaShareMessage extends BaseMessage {
  readonly type = 'mediaShare' satisfies MessageType;
  readonly text: string | null;
  readonly post: SharedPost;

  constructor(data: BaseMessageData & { readonly text: string | null; readonly post: SharedPost }) {
    super(data);
    this.text = data.text;
    this.post = data.post;
  }
}

export class ReelShareMessage extends BaseMessage {
  readonly type = 'reelShare' satisfies MessageType;
  readonly text: string | null;
  readonly reel: SharedReel;

  constructor(data: BaseMessageData & { readonly text: string | null; readonly reel: SharedReel }) {
    super(data);
    this.text = data.text;
    this.reel = data.reel;
  }
}

export class StoryShareMessage extends BaseMessage {
  readonly type = 'storyShare' satisfies MessageType;
  readonly text: string | null;
  readonly story: SharedStory;

  constructor(data: BaseMessageData & { readonly text: string | null; readonly story: SharedStory }) {
    super(data);
    this.text = data.text;
    this.story = data.story;
  }
}

export class VoiceMediaMessage extends BaseMessage {
  readonly type = 'voiceMedia' satisfies MessageType;
  readonly audioUrl: string;
  readonly duration: number;

  constructor(data: BaseMessageData & { readonly audioUrl: string; readonly duration: number }) {
    super(data);
    this.audioUrl = data.audioUrl;
    this.duration = data.duration;
  }
}

export class AnimatedMediaMessage extends BaseMessage {
  readonly type = 'animatedMedia' satisfies MessageType;
  readonly gifUrl: string;
  readonly width: number;
  readonly height: number;

  constructor(data: BaseMessageData & { readonly gifUrl: string; readonly width: number; readonly height: number }) {
    super(data);
    this.gifUrl = data.gifUrl;
    this.width = data.width;
    this.height = data.height;
  }
}

export class RavenMediaMessage extends BaseMessage {
  readonly type = 'ravenMedia' satisfies MessageType;
  readonly mediaUrl: string | null;
  readonly mediaType: 'image' | 'video';
  readonly viewMode: 'once' | 'replayable' | 'permanent';
  readonly expiresAt: Date | null;
  readonly seen: boolean;

  constructor(data: BaseMessageData & { readonly mediaUrl: string | null; readonly mediaType: 'image' | 'video'; readonly viewMode: 'once' | 'replayable' | 'permanent'; readonly expiresAt: Date | null; readonly seen: boolean }) {
    super(data);
    this.mediaUrl = data.mediaUrl;
    this.mediaType = data.mediaType;
    this.viewMode = data.viewMode;
    this.expiresAt = data.expiresAt;
    this.seen = data.seen;
  }
}

export class ClipMessage extends BaseMessage {
  readonly type = 'clip' satisfies MessageType;
  readonly text: string | null;
  readonly clip: SharedReel;

  constructor(data: BaseMessageData & { readonly text: string | null; readonly clip: SharedReel }) {
    super(data);
    this.text = data.text;
    this.clip = data.clip;
  }
}

export class ActionLogMessage extends BaseMessage {
  readonly type = 'actionLog' satisfies MessageType;
  readonly actionText: string;

  constructor(data: BaseMessageData & { readonly actionText: string }) {
    super(data);
    this.actionText = data.actionText;
  }
}

export class PlaceholderMessage extends BaseMessage {
  readonly type = 'placeholder' satisfies MessageType;
  readonly placeholderText: string;

  constructor(data: BaseMessageData & { readonly placeholderText: string }) {
    super(data);
    this.placeholderText = data.placeholderText;
  }
}

export class UnknownMessage extends BaseMessage {
  readonly type = 'unknown' satisfies MessageType;
  readonly rawValue: unknown;

  constructor(data: BaseMessageData & { readonly rawValue: unknown }) {
    super(data);
    this.rawValue = data.rawValue;
  }
}

export type Message =
  | TextMessage
  | MediaMessage
  | LikeMessage
  | LinkMessage
  | MediaShareMessage
  | ReelShareMessage
  | StoryShareMessage
  | VoiceMediaMessage
  | AnimatedMediaMessage
  | RavenMediaMessage
  | ClipMessage
  | ActionLogMessage
  | PlaceholderMessage
  | UnknownMessage;

type CreateMessageInput = {
  raw: RawMessage;
  threadId: string;
  author: User;
  client?: Client;
};

/**
 * Create a Message from raw API data.
 * Returns the correct subclass based on item_type.
 *
 * @example
 * ```ts
 * const msg = createMessage({
 *   raw: rawApiData,
 *   threadId: '12345',
 *   author: user,
 *   client,
 * });
 * if (msg.type === 'text') {
 *   console.log(msg.text);
 * }
 * ```
 */
export function createMessage(input: CreateMessageInput): Message {
  const { raw, threadId, author, client } = input;
  const mappedType: MessageType = ITEM_TYPE_MAP[raw.item_type] ?? 'unknown';

  const base: BaseMessageData = {
    id: raw.item_id,
    threadId,
    author,
    timestamp: new Date(Number(raw.timestamp) / 1000),
    reactions: parseReactions(raw.reactions),
    repliedTo: parseRepliedTo(raw.replied_to_message),
    rawType: raw.item_type,
    ...(client !== undefined ? { client } : {}),
  };

  switch (mappedType) {
    case 'text':
      return new TextMessage({ ...base, text: raw.text ?? '' });

    case 'media': {
      const candidate = raw.media?.image_versions2?.candidates?.[0];
      return new MediaMessage({
        ...base,
        mediaUrl: candidate?.url ?? '',
        mediaType: raw.media?.media_type === 2 ? 'video' : 'image',
        width: candidate?.width ?? 0,
        height: candidate?.height ?? 0,
      });
    }

    case 'like':
      return new LikeMessage(base);

    case 'link': {
      const linkContext = raw.link?.link_context;
      return new LinkMessage({
        ...base,
        text: raw.link?.text ?? raw.text ?? null,
        url: linkContext?.link_url ?? '',
        title: linkContext?.link_title ?? null,
        summary: linkContext?.link_summary ?? null,
        thumbnailUrl: linkContext?.link_image_url ?? null,
      });
    }

    case 'mediaShare': {
      const ms = raw.media_share;
      return new MediaShareMessage({
        ...base,
        text: raw.text ?? null,
        post: {
          id: String(ms?.id ?? ''),
          code: ms?.code ?? '',
          mediaType: 'image',
          thumbnailUrl: '',
          caption: ms?.caption?.text ?? null,
          user: author,
        },
      });
    }

    case 'reelShare':
      return new ReelShareMessage({
        ...base,
        text: raw.reel_share?.text ?? raw.text ?? null,
        reel: {
          id: String(raw.reel_share?.media?.id ?? ''),
          videoUrl: raw.reel_share?.media?.video_versions?.[0]?.url ?? '',
          thumbnailUrl: raw.reel_share?.media?.image_versions2?.candidates?.[0]?.url ?? '',
          owner: author,
        },
      });

    case 'storyShare':
      return new StoryShareMessage({
        ...base,
        text: raw.text ?? null,
        story: {
          id: String(raw.story_share?.media?.id ?? ''),
          mediaUrl: raw.story_share?.media?.image_versions2?.candidates?.[0]?.url ?? null,
          thumbnailUrl: raw.story_share?.media?.image_versions2?.candidates?.[0]?.url ?? null,
          owner: author,
          isExpired: raw.story_share?.is_reel_persisted === false,
        },
      });

    case 'voiceMedia':
      return new VoiceMediaMessage({
        ...base,
        audioUrl: raw.voice_media?.media?.audio?.audio_src ?? '',
        duration: raw.voice_media?.media?.audio?.duration ?? 0,
      });

    case 'animatedMedia': {
      const fh = raw.animated_media?.images?.fixed_height;
      return new AnimatedMediaMessage({
        ...base,
        gifUrl: fh?.url ?? '',
        width: Number(fh?.width ?? 0),
        height: Number(fh?.height ?? 0),
      });
    }

    case 'ravenMedia':
      return new RavenMediaMessage({
        ...base,
        mediaUrl: raw.visual_media?.media?.image_versions2?.candidates?.[0]?.url ?? null,
        mediaType: raw.visual_media?.media?.media_type === 2 ? 'video' : 'image',
        viewMode: 'once',
        expiresAt: null,
        seen: false,
      });

    case 'clip':
      return new ClipMessage({
        ...base,
        text: raw.text ?? null,
        clip: {
          id: String(raw.clip?.clip?.id ?? ''),
          videoUrl: raw.clip?.clip?.video_versions?.[0]?.url ?? '',
          thumbnailUrl: raw.clip?.clip?.image_versions2?.candidates?.[0]?.url ?? '',
          owner: author,
        },
      });

    case 'actionLog':
      return new ActionLogMessage({
        ...base,
        actionText: raw.action_log?.description ?? '',
      });

    case 'placeholder':
      return new PlaceholderMessage({
        ...base,
        placeholderText: raw.placeholder?.message ?? '',
      });

    case 'unknown':
      return new UnknownMessage({ ...base, rawValue: raw });

    default:
      assertNever(mappedType);
  }
}
