import type { DeltaResult } from '../delta-types';
import type { RawMessage } from '../types';
import {
  handleDeleteMessage,
  handleDeleteReaction,
  handleDeleteThread,
  handleReadReceipt,
  handleSyncUpdateThreadName,
  handleTypingIndicator,
  handleUpdateThreadMuteSetting,
  handleUpsertReaction,
} from './sp-dispatch';
import { num, str } from './sp-helpers';
import type { LsValue, SpCall } from './types';

/** Message SP names that produce newMessage deltas. */
const MESSAGE_SPS = new Set(['insertMessage', 'upsertMessage', 'deleteThenInsertMessage']);

/** Non-message SPs with direct handlers. */
const PASSTHROUGH_HANDLERS: Record<string, (args: LsValue[]) => DeltaResult> = {
  deleteMessage: handleDeleteMessage,
  upsertReaction: handleUpsertReaction,
  deleteReaction: handleDeleteReaction,
  updateTypingIndicator: handleTypingIndicator,
  updateReadReceipt: handleReadReceipt,
  syncUpdateThreadName: handleSyncUpdateThreadName,
  updateThreadMuteSetting: handleUpdateThreadMuteSetting,
  deleteThread: handleDeleteThread,
};

type AttachmentBucket = {
  xma: LsValue[][];
  blob: LsValue[][];
  attachment: LsValue[][];
  cta: LsValue[][];
  adminCta: LsValue[] | null;
};

type MessageEntry = {
  args: LsValue[];
  order: number;
};

type EditEntry = {
  messageId: string;
  newText: string;
  threadId: string;
  oldText: string | null;
};

/**
 * Process a batch of SP calls from a single `/ls_resp` response.
 *
 * Correlates attachment SPs with their parent message SPs by message ID,
 * then builds complete RawMessage objects with the correct item_type.
 */
export function dispatchBatch(calls: SpCall[]): DeltaResult[] {
  const results: DeltaResult[] = [];
  const messages = new Map<string, MessageEntry>();
  const attachments = new Map<string, AttachmentBucket>();
  const edits = new Map<string, EditEntry>();
  let order = 0;

  // Pass 1: collect message SPs and attachment SPs, dispatch passthrough SPs
  for (const call of calls) {
    const passthrough = PASSTHROUGH_HANDLERS[call.name];
    if (passthrough) {
      results.push(passthrough(call.args));
      continue;
    }

    if (MESSAGE_SPS.has(call.name)) {
      const messageId = str(call.args, 8);
      if (messageId) {
        messages.set(messageId, { args: call.args, order: order++ });
      }
      continue;
    }

    // editMessage: arg0=messageId, arg1=80, arg2=newText, arg3=1
    if (call.name === 'editMessage') {
      const messageId = str(call.args, 0);
      const newText = str(call.args, 2);
      if (messageId) {
        const existing = edits.get(messageId);
        if (existing) {
          existing.newText = newText;
        } else {
          edits.set(messageId, { messageId, newText, threadId: '', oldText: null });
        }
      }
      continue;
    }

    // handleRepliesOnMessageEdit: arg0=threadId, arg1=messageId
    if (call.name === 'handleRepliesOnMessageEdit') {
      const threadId = num(call.args, 0);
      const messageId = str(call.args, 1);
      if (messageId && threadId) {
        const existing = edits.get(messageId);
        if (existing) {
          existing.threadId = threadId;
        } else {
          edits.set(messageId, { messageId, newText: '', threadId, oldText: null });
        }
      }
      continue;
    }

    // updateOrInsertEditMessageHistory: arg0=messageId, arg1=threadId, arg3=oldText
    if (call.name === 'updateOrInsertEditMessageHistory') {
      const messageId = str(call.args, 0);
      const threadId = num(call.args, 1);
      const oldText = str(call.args, 3);
      if (messageId) {
        const existing = edits.get(messageId);
        if (existing) {
          existing.threadId = existing.threadId || threadId;
          existing.oldText = oldText || null;
        } else {
          edits.set(messageId, { messageId, newText: '', threadId, oldText: oldText || null });
        }
      }
      continue;
    }

    // applyAdminMessageCTAV2: admin/system messages (theme changes, etc.)
    // arg0: threadKey, arg2: messageId, arg4: action type
    if (call.name === 'applyAdminMessageCTAV2') {
      const messageId = str(call.args, 2);
      if (messageId) {
        let bucket = attachments.get(messageId);
        if (!bucket) {
          bucket = { xma: [], blob: [], attachment: [], cta: [], adminCta: null };
          attachments.set(messageId, bucket);
        }
        bucket.adminCta = call.args;
      }
      continue;
    }

    // Attachment SPs — bucket by parent message ID
    const bucket = getOrCreateBucket(attachments, call.name, call.args);
    if (bucket) continue;

    // Unknown SP — ignore
  }

  // Pass 2: build complete messages with correlated attachments
  const sortedMessages = [...messages.entries()].sort(
    (a, b) => a[1].order - b[1].order,
  );

  for (const [messageId, entry] of sortedMessages) {
    const bucket = attachments.get(messageId);
    const delta = buildMessageDelta(entry.args, bucket ?? null);
    results.push(delta);
  }

  // Pass 3: emit edit deltas
  for (const edit of edits.values()) {
    if (edit.messageId && edit.threadId) {
      results.push({
        type: 'editMessage',
        threadId: edit.threadId,
        messageId: edit.messageId,
        newText: edit.newText,
        oldText: edit.oldText,
      });
    }
  }

  return results;
}

