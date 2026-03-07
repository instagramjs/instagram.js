import { ITEM_TYPE_MAP } from '../constants';
import type {
  MessageType,
  RawMessage,
  Reaction,
  RepliedMessage,
  SharedPost,
  SharedReel,
  SharedStory,
} from '../types';
import { User } from './user';


type MessageBaseFields = {
  id: string;
  threadId: string;
  author: User;
  timestamp: Date;
  reactions: Reaction[];
  repliedTo: RepliedMessage | null;
  rawType: string;
};

type ActionMethods = {
  reply(content: string): Promise<Message>;
  edit(text: string): Promise<void>;
  react(emoji: string): Promise<void>;
  unreact(): Promise<void>;
  delete(): Promise<void>;
};


export type TextMessage = MessageBaseFields &
  ActionMethods & {
    type: 'text';
    text: string;
  };

export type MediaMessage = MessageBaseFields &
  ActionMethods & {
    type: 'media';
    mediaUrl: string;
    mediaType: 'image' | 'video';
    width: number;
    height: number;
  };

export type LikeMessage = MessageBaseFields &
  ActionMethods & {
    type: 'like';
  };

export type LinkMessage = MessageBaseFields &
  ActionMethods & {
    type: 'link';
    text: string | null;
    url: string;
    title: string | null;
    summary: string | null;
    thumbnailUrl: string | null;
  };

export type MediaShareMessage = MessageBaseFields &
  ActionMethods & {
    type: 'mediaShare';
    text: string | null;
    post: SharedPost;
  };

export type ReelShareMessage = MessageBaseFields &
  ActionMethods & {
    type: 'reelShare';
    text: string | null;
    reel: SharedReel;
  };

export type StoryShareMessage = MessageBaseFields &
  ActionMethods & {
    type: 'storyShare';
    text: string | null;
    story: SharedStory;
  };

export type VoiceMediaMessage = MessageBaseFields &
  ActionMethods & {
    type: 'voiceMedia';
    audioUrl: string;
    duration: number;
  };

export type AnimatedMediaMessage = MessageBaseFields &
  ActionMethods & {
    type: 'animatedMedia';
    gifUrl: string;
    width: number;
    height: number;
  };

export type RavenMediaMessage = MessageBaseFields &
  ActionMethods & {
    type: 'ravenMedia';
    mediaUrl: string | null;
    mediaType: 'image' | 'video';
    viewMode: 'once' | 'replayable' | 'permanent';
    expiresAt: Date | null;
    seen: boolean;
  };

export type ClipMessage = MessageBaseFields &
  ActionMethods & {
    type: 'clip';
    text: string | null;
    clip: SharedReel;
  };

export type ActionLogMessage = MessageBaseFields &
  ActionMethods & {
    type: 'actionLog';
    actionText: string;
  };

export type PlaceholderMessage = MessageBaseFields &
  ActionMethods & {
    type: 'placeholder';
    placeholderText: string;
  };

export type UnknownMessage = MessageBaseFields &
  ActionMethods & {
    type: 'unknown';
    rawValue: unknown;
  };

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

function stubAction(name: string): () => Promise<never> {
  return function (this: { client?: unknown }) {
    if (!this.client) {
      throw new Error(`Cannot ${name}: no client attached`);
    }
    throw new Error(`${name} is not implemented yet`);
  };
}

