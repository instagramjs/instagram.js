import { APP_ID } from '../constants';
import type { LsTask, LsRequest } from './types';
import { LS_REQUEST_TYPE, TASK_LABELS } from './types';

type SendMessageOptions = {
  threadId: string;
  text: string;
  otid: string;
  replyToId?: string | undefined;
  markRead?: boolean | undefined;
};

/** Build a send message task (label 46). */
export function buildSendMessageTask(options: SendMessageOptions): LsTask {
  const payload: Record<string, unknown> = {
    thread_id: Number(options.threadId),
    otid: options.otid,
    source: 65537,
    send_type: 1,
    sync_group: 1,
    mark_thread_read: options.markRead ? 1 : 0,
    text: options.text,
    initiating_source: 1,
    skip_url_preview_gen: 0,
    text_has_links: options.text.includes('http') ? 1 : 0,
    multitab_env: 0,
  };

  if (options.replyToId) {
    payload['reply_metadata'] = {
      reply_source_id: options.replyToId,
      reply_source_type: 1,
      reply_type: 0,
      reply_source_attachment_id: null,
    };
  }

  return {
    label: String(TASK_LABELS.SEND_MESSAGE),
    payload,
    queue_name: String(options.threadId),
    task_id: 0,
    failure_count: null,
  };
}

/** Build a mark-as-read task (label 21). */
export function buildMarkReadTask(threadId: string, lastReadWatermarkTs: string): LsTask {
  return {
    label: String(TASK_LABELS.MARK_READ),
    payload: {
      thread_id: Number(threadId),
      last_read_watermark_ts: Number(lastReadWatermarkTs),
      sync_group: 1,
    },
    queue_name: threadId,
    task_id: 0,
    failure_count: null,
  };
}

/** Build a primary search task (label 30). */
export function buildSearchPrimaryTask(query: string): LsTask {
  return {
    label: String(TASK_LABELS.SEARCH_PRIMARY),
    payload: {
      query,
      supported_types: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      session_id: null,
      surface_type: 15,
      selected_participants: null,
      group_id: null,
      community_id: null,
      thread_id: null,
      query_id: null,
    },
    queue_name: 'search_primary',
    task_id: 0,
    failure_count: null,
  };
}

/** Build a secondary search task (label 31). */
export function buildSearchSecondaryTask(query: string): LsTask {
  return {
    label: String(TASK_LABELS.SEARCH_SECONDARY),
    payload: {
      query,
      supported_types: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      session_id: null,
      surface_type: 15,
      selected_participants: null,
      group_id: null,
      community_id: null,
      thread_id: null,
      query_id: null,
    },
    queue_name: 'search_secondary',
    task_id: 0,
    failure_count: null,
  };
}

/** Build a fetch-request-queue task (label 145). */
export function buildFetchRequestQueueTask(): LsTask {
  return {
    label: String(TASK_LABELS.FETCH_REQUEST_QUEUE),
    payload: {
      is_after: 0,
      parent_thread_key: -1,
      reference_thread_key: 0,
      reference_activity_timestamp: 9999999999999,
      additional_pages_to_fetch: 0,
      cursor: null,
      messaging_tag: null,
      sync_group: 1,
    },
    queue_name: 'trq',
    task_id: 0,
    failure_count: null,
  };
}

/** Build a fetch-contact task (label 207). */
export function buildFetchContactTask(contactId: string): LsTask {
  return {
    label: String(TASK_LABELS.FETCH_CONTACT),
    payload: { contact_id: Number(contactId) },
    queue_name: 'cpq_v2',
    task_id: 0,
    failure_count: null,
  };
}

/** Build a fetch-thread task (label 209). */
export function buildFetchThreadTask(threadFbid: string): LsTask {
  return {
    label: String(TASK_LABELS.FETCH_THREAD),
    payload: {
      thread_fbid: Number(threadFbid),
      force_upsert: 0,
      use_open_messenger_transport: 0,
      sync_group: 1,
      metadata_only: 0,
      preview_only: 0,
    },
    queue_name: threadFbid,
    task_id: 0,
    failure_count: null,
  };
}

type FetchMessageRangeOptions = {
  threadKey: string;
  referenceTimestampMs?: string;
  referenceMessageId?: string;
  cursor?: string;
};

