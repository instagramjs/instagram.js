import { type ImageVersions2Dto, type VideoVersionDto } from "./common";

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

export type DirectInboxResponseDto = {
  viewer: {
    pk: number;
    pk_id: string;
    full_name: string;
    username: string;
    short_name: string;
    profile_pic_id?: string;
    profile_pic_url?: string;
    is_verified: boolean;
    is_private: boolean;
    has_anonymous_profile_picture: boolean;
  };
  inbox: DirectInboxDto;
  seq_id: number;
  snapshot_at_ms: number;
  pending_requests_total: number;
  has_pending_top_requests: boolean;
  unread_pending_requests: number;
  status: string;
};

export type DirectInboxDto = {
  threads: DirectThreadDto[];
  has_older: boolean;
  unseen_count: number;
  unseen_count_ts: string;
  oldest_cursor?: string;
  blended_inbox_enabled: boolean;
};

export type DirectThreadDto = {
  has_older: boolean;
  has_newer: boolean;
  pending: boolean;
  items: DirectItemDto[];
  canonical: boolean;
  thread_id: string;
  thread_v2_id: string;
  users: DirectThreadUserDto[];
  viewer_id: number;
  muted: boolean;
  vc_muted: boolean;
  encoded_server_data_info: string;
  admin_user_ids: number[];
  approval_required_for_new_members: boolean;
  archived: boolean;
  thread_has_audio_only_call: boolean;
  pending_user_ids: number[];
  oldest_cursor: string;
  newest_cursor: string;
  last_permanent_item: DirectItemDto | null;
  thread_title: string;
  thread_label: number;
  is_group?: boolean;
  is_spam?: boolean;
  spam?: boolean;
  last_activity_at: number;
  last_non_sender_item_at: number;
  marked_as_unread: boolean;
  assigned_admin_id: number;
  next_cursor: string;
  prev_cursor: string;
  thread_context_items: {
    text: string;
    type: number;
  }[];
  last_seen_at: Record<
    string,
    {
      item_id: string;
      timestamp: string;
      created_at: string;
      shh_seen_state: unknown;
    }
  >;
  system_folder: number;
  inviter: DirectThreadUserDto;
  read_state: number;
  folder: number;
  mentions_muted: boolean;
  named?: boolean;
  is_close_friend_thread: boolean;
  uq_seq_id: number;
  video_call_id?: unknown;
  is_stale: boolean;
  is_pin?: boolean;
};

export type DirectThreadUserDto = {
  pk: number;
  pk_id: string;
  full_name: string;
  username: string;
  short_name: string;
  profile_pic_id?: string;
  profile_pic_url?: string;
  is_verified: boolean;
  is_private: boolean;
  has_anonymous_profile_picture: boolean;
  friendship_status: {
    following: boolean;
    is_bestie: boolean;
    is_feed_favorite: boolean;
    is_restricted: boolean;
    outgoing_request: boolean;
    incoming_request: boolean;
    muting: boolean;
    blocking: boolean;
    is_messaging_pseudo_blocking: boolean;
    is_private: boolean;
    is_viewer_unconnected: boolean;
    reachability_status: number;
  };
  is_shared_account: boolean;
};

export type DirectItemDto = {
  item_id: string;
  message_id: string;
  user_id: number;
  timestamp: number;
  client_context?: string;
  send_attribution?: string;
  is_sent_by_viewer: boolean;
  uq_seq_id: number;
  item_type: string;
  text?: string;
  link?: unknown;
  clip?: DirectItemClipShareDto;
  media_share?: DirectItemMediaShareDto;
  story_share?: DirectItemStoryShareDto;
  xma_profile?: DirectItemXmaProfileShareDto;
  placeholder?: DirectItemPlaceholderDto;
};