function buildMessage<T extends { type: MessageType }>(
  baseFields: MessageBaseFields,
  client: unknown,
  variant: T,
): MessageBaseFields & ActionMethods & T {
  const msg = {
    ...baseFields,
    ...variant,
    reply: stubAction('reply'),
    edit: stubAction('edit'),
    react: stubAction('react'),
    unreact: stubAction('unreact'),
    delete: stubAction('delete'),
  };
  Object.defineProperty(msg, 'client', {
    value: client,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  return msg;
}

/**
 * Create a Message from raw API data.
 * Returns the correct variant based on item_type.
 */
export function createMessage(
  data: RawMessage,
  threadId: string,
  author: User,
  client: unknown,
): Message {
  const mappedType: MessageType = ITEM_TYPE_MAP[data.item_type] ?? 'unknown';

  const baseFields: MessageBaseFields = {
    id: data.item_id,
    threadId,
    author,
    timestamp: new Date(Number(data.timestamp) / 1000),
    reactions: parseReactions(data.reactions),
    repliedTo: parseRepliedTo(data.replied_to_message),
    rawType: data.item_type,
  };

  switch (mappedType) {
    case 'text':
      return buildMessage(baseFields, client, {
        type: 'text' satisfies typeof mappedType,
        text: data.text ?? '',
      });

    case 'media': {
      const candidate = data.media?.image_versions2?.candidates?.[0];
      return buildMessage(baseFields, client, {
        type: 'media' satisfies typeof mappedType,
        mediaUrl: candidate?.url ?? '',
        mediaType: data.media?.media_type === 2 ? 'video' : 'image',
        width: candidate?.width ?? 0,
        height: candidate?.height ?? 0,
      });
    }

    case 'like':
      return buildMessage(baseFields, client, {
        type: 'like' satisfies typeof mappedType,
      });

    case 'link': {
      const linkContext = data.link?.link_context;
      return buildMessage(baseFields, client, {
        type: 'link' satisfies typeof mappedType,
        text: data.link?.text ?? data.text ?? null,
        url: linkContext?.link_url ?? '',
        title: linkContext?.link_title ?? null,
        summary: linkContext?.link_summary ?? null,
        thumbnailUrl: linkContext?.link_image_url ?? null,
      });
    }

    case 'mediaShare': {
      const ms = data.media_share;
      return buildMessage(baseFields, client, {
        type: 'mediaShare' satisfies typeof mappedType,
        text: data.text ?? null,
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
      return buildMessage(baseFields, client, {
        type: 'reelShare' satisfies typeof mappedType,
        text: data.reel_share?.text ?? data.text ?? null,
        reel: {
          id: String(data.reel_share?.media?.id ?? ''),
          videoUrl: data.reel_share?.media?.video_versions?.[0]?.url ?? '',
          thumbnailUrl: data.reel_share?.media?.image_versions2?.candidates?.[0]?.url ?? '',
          owner: author,
        },
      });

    case 'storyShare':
      return buildMessage(baseFields, client, {
        type: 'storyShare' satisfies typeof mappedType,
        text: data.text ?? null,
        story: {
          id: String(data.story_share?.media?.id ?? ''),
          mediaUrl: data.story_share?.media?.image_versions2?.candidates?.[0]?.url ?? null,
          thumbnailUrl: data.story_share?.media?.image_versions2?.candidates?.[0]?.url ?? null,
          owner: author,
          isExpired: data.story_share?.is_reel_persisted === false,
        },
      });

    case 'voiceMedia':
      return buildMessage(baseFields, client, {
        type: 'voiceMedia' satisfies typeof mappedType,
        audioUrl: data.voice_media?.media?.audio?.audio_src ?? '',
        duration: data.voice_media?.media?.audio?.duration ?? 0,
      });

    case 'animatedMedia': {
      const fh = data.animated_media?.images?.fixed_height;
      return buildMessage(baseFields, client, {
        type: 'animatedMedia' satisfies typeof mappedType,
        gifUrl: fh?.url ?? '',
        width: Number(fh?.width ?? 0),
        height: Number(fh?.height ?? 0),
      });
    }

    case 'ravenMedia':
      return buildMessage(baseFields, client, {
        type: 'ravenMedia' satisfies typeof mappedType,
        mediaUrl: data.visual_media?.media?.image_versions2?.candidates?.[0]?.url ?? null,
        mediaType: data.visual_media?.media?.media_type === 2 ? 'video' : 'image',
        viewMode: 'once',
        expiresAt: null,
        seen: false,
      });

    case 'clip':
      return buildMessage(baseFields, client, {
        type: 'clip' satisfies typeof mappedType,
        text: data.text ?? null,
        clip: {
          id: String(data.clip?.clip?.id ?? ''),
          videoUrl: data.clip?.clip?.video_versions?.[0]?.url ?? '',
          thumbnailUrl: data.clip?.clip?.image_versions2?.candidates?.[0]?.url ?? '',
          owner: author,
        },
      });

    case 'actionLog':
      return buildMessage(baseFields, client, {
        type: 'actionLog' satisfies typeof mappedType,
        actionText: data.action_log?.description ?? '',
      });

    case 'placeholder':
      return buildMessage(baseFields, client, {
        type: 'placeholder' satisfies typeof mappedType,
        placeholderText: data.placeholder?.message ?? '',
      });

    default:
      return buildMessage(baseFields, client, {
        type: 'unknown' satisfies typeof mappedType,
        rawValue: data,
      });
  }
}