function getOrCreateBucket(
  map: Map<string, AttachmentBucket>,
  spName: string,
  args: LsValue[],
): AttachmentBucket | null {
  let messageId: string;
  let field: keyof AttachmentBucket;

  switch (spName) {
    case 'insertXmaAttachment':
      messageId = str(args, 30);
      field = 'xma';
      break;
    case 'insertBlobAttachment':
      messageId = str(args, 32);
      field = 'blob';
      break;
    case 'insertAttachment':
      messageId = str(args, 37);
      field = 'attachment';
      break;
    case 'insertAttachmentCta':
      messageId = str(args, 5);
      field = 'cta';
      break;
    case 'insertAttachmentItem':
      // Sub-items keyed by arg4; we don't use these yet but collect to avoid orphan warnings
      return null;
    default:
      return null;
  }

  if (!messageId) return null;

  let bucket = map.get(messageId);
  if (!bucket) {
    bucket = { xma: [], blob: [], attachment: [], cta: [], adminCta: null };
    map.set(messageId, bucket);
  }
  bucket[field].push(args);
  return bucket;
}

function buildMessageDelta(
  msgArgs: LsValue[],
  bucket: AttachmentBucket | null,
): DeltaResult & { type: 'newMessage' } {
  const text = msgArgs[0];
  const threadKey = num(msgArgs, 3);
  const timestampMs = num(msgArgs, 5);
  const messageId = str(msgArgs, 8);
  const senderId = num(msgArgs, 10);

  const raw: RawMessage = {
    item_id: messageId,
    user_id: senderId,
    timestamp: timestampMs ? String(Number(timestampMs) * 1000) : '0',
    item_type: 'text',
    ...(typeof text === 'string' ? { text } : {}),
  };

  // Check for reply (arg23 = reply source message id)
  const replySourceId = msgArgs[23];
  if (typeof replySourceId === 'string' && replySourceId.length > 0) {
    raw.replied_to_message = { item_id: replySourceId, user_id: '', timestamp: '0' };
  }

  if (bucket) {
    applyAttachments(raw, bucket, msgArgs);
  } else {
    // Fallback: check upsertMessage inline media (arg31)
    applyInlineMedia(raw, msgArgs);
  }

  return { type: 'newMessage', threadId: threadKey, raw, userDict: null };
}

function applyAttachments(
  raw: RawMessage,
  bucket: AttachmentBucket,
  msgArgs: LsValue[],
): void {
  // Admin/system messages (action_log): theme changes, group updates, etc.
  if (bucket.adminCta) {
    const actionType = str(bucket.adminCta, 4);
    raw.item_type = 'action_log';
    // Use existing text as the description, or build from action type
    raw.action_log = {
      description: raw.text || actionType || '',
    };
    return;
  }

  // Blob attachments: direct media (images, videos, voice)
  if (bucket.blob.length > 0) {
    const blobArgs = bucket.blob[0]!;
    const mimeType = str(blobArgs, 6);

    if (mimeType.startsWith('audio/')) {
      raw.item_type = 'voice_media';
      raw.voice_media = {
        media: {
          audio: {
            audio_src: str(blobArgs, 3),
            duration: Number(num(blobArgs, 22)) || 0,
            waveform_data: parseWaveform(blobArgs[47] ?? null),
          },
        },
      };
    } else {
      raw.item_type = 'media';
      raw.media = {
        media_type: mimeType.startsWith('video/') ? 2 : 1,
        image_versions2: {
          candidates: [{
            url: str(blobArgs, 3),
            width: Number(num(blobArgs, 14)) || 0,
            height: Number(num(blobArgs, 15)) || 0,
          }],
        },
      };
    }
    return;
  }

  // Plain attachment (rare, image/video without XMA wrapper)
  if (bucket.attachment.length > 0 && bucket.xma.length === 0) {
    const attArgs = bucket.attachment[0]!;
    const mimeType = str(attArgs, 8);
    raw.item_type = 'media';
    raw.media = {
      media_type: mimeType.startsWith('video/') ? 2 : 1,
      image_versions2: {
        candidates: [{
          url: str(attArgs, 5),
          width: Number(num(attArgs, 16)) || 0,
          height: Number(num(attArgs, 17)) || 0,
        }],
      },
    };
    return;
  }

  // XMA attachments: shared content (posts, reels, stories, links, GIFs)
  if (bucket.xma.length > 0) {
    const xmaArgs = bucket.xma[0]!;
    applyXmaAttachment(raw, xmaArgs, bucket.cta);
    return;
  }

  // No recognized attachment — fall back to inline media
  applyInlineMedia(raw, msgArgs);
}