export type DirectItemMediaShareDto = {
  taken_at: number;
  pk: number;
  id: string;
  device_timestamp: number;
  caption_is_edited: boolean;
  deleted_reason: number;
  share_count_disabled: boolean;
  like_and_view_counts_disabled: boolean;
  usertags?: {
    in: {
      position: [number, number];
      show_category_of_user: boolean;
      user: {
        pk: number;
        pk_id: string;
        id: string;
        username: string;
        full_name: string;
        is_private: boolean;
        is_verified: boolean;
        profile_pic_id?: string;
        profile_pic_url?: string;
      };
    }[];
  };
  photo_of_you?: boolean;
  media_type: number;
  code: string;
  caption: {
    text: string;
    user: {
      pk: number;
      pk_id: string;
      id: string;
      username: string;
      full_name: string;
      is_private: boolean;
      is_verified: boolean;
      profile_pic_id?: string;
      profile_pic_url?: string;
    };
  } | null;
  coauthor_producers: {
    pk: number;
    pk_id: string;
    id: string;
    username: string;
    full_name: string;
    is_private: boolean;
    is_verified: boolean;
    profile_pic_id?: string;
    profile_pic_url?: string;
  }[];
  user: {
    pk: number;
    pk_id: string;
    id: string;
    username: string;
    full_name: string;
    is_private: boolean;
    is_verified: boolean;
    profile_pic_id?: string;
    profile_pic_url?: string;
    account_type: number;
    friendship_status: {
      following: boolean;
      is_bestie: boolean;
      is_restricted: boolean;
    };
    has_anonymous_profile_picture: boolean;
  };
  owner: {
    pk: number;
    pk_id: string;
    id: string;
    username: string;
    full_name: string;
    is_private: boolean;
    is_verified: boolean;
    profile_pic_id?: string;
    profile_pic_url?: string;
    account_type: number;
    friendship_status: {
      following: boolean;
      is_bestie: boolean;
      is_restricted: boolean;
    };
    has_anonymous_profile_picture: boolean;
  };
  image_versions2: ImageVersions2Dto;
  carousel_media_count?: number;
  carousel_media?: {
    id: string;
    pk: number;
    taken_at: number;
    media_type: number;
    image_versions2: ImageVersions2Dto;
    video_versions?: VideoVersionDto[];
    original_width: number;
    original_height: number;
    usertags?: {
      in: {
        position: [number, number];
        show_category_of_user: boolean;
        user: {
          pk: number;
          pk_id: string;
          id: string;
          username: string;
          full_name: string;
          is_private: boolean;
          is_verified: boolean;
          profile_pic_id?: string;
          profile_pic_url?: string;
        };
      }[];
    };
  }[];
  carousel_share_child_media_id?: string;
  original_width: number;
  original_height: number;
  music_metadata: {
    audio_type: string | null;
    music_canonical_id: string | null;
    music_info: {
      music_canonical_id: null | string;
      music_asset_info: {
        allows_saving: boolean;
        artist_id: string;
        audio_asset_id: string;
        audio_cluster_id: string;
        cover_artwork_thumbnail_uri: string;
        cover_artwork_uri: string;
        display_artist: string;
        duration_in_ms: number;
        fast_start_progressive_download_url: string;
        has_lyrics: boolean;
        highlight_start_times_in_ms: number[];
        id: string;
        ig_username: string;
        is_explicit: boolean;
        progressive_download_url: string;
        sanitized_title: null | string;
        subtitle: string;
        title: string;
      };
      music_consumption_info: {
        allow_media_creation_with_music: boolean;
        formatted_clips_media_count: null | number;
        ig_artist: {
          pk: number;
          pk_id: string;
          id: string;
          username: string;
          full_name: string;
          is_private: boolean;
          is_verified: boolean;
          profile_pic_id?: string;
          profile_pic_url?: string;
        };
        is_bookmarked: boolean;
        is_trending_in_clips: boolean;
      };
    };
  };
  has_liked: boolean;
  like_count: number;
  video_codec?: string;
  number_of_qualities?: number;
  video_versions?: VideoVersionDto[];
  video_duration?: number;
  has_audio?: boolean;
};

export type DirectItemClipShareDto = {
  clip: Omit<
    DirectItemMediaShareDto,
    "carousel_media_count" | "carousel_media" | "carousel_share_child_media_id"
  > &
    Required<
      Pick<
        DirectItemMediaShareDto,
        "video_codec" | "video_versions" | "video_duration" | "has_audio"
      >
    >;
};

export type DirectItemStoryShareDto = {
  media: Omit<
    DirectItemMediaShareDto,
    "carousel_media_count" | "carousel_media" | "carousel_share_child_media_id"
  >;
  reel_id: string;
  reel_type: string;
  is_reel_persisted: boolean;
  text: string;
};

export type DirectItemXmaProfileShareDto = {
  header_icon_url_info: {
    url: string;
    fallback: {
      url: string;
    };
    width: number;
    height: number;
    mime_type: string;
  };
  header_title_text: string;
  header_subtitle_text: string;
  target_url: string;
};

export type DirectItemPlaceholderDto = {
  text: string;
};