/** Build a fetch-message-range task (label 228). */
export function buildFetchMessageRangeTask(options: FetchMessageRangeOptions): LsTask {
  return {
    label: String(TASK_LABELS.FETCH_MESSAGE_RANGE),
    payload: {
      thread_key: Number(options.threadKey),
      direction: 0,
      reference_timestamp_ms: options.referenceTimestampMs ? Number(options.referenceTimestampMs) : 0,
      reference_message_id: options.referenceMessageId ?? '',
      sync_group: 1,
      cursor: options.cursor ?? '',
    },
    queue_name: `mrq.${options.threadKey}`,
    task_id: 0,
    failure_count: null,
  };
}

/** Build an add-participant task (label 130). */
export function buildAddParticipantTask(threadId: string, participants: string[]): LsTask {
  return {
    label: String(TASK_LABELS.ADD_PARTICIPANT),
    payload: {
      participants: participants.map(Number),
      send_payload: {
        thread_id: Number(threadId),
        otid: '0',
        source: 0,
        send_type: 8,
      },
    },
    queue_name: threadId,
    task_id: 0,
    failure_count: null,
  };
}

/** Build a pin/unpin message task (label 751). */
export function buildPinMessageTask(threadKey: string, messageId: string, pinned: boolean): LsTask {
  return {
    label: String(TASK_LABELS.PIN_MESSAGE),
    payload: {
      thread_key: Number(threadKey),
      message_id: messageId,
      pinned_message_state: pinned ? 1 : 0,
    },
    queue_name: 'set_pinned_message_search',
    task_id: 0,
    failure_count: null,
  };
}

type LsEnvelopeOptions = {
  tasks: LsTask[];
  epochId: string;
  requestId: number;
  versionId?: string;
};

/**
 * Wrap tasks into the double-JSON-encoded `/ls_req` envelope.
 * Each field that needs string-encoding is JSON.stringify'd per the wire format spec.
 */
export function buildLsRequestEnvelope(options: LsEnvelopeOptions): LsRequest {
  const encodedTasks = options.tasks.map((task, i) => ({
    failure_count: null,
    label: task.label,
    payload: JSON.stringify(task.payload),
    queue_name: JSON.stringify(task.queue_name),
    task_id: i,
  }));

  const innerPayload = {
    epoch_id: Number(options.epochId),
    tasks: encodedTasks,
    version_id: options.versionId ?? '24585299697835063',
  };

  return {
    app_id: APP_ID,
    payload: JSON.stringify(innerPayload),
    request_id: options.requestId,
    type: LS_REQUEST_TYPE.TASK,
  };
}

type LsSyncOptions = {
  database: number;
  epochId: string;
  requestId: number;
  lastAppliedCursor?: string | null;
  syncParams?: Record<string, unknown> | null;
  versionId?: string;
};

/** Build a sync request envelope (type 1 — initial sync / reconnect). */
export function buildLsSyncEnvelope(options: LsSyncOptions): LsRequest {
  const innerPayload: Record<string, unknown> = {
    database: options.database,
    epoch_id: Number(options.epochId),
    failure_count: null,
    last_applied_cursor: options.lastAppliedCursor ?? null,
    sync_params: options.syncParams ? JSON.stringify(options.syncParams) : null,
    version: options.versionId ?? '24585299697835063',
  };

  return {
    app_id: APP_ID,
    payload: JSON.stringify(innerPayload),
    request_id: options.requestId,
    type: LS_REQUEST_TYPE.SYNC,
  };
}

type LsTypingOptions = {
  threadKey: string;
  isGroupThread: boolean;
  isTyping: boolean;
};

/** Build a typing indicator request (type 2 — foreground state). */
export function buildLsTypingEnvelope(options: LsTypingOptions, requestId: number): LsRequest {
  const innerPayload = {
    label: '3',
    payload: JSON.stringify({
      thread_key: Number(options.threadKey),
      is_group_thread: options.isGroupThread ? 1 : 0,
      is_typing: options.isTyping ? 1 : 0,
      attribution: 0,
    }),
  };

  return {
    app_id: APP_ID,
    payload: JSON.stringify(innerPayload),
    request_id: requestId,
    type: LS_REQUEST_TYPE.FOREGROUND,
  };
}