function applyXmaAttachment(
  raw: RawMessage,
  xmaArgs: LsValue[],
  ctaList: LsValue[][],
): void {
  const sourceUrl = str(xmaArgs, 4);
  const mimeType = str(xmaArgs, 7);
  const previewUrl = str(xmaArgs, 8);
  const previewWidth = Number(num(xmaArgs, 13)) || 0;
  const previewHeight = Number(num(xmaArgs, 14)) || 0;
  const username = str(xmaArgs, 102);
  const titleText = str(xmaArgs, 58);
  const stickerType = str(xmaArgs, 129);

  // GIF/animated media or sticker: giphy source URL, image/gif mime, or sticker type
  if (
    (sourceUrl && (sourceUrl.includes('giphy') || mimeType === 'image/gif')) ||
    stickerType
  ) {
    raw.item_type = 'animated_media';
    const url = sourceUrl || previewUrl;
    raw.animated_media = {
      images: {
        fixed_height: {
          url,
          width: previewWidth,
          height: previewHeight,
        },
      },
      ...(stickerType ? { is_sticker: true } : {}),
    };
    return;
  }

  // Use CTA to determine share type
  if (ctaList.length > 0) {
    const ctaArgs = ctaList[0]!;
    const ctaType = str(ctaArgs, 7);
    const webUrl = str(ctaArgs, 9);
    const nativeUrl = str(ctaArgs, 10);

    if (ctaType === 'igd_web_post_share' || nativeUrl.includes('instagram://media')) {
      raw.item_type = 'media_share';
      const combined = `${webUrl} ${nativeUrl}`;
      const codeMatch = combined.match(/(?:shortcode=|\/p\/)([^/?&\s]+)/);
      raw.media_share = {
        id: '',
        code: codeMatch?.[1] ?? '',
        ...(previewUrl ? { image_versions2: { candidates: [{ url: previewUrl, width: previewWidth, height: previewHeight }] } } : {}),
        ...(username ? { user: { pk: '', username } } : {}),
      };
      return;
    }

    if (nativeUrl.includes('reels_share') || nativeUrl.includes('/reel/') || webUrl.includes('/reel/')) {
      raw.item_type = 'reel_share';
      raw.reel_share = {
        media: {
          id: '',
          ...(previewUrl ? { image_versions2: { candidates: [{ url: previewUrl, width: previewWidth, height: previewHeight }] } } : {}),
          ...(username ? { user: { pk: '', username } } : {}),
        },
      };
      return;
    }

    if (webUrl.includes('/stories/') || nativeUrl.includes('stories')) {
      raw.item_type = 'story_share';
      raw.story_share = {
        media: {
          id: '',
          ...(previewUrl ? { image_versions2: { candidates: [{ url: previewUrl, width: previewWidth, height: previewHeight }] } } : {}),
          ...(username ? { user: { pk: '', username } } : {}),
        },
      };
      return;
    }

    // Default XMA with CTA: treat as link
    if (ctaType === 'xma_web_url' || webUrl) {
      // Decode Facebook redirect URL to get actual link
      const actualUrl = decodeFbRedirect(webUrl) || webUrl;
      raw.item_type = 'link';
      raw.link = {
        ...(titleText ? { text: titleText } : {}),
        link_context: {
          link_url: actualUrl,
          ...(username ? { link_title: username } : {}),
          ...(previewUrl ? { link_image_url: previewUrl } : {}),
        },
      };
      return;
    }
  }

  // XMA without CTA or unrecognized: treat as link if we have a preview
  if (previewUrl) {
    raw.item_type = 'link';
    raw.link = {
      ...(titleText ? { text: titleText } : {}),
      link_context: {
        link_url: previewUrl,
        ...(username ? { link_title: username } : {}),
        ...(previewUrl ? { link_image_url: previewUrl } : {}),
      },
    };
  }
}

function applyInlineMedia(raw: RawMessage, msgArgs: LsValue[]): void {
  const mediaUrl = msgArgs[31];
  if (typeof mediaUrl !== 'string' || mediaUrl.length === 0) return;

  const mimeType = str(msgArgs, 35);
  const width = typeof msgArgs[33] === 'string' ? Number(msgArgs[33]) : typeof msgArgs[33] === 'number' ? msgArgs[33] : 0;
  const height = typeof msgArgs[34] === 'string' ? Number(msgArgs[34]) : typeof msgArgs[34] === 'number' ? msgArgs[34] : 0;

  raw.item_type = 'media';
  raw.media = {
    media_type: mimeType.startsWith('video/') ? 2 : 1,
    image_versions2: { candidates: [{ url: mediaUrl, width, height }] },
  };
}

function parseWaveform(val: LsValue): number[] {
  if (typeof val !== 'string' || val.length === 0) return [];
  // Waveform data arrives as comma-separated numbers
  return val.split(',').map(Number).filter((n) => !Number.isNaN(n));
}

function decodeFbRedirect(url: string): string {
  if (!url.includes('l.facebook.com/l.php')) return '';
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('u') ?? '';
  } catch {
    return '';
  }
}
