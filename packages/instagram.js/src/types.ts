import type { Message } from './models/message';
import type { Thread } from './models/thread';
import type { User } from './models/user';


export type ClientOptions = {
  reconnect?: boolean;
  reconnectInterval?: number;
  reconnectMaxRetries?: number;
  syncOnConnect?: boolean;
  maxCachedThreads?: number;
  maxCachedMessages?: number;
  mqttKeepAlive?: number;
  docIds?: Partial<DocIdMap>;
};

export type DocIdMap = Record<string, string>;


export type Cookies = {
  sessionid: string;
  csrftoken: string;
  ds_user_id: string;
  mid: string;
};

export type SessionData = {
  cookies: Cookies;
  fbDtsg: string;
  lsd: string;
  rolloutHash: string;
  spinR: string;
  spinB: string;
  spinT: string;
  hs: string;
  bloksVersion: string;
  deviceId: string;
  sessionId: string;
  igScopedId: string;
  seqId: number;
};


export type RawDelta = {
  op: 'add' | 'remove' | 'replace';
  path: string;
  value: unknown;
  seqId: number;
};

export type RawThread = {
  thread_id: string;
  thread_title: string | null;
  users: RawUser[];
  left_users: RawUser[];
  items: RawMessage[];
  read_state: number;
  is_group: boolean;
  muted: boolean;
  admin_user_ids: string[];
  thread_v2_id?: string;
  [key: string]: unknown;
};

export type RawMediaCandidate = {
  url: string;
  width: number;
  height: number;
};

export type RawMedia = {
  image_versions2?: { candidates?: RawMediaCandidate[] };
  media_type?: number;
};

export type RawLink = {
  text?: string;
  link_context?: {
    link_url?: string;
    link_title?: string;
    link_summary?: string;
    link_image_url?: string;
  };
};

export type RawMediaShare = {
  id?: string | number;
  code?: string;
  media_type?: number;
  image_versions2?: { candidates?: RawMediaCandidate[] };
  caption?: { text?: string };
  user?: RawUser;
};

export type RawReelShare = {
  text?: string;
  media?: {
    id?: string | number;
    video_versions?: Array<{ url: string }>;
    image_versions2?: { candidates?: RawMediaCandidate[] };
    user?: RawUser;
  };
};

export type RawStoryShare = {
  media?: {
    id?: string | number;
    image_versions2?: { candidates?: RawMediaCandidate[] };
    video_versions?: Array<{ url: string }>;
    user?: RawUser;
  };
  is_reel_persisted?: boolean;
};

export type RawVoiceMedia = {
  media?: {
    audio?: {
      audio_src?: string;
      duration?: number;
    };
  };
};

export type RawAnimatedMedia = {
  images?: {
    fixed_height?: {
      url?: string;
      width?: string | number;
      height?: string | number;
    };
  };
};

export type RawVisualMedia = {
  media?: {
    media_type?: number;
    image_versions2?: { candidates?: RawMediaCandidate[] };
  };
  view_mode?: string;
  expiring_at?: number;
  seen_count?: number;
};

export type RawClip = {
  clip?: {
    id?: string | number;
    video_versions?: Array<{ url: string }>;
    image_versions2?: { candidates?: RawMediaCandidate[] };
    user?: RawUser;
  };
};

export type RawActionLog = {
  description?: string;
};

export type RawPlaceholder = {
  message?: string;
};

export type RawMessage = {
  item_id: string;
  user_id: string | number;
  timestamp: string | number;
  item_type: string;
  text?: string;
  media?: RawMedia;
  link?: RawLink;
  media_share?: RawMediaShare;
  reel_share?: RawReelShare;
  story_share?: RawStoryShare;
  voice_media?: RawVoiceMedia;
  animated_media?: RawAnimatedMedia;
  visual_media?: RawVisualMedia;
  clip?: RawClip;
  action_log?: RawActionLog;
  placeholder?: RawPlaceholder;
  reactions?: {
    likes?: Array<{
      sender_id: string | number;
      emoji: string;
      timestamp: string | number;
    }>;
  };
  replied_to_message?: {
    item_id: string;
    text?: string;
    user_id: string | number;
    timestamp: string | number;
  };
  [key: string]: unknown;
};

