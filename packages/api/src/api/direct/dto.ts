export type DirectSendResponseDto = {
  action: string;
  status_code: string;
  payload: {
    client_context: string;
    item_id: string;
    timestamp: string;
    thread_id: string;
  };
  message_metadata: {
    client_context: string;
    item_id: string;
    timestamp: string;
    thread_id: string;
    participant_ids: string[];
  }[];
  status: string;
};

export type DirectUpdateTitleResponseDto = {
  status: string;
  thread: unknown;
};

export type DirectAddUserResponseDto = {
  status: string;
  thread: unknown;
};

export interface DirectInboxResponseDto {
  inbox: DirectInboxDto;
  seq_id: number;
  snapshot_at_ms: number;
  pending_requests_total: number;
  most_recent_inviter: DirectThreadUserDto;
  status: string;
}

export type DirectInboxDto = {
  threads: DirectThreadDto[];
  has_older: boolean;
  unseen_count: number;
  unseen_count_ts: string;
  oldest_cursor: string;
  blended_inbox_enabled: boolean;
};

export type DirectThreadDto = {
  thread_id: string;
  thread_v2_id: string;
  users: DirectThreadUserDto[];
  left_users: unknown[];
  admin_user_ids: unknown[];
  items: DirectThreadItemDto[];
  last_activity_at: string;
  muted: boolean;
  is_pin: boolean;
  named: boolean;
  canonical: boolean;
  pending: boolean;
  archived: boolean;
  valued_request: boolean;
  thread_type: string;
  viewer_id: number;
  thread_title: string;
  pending_score: string;
  folder: number;
  vc_muted: boolean;
  is_group: boolean;
  mentions_muted: boolean;
  inviter: DirectThreadUserDto;
  has_older: boolean;
  has_newer: boolean;
  last_seen_at: unknown;
  newest_cursor: string;
  oldest_cursor: string;
  is_spam: boolean;
  last_permanent_item: DirectThreadItemDto;
};

export type DirectThreadUserDto = {
  pk: number;
  username: string;
  full_name: string;
  is_private: boolean;
  profile_pic_url: string;
  profile_pic_id?: string;
  friendship_status: {
    following: boolean;
    blocking: boolean;
    is_private: boolean;
    incoming_request: boolean;
    outgoing_request: boolean;
    is_bestie: boolean;
  };
  is_verified: boolean;
  has_anonymous_profile_picture: boolean;
  is_directapp_installed: boolean;
};

export interface DirectThreadItemDto {
  item_id: string;
  user_id: number;
  timestamp: string;
  item_type: string;
  text?: string;
  link?: unknown;
  client_context?: string;
  reel_share?: unknown;
  profile?: unknown;
  placeholder?: unknown;
}
