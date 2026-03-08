import type { DeltaResult } from '../delta-types';
import { bool, num, str } from './sp-helpers';
import type { LsValue, SpCall } from './types';

/**
 * Dispatch a stored procedure call to the appropriate handler,
 * returning a typed delta event for the client to apply.
 *
 * Returns null for SPs that don't produce user-facing events
 * (sync bookkeeping, task management, etc.).
 */
export function dispatchSp(call: SpCall): DeltaResult | null {
  const handler = SP_HANDLERS[call.name];
  if (!handler) return null;
  return handler(call.args);
}

type SpHandler = (args: LsValue[]) => DeltaResult | null;

const SP_HANDLERS: Record<string, SpHandler> = {
  insertMessage: handleInsertMessage,
  upsertMessage: handleUpsertMessage,
  deleteThenInsertMessage: handleInsertMessage,
  deleteMessage: handleDeleteMessage,
  upsertReaction: handleUpsertReaction,
  deleteReaction: handleDeleteReaction,
  updateTypingIndicator: handleTypingIndicator,
  updateReadReceipt: handleReadReceipt,
  syncUpdateThreadName: handleSyncUpdateThreadName,
  updateThreadMuteSetting: handleUpdateThreadMuteSetting,
  deleteThread: handleDeleteThread,
};

// insertMessage: 81 args
// arg0: text, arg3: threadKey, arg5: timestampMs, arg8: messageId,
// arg9: otid, arg10: senderId, arg12: isRead
function handleInsertMessage(args: LsValue[]): DeltaResult {
  const text = args[0];
  const threadKey = num(args, 3);
  const timestampMs = num(args, 5);
  const messageId = str(args, 8);
  const senderId = num(args, 10);

  return {
    type: 'newMessage',
    threadId: threadKey,
    raw: {
      item_id: messageId,
      user_id: senderId,
      timestamp: timestampMs ? String(Number(timestampMs) * 1000) : '0',
      item_type: 'text',
      ...(typeof text === 'string' ? { text } : {}),
    },
    userDict: null,
  };
}

// upsertMessage: 82 args — same layout as insertMessage for our purposes
// Additional fields: arg19: replySourceType, arg23: replySourceId,
// arg31: mediaUrl, arg35: mimeType
function handleUpsertMessage(args: LsValue[]): DeltaResult {
  const text = args[0];
  const threadKey = num(args, 3);
  const timestampMs = num(args, 5);
  const messageId = str(args, 8);
  const senderId = num(args, 10);

  const raw: DeltaResult & { type: 'newMessage' } = {
    type: 'newMessage',
    threadId: threadKey,
    raw: {
      item_id: messageId,
      user_id: senderId,
      timestamp: timestampMs ? String(Number(timestampMs) * 1000) : '0',
      item_type: 'text',
      ...(typeof text === 'string' ? { text } : {}),
    },
    userDict: null,
  };

  // Check for media attachment (arg31 = media URL)
  const mediaUrl = args[31];
  if (typeof mediaUrl === 'string' && mediaUrl.length > 0) {
    const mimeType = str(args, 35);
    const width = typeof args[33] === 'string' ? Number(args[33]) : typeof args[33] === 'number' ? args[33] : 0;
    const height = typeof args[34] === 'string' ? Number(args[34]) : typeof args[34] === 'number' ? args[34] : 0;
    const isVideo = mimeType.startsWith('video/');
    raw.raw.item_type = 'media';
    raw.raw.media = {
      media_type: isVideo ? 2 : 1,
      image_versions2: { candidates: [{ url: mediaUrl, width, height }] },
    };
  }

  // Check for reply (arg23 = reply source message id)
  const replySourceId = args[23];
  if (typeof replySourceId === 'string' && replySourceId.length > 0) {
    raw.raw.replied_to_message = { item_id: replySourceId, user_id: '', timestamp: '0' };
  }

  return raw;
}

// deleteMessage: 2 args — arg0: threadKey, arg1: messageId
export function handleDeleteMessage(args: LsValue[]): DeltaResult {
  return {
    type: 'deleteMessage',
    threadId: num(args, 0),
    messageId: str(args, 1),
  };
}

// upsertReaction: 7 args
// arg0: threadKey, arg1: timestampMs, arg2: messageId, arg3: senderId,
// arg4: emoji, arg5: type(80), arg6: reactionTimestamp
export function handleUpsertReaction(args: LsValue[]): DeltaResult {
  return {
    type: 'reaction',
    action: 'add',
    threadId: num(args, 0),
    messageId: str(args, 2),
    senderId: num(args, 3),
    emoji: str(args, 4),
  };
}

// deleteReaction: 3 args — arg0: threadKey, arg1: messageId, arg2: senderId
export function handleDeleteReaction(args: LsValue[]): DeltaResult {
  return {
    type: 'reaction',
    action: 'remove',
    threadId: num(args, 0),
    messageId: str(args, 1),
    senderId: num(args, 2),
    emoji: '',
  };
}

// updateTypingIndicator: 4 args
// arg0: threadKey, arg1: senderId, arg2: isTyping, arg3: null
export function handleTypingIndicator(args: LsValue[]): DeltaResult {
  return {
    type: 'typing',
    threadId: num(args, 0),
    senderId: num(args, 1),
    isTyping: bool(args, 2),
  };
}

// updateReadReceipt: 4 args
// arg0: watermarkTs, arg1: threadKey, arg2: senderId, arg3: readTimestamp
export function handleReadReceipt(args: LsValue[]): DeltaResult {
  const watermarkTs = num(args, 0);
  return {
    type: 'readReceipt',
    threadId: num(args, 1),
    userId: num(args, 2),
    timestamp: watermarkTs ? new Date(Number(watermarkTs)) : new Date(),
  };
}

// syncUpdateThreadName: 3 args — arg0: threadKey, arg1: name, arg2: unknown
export function handleSyncUpdateThreadName(args: LsValue[]): DeltaResult {
  return {
    type: 'threadUpdate',
    threadId: num(args, 0),
    name: str(args, 1),
  };
}

// updateThreadMuteSetting: 2 args — arg0: isMuted, arg1: threadKey
export function handleUpdateThreadMuteSetting(args: LsValue[]): DeltaResult {
  return {
    type: 'threadUpdate',
    threadId: num(args, 1),
    muted: bool(args, 0),
  };
}

// deleteThread: 2 args — arg0: threadKey, arg1: unknown
export function handleDeleteThread(args: LsValue[]): DeltaResult {
  return {
    type: 'threadDelete',
    threadId: num(args, 0),
  };
}