export type RawUser = {
  pk: string | number;
  pk_id?: string;
  username?: string;
  full_name?: string;
  profile_pic_url?: string;
  is_verified?: boolean;
  [key: string]: unknown;
};


export type MessageType =
  | 'text'
  | 'media'
  | 'like'
  | 'link'
  | 'mediaShare'
  | 'reelShare'
  | 'storyShare'
  | 'voiceMedia'
  | 'animatedMedia'
  | 'ravenMedia'
  | 'clip'
  | 'actionLog'
  | 'placeholder'
  | 'unknown';


export type Reaction = {
  emoji: string;
  userId: string;
  timestamp: Date;
};


export type RepliedMessage = {
  id: string;
  text: string | null;
  userId: string;
  timestamp: Date;
};


export type SharedPost = {
  id: string;
  code: string;
  mediaType: 'image' | 'video' | 'carousel';
  thumbnailUrl: string;
  caption: string | null;
  user: User;
};

export type SharedReel = {
  id: string;
  videoUrl: string;
  thumbnailUrl: string;
  owner: User;
};

export type SharedStory = {
  id: string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  owner: User;
  isExpired: boolean;
};


export type ThreadParticipant = {
  user: User;
  isAdmin: boolean;
  nickname: string | null;
};


export type FriendshipStatus = {
  following: boolean;
  followedBy: boolean;
  blocking: boolean;
  muting: boolean;
};

export type RecipientUser = {
  id: string;
  username: string;
  fullName: string;
  profilePicUrl: string;
  isVerified: boolean;
  isPrivate: boolean;
  friendship: FriendshipStatus;
};

export type RecipientThread = {
  threadId: string;
  title: string;
  isGroup: boolean;
  imageUrl: string | null;
  users: RecipientUser[];
};

export type RecipientSearchResult = {
  users: RecipientUser[];
  threads: RecipientThread[];
};

export type MatchRange = {
  offset: number;
  length: number;
};

export type MessageSearchResult = {
  threadId: string;
  messageId: string;
  senderId: string;
  text: string;
  timestamp: Date;
  matchRanges: MatchRange[];
  thread: {
    threadId: string;
    title: string;
    isGroup: boolean;
  };
};

export type MessageSearchResponse = {
  results: MessageSearchResult[];
  hasMore: boolean;
  nextOffset: number | null;
};

export type SearchOptions = {
  offset?: number;
};


export type MessageDeleteEvent = {
  messageId: string;
  message: Message | null;
  thread: Thread;
  timestamp: Date;
};

export type MessageEditEvent = {
  message: Message;
  thread: Thread;
  oldText: string | null;
  timestamp: Date;
};

export type TypingEvent = {
  thread: Thread;
  participant: ThreadParticipant;
  timestamp: Date;
};

export type ReactionEvent = {
  message: Message | null;
  messageId: string;
  thread: Thread;
  participant: ThreadParticipant;
  emoji: string;
  timestamp: Date;
};

export type ReadReceiptEvent = {
  thread: Thread;
  participant: ThreadParticipant;
  messageId: string;
  timestamp: Date;
};

export type ThreadUpdateEvent = {
  thread: Thread;
  changes: Partial<{
    name: string;
    muted: boolean;
    adminChange: { participant: ThreadParticipant; isAdmin: boolean };
  }>;
};

export type ThreadDeleteEvent = {
  threadId: string;
};

export type DisconnectEvent = {
  reason: 'connection_lost' | 'auth_expired' | 'server_error' | 'destroyed';
  willReconnect: boolean;
};

