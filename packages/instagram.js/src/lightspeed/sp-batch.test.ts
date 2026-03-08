import { describe, expect, it } from 'vitest';
import type { LsValue, SpCall } from './types';
import { dispatchBatch } from './sp-batch';

function makeMessageArgs(overrides: Partial<Record<number, LsValue>> = {}): LsValue[] {
  const args = new Array(82).fill(null);
  args[0] = 'Hello';                  // text
  args[3] = '12345';                  // threadKey
  args[5] = '1772963677067';          // timestampMs
  args[8] = 'mid.$test1';            // messageId
  args[9] = '7436348398150181709';    // otid
  args[10] = '17850442257321703';     // senderId
  for (const [idx, val] of Object.entries(overrides)) {
    args[Number(idx)] = val;
  }
  return args;
}

function makeBlobAttachmentArgs(
  messageId: string,
  overrides: Partial<Record<number, LsValue>> = {},
): LsValue[] {
  const args = new Array(49).fill(null);
  args[3] = 'https://cdn.example.com/media.jpg';  // URL
  args[6] = 'image/jpeg';                          // mimeType
  args[14] = '480';                                // width
  args[15] = '640';                                // height
  args[32] = messageId;                            // parent messageId
  for (const [idx, val] of Object.entries(overrides)) {
    args[Number(idx)] = val;
  }
  return args;
}

function makeXmaAttachmentArgs(
  messageId: string,
  overrides: Partial<Record<number, LsValue>> = {},
): LsValue[] {
  const args = new Array(133).fill(null);
  args[8] = 'https://scontent.cdninstagram.com/preview.jpg';  // previewUrl
  args[13] = '480';                                             // width
  args[14] = '640';                                             // height
  args[30] = messageId;                                         // parent messageId
  args[111] = 'generic_share';                                  // share type
  for (const [idx, val] of Object.entries(overrides)) {
    args[Number(idx)] = val;
  }
  return args;
}

function makeCtaArgs(
  messageId: string,
  overrides: Partial<Record<number, LsValue>> = {},
): LsValue[] {
  const args = new Array(17).fill(null);
  args[5] = messageId;                              // parent messageId
  args[7] = 'xma_web_url';                          // CTA type
  args[9] = 'https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.com';  // web URL
  args[10] = '';                                     // native URL
  for (const [idx, val] of Object.entries(overrides)) {
    args[Number(idx)] = val;
  }
  return args;
}

describe('dispatchBatch', () => {
  describe('text messages', () => {
    it('produces a newMessage delta for a text-only message', () => {
      const calls: SpCall[] = [
        { name: 'upsertMessage', args: makeMessageArgs() },
      ];

      const results = dispatchBatch(calls);
      expect(results).toHaveLength(1);
      expect(results[0]!.type).toBe('newMessage');
      if (results[0]!.type === 'newMessage') {
        expect(results[0]!.raw.item_type).toBe('text');
        expect(results[0]!.raw.text).toBe('Hello');
        expect(results[0]!.raw.item_id).toBe('mid.$test1');
        expect(results[0]!.raw.user_id).toBe('17850442257321703');
        expect(results[0]!.threadId).toBe('12345');
      }
    });
  });

  describe('media via insertBlobAttachment', () => {
    it('produces a media delta for an image', () => {
      const calls: SpCall[] = [
        { name: 'upsertMessage', args: makeMessageArgs({ 0: null }) },
        { name: 'insertBlobAttachment', args: makeBlobAttachmentArgs('mid.$test1') },
      ];

      const results = dispatchBatch(calls);
      expect(results).toHaveLength(1);
      if (results[0]!.type === 'newMessage') {
        expect(results[0]!.raw.item_type).toBe('media');
        expect(results[0]!.raw.media?.media_type).toBe(1);
        expect(results[0]!.raw.media?.image_versions2?.candidates?.[0]?.url).toBe(
          'https://cdn.example.com/media.jpg',
        );
        expect(results[0]!.raw.media?.image_versions2?.candidates?.[0]?.width).toBe(480);
        expect(results[0]!.raw.media?.image_versions2?.candidates?.[0]?.height).toBe(640);
      }
    });

    it('produces a media delta for a video', () => {
      const calls: SpCall[] = [
        { name: 'upsertMessage', args: makeMessageArgs({ 0: null }) },
        {
          name: 'insertBlobAttachment',
          args: makeBlobAttachmentArgs('mid.$test1', {
            3: 'https://cdn.example.com/video.mp4',
            6: 'video/mp4',
          }),
        },
      ];

      const results = dispatchBatch(calls);
      if (results[0]!.type === 'newMessage') {
        expect(results[0]!.raw.item_type).toBe('media');
        expect(results[0]!.raw.media?.media_type).toBe(2);
      }
    });

    it('produces a voice_media delta for audio', () => {
      const calls: SpCall[] = [
        { name: 'upsertMessage', args: makeMessageArgs({ 0: null }) },
        {
          name: 'insertBlobAttachment',
          args: makeBlobAttachmentArgs('mid.$test1', {
            3: 'https://cdn.example.com/audio.mp4',
            6: 'audio/mpeg',
            22: '5000',
            47: '0.1,0.5,0.8,0.3,0.2',
          }),
        },
      ];

      const results = dispatchBatch(calls);
      if (results[0]!.type === 'newMessage') {
        expect(results[0]!.raw.item_type).toBe('voice_media');
        expect(results[0]!.raw.voice_media?.media?.audio?.audio_src).toBe(
          'https://cdn.example.com/audio.mp4',
        );
        expect(results[0]!.raw.voice_media?.media?.audio?.duration).toBe(5000);
        expect(results[0]!.raw.voice_media?.media?.audio?.waveform_data).toEqual([
          0.1, 0.5, 0.8, 0.3, 0.2,
        ]);
      }
    });
  });

  describe('XMA attachments', () => {
    it('produces animated_media for a GIF from giphy', () => {
      const calls: SpCall[] = [
        { name: 'upsertMessage', args: makeMessageArgs({ 0: null }) },
        {
          name: 'insertXmaAttachment',
          args: makeXmaAttachmentArgs('mid.$test1', {
            4: 'https://media1.giphy.com/media/v1.abc/giphy.gif',
            7: 'image/gif',
          }),
        },
      ];

      const results = dispatchBatch(calls);
      if (results[0]!.type === 'newMessage') {
        expect(results[0]!.raw.item_type).toBe('animated_media');
        expect(results[0]!.raw.animated_media?.images?.fixed_height?.url).toBe(
          'https://media1.giphy.com/media/v1.abc/giphy.gif',
        );
      }
    });

    it('produces media_share for a post share', () => {
      const calls: SpCall[] = [
        { name: 'upsertMessage', args: makeMessageArgs({ 0: null }) },
        { name: 'insertXmaAttachment', args: makeXmaAttachmentArgs('mid.$test1', { 102: 'johndoe' }) },
        {
          name: 'insertAttachmentCta',
          args: makeCtaArgs('mid.$test1', {
            7: 'igd_web_post_share',
            9: 'https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.instagram.com%2Fp%2FABCdef123%2F',
            10: 'instagram://media/?shortcode=ABCdef123',
          }),
        },
      ];

      const results = dispatchBatch(calls);
      if (results[0]!.type === 'newMessage') {
        expect(results[0]!.raw.item_type).toBe('media_share');
        expect(results[0]!.raw.media_share?.code).toBe('ABCdef123');
        expect(results[0]!.raw.media_share?.user?.username).toBe('johndoe');
      }
    });

    it('produces reel_share for a reel share', () => {
      const calls: SpCall[] = [
        { name: 'upsertMessage', args: makeMessageArgs({ 0: null }) },
        { name: 'insertXmaAttachment', args: makeXmaAttachmentArgs('mid.$test1') },
        {
          name: 'insertAttachmentCta',
          args: makeCtaArgs('mid.$test1', {
            7: 'xma_open_native',
            10: 'instagram://reels_share/?shortcode=XYZ789',
          }),
        },
      ];

      const results = dispatchBatch(calls);
      if (results[0]!.type === 'newMessage') {
        expect(results[0]!.raw.item_type).toBe('reel_share');
      }
    });

    it('produces story_share for a story share', () => {
      const calls: SpCall[] = [
        { name: 'upsertMessage', args: makeMessageArgs({ 0: null }) },
        { name: 'insertXmaAttachment', args: makeXmaAttachmentArgs('mid.$test1') },
        {
          name: 'insertAttachmentCta',
          args: makeCtaArgs('mid.$test1', {
            7: 'xma_open_native',
            9: 'https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.instagram.com%2Fstories%2Fuser%2F123',
            10: 'instagram://stories',
          }),
        },
      ];

      const results = dispatchBatch(calls);
      if (results[0]!.type === 'newMessage') {
        expect(results[0]!.raw.item_type).toBe('story_share');
      }
    });

    it('produces link for an xma_web_url CTA', () => {
      const calls: SpCall[] = [
        { name: 'upsertMessage', args: makeMessageArgs({ 0: 'Check this out' }) },
        { name: 'insertXmaAttachment', args: makeXmaAttachmentArgs('mid.$test1', { 58: 'Cool Article' }) },
        {
          name: 'insertAttachmentCta',
          args: makeCtaArgs('mid.$test1', {
            7: 'xma_web_url',
            9: 'https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.com%2Farticle',
          }),
        },
      ];

      const results = dispatchBatch(calls);
      if (results[0]!.type === 'newMessage') {
        expect(results[0]!.raw.item_type).toBe('link');
        expect(results[0]!.raw.link?.link_context?.link_url).toBe('https://example.com/article');
        expect(results[0]!.raw.link?.text).toBe('Cool Article');
      }
    });
  });

  describe('passthrough SPs', () => {
    it('dispatches non-message SPs immediately', () => {
      const calls: SpCall[] = [
        {
          name: 'upsertReaction',
          args: ['12345', '1772920941698', 'mid.$abc', '456', '❤', '80', '1772487928356'],
        },
        {
          name: 'updateTypingIndicator',
          args: ['12345', '789', true, null],
        },
      ];

      const results = dispatchBatch(calls);
      expect(results).toHaveLength(2);
      expect(results[0]!.type).toBe('reaction');
      expect(results[1]!.type).toBe('typing');
    });
  });

  describe('mixed batches', () => {
    it('handles messages and non-message SPs in one batch', () => {
      const calls: SpCall[] = [
        { name: 'upsertMessage', args: makeMessageArgs() },
        {
          name: 'upsertReaction',
          args: ['12345', '1000', 'mid.$other', '789', '👍', '80', '999'],
        },
        {
          name: 'insertBlobAttachment',
          args: makeBlobAttachmentArgs('mid.$test1'),
        },
      ];

      const results = dispatchBatch(calls);
      // Reaction is dispatched first (passthrough), then message with attachment
      expect(results).toHaveLength(2);
      expect(results[0]!.type).toBe('reaction');
      expect(results[1]!.type).toBe('newMessage');
      if (results[1]!.type === 'newMessage') {
        expect(results[1]!.raw.item_type).toBe('media');
      }
    });

    it('correlates multiple messages with their own attachments', () => {
      const calls: SpCall[] = [
        { name: 'upsertMessage', args: makeMessageArgs({ 8: 'mid.$msg1' }) },
        { name: 'upsertMessage', args: makeMessageArgs({ 8: 'mid.$msg2', 0: 'Second' }) },
        { name: 'insertBlobAttachment', args: makeBlobAttachmentArgs('mid.$msg1') },
        {
          name: 'insertXmaAttachment',
          args: makeXmaAttachmentArgs('mid.$msg2', {
            4: 'https://media.giphy.com/test.gif',
            7: 'image/gif',
          }),
        },
      ];

      const results = dispatchBatch(calls);
      expect(results).toHaveLength(2);
      if (results[0]!.type === 'newMessage') {
        expect(results[0]!.raw.item_id).toBe('mid.$msg1');
        expect(results[0]!.raw.item_type).toBe('media');
      }
      if (results[1]!.type === 'newMessage') {
        expect(results[1]!.raw.item_id).toBe('mid.$msg2');
        expect(results[1]!.raw.item_type).toBe('animated_media');
      }
    });
  });

  describe('fallback behavior', () => {
    it('uses inline media from upsertMessage arg31 when no attachment SPs', () => {
      const calls: SpCall[] = [
        {
          name: 'upsertMessage',
          args: makeMessageArgs({
            0: null,
            31: 'https://cdn.url/img.jpg',
            33: '480',
            34: '640',
            35: 'image/jpeg',
          }),
        },
      ];

      const results = dispatchBatch(calls);
      if (results[0]!.type === 'newMessage') {
        expect(results[0]!.raw.item_type).toBe('media');
        expect(results[0]!.raw.media?.image_versions2?.candidates?.[0]?.url).toBe(
          'https://cdn.url/img.jpg',
        );
      }
    });

    it('ignores orphaned attachment SPs without a parent message', () => {
      const calls: SpCall[] = [
        { name: 'insertBlobAttachment', args: makeBlobAttachmentArgs('mid.$orphan') },
      ];

      const results = dispatchBatch(calls);
      expect(results).toHaveLength(0);
    });
  });

  describe('unknown SPs', () => {
    it('silently ignores unrecognized SP names', () => {
      const calls: SpCall[] = [
        { name: 'taskExists', args: ['abc'] },
        { name: 'removeTask', args: ['1', '2'] },
        { name: 'executeFirstBlockForSyncTransaction', args: new Array(10).fill(null) },
      ];

      const results = dispatchBatch(calls);
      expect(results).toHaveLength(0);
    });
  });

  describe('reply detection', () => {
    it('preserves reply metadata from arg23', () => {
      const calls: SpCall[] = [
        {
          name: 'upsertMessage',
          args: makeMessageArgs({ 23: 'mid.$original' }),
        },
      ];

      const results = dispatchBatch(calls);
      if (results[0]!.type === 'newMessage') {
        expect(results[0]!.raw.replied_to_message?.item_id).toBe('mid.$original');
      }
    });
  });

  describe('admin messages (action_log)', () => {
    it('produces action_log for applyAdminMessageCTAV2', () => {
      const adminArgs = new Array(16).fill(null);
      adminArgs[0] = '17848629653856672';  // threadKey
      adminArgs[1] = '1772999459484';      // timestamp
      adminArgs[2] = 'mid.$test1';         // messageId
      adminArgs[3] = 'Change';             // action label
      adminArgs[4] = 'admin_msg_change_theme'; // action type

      const calls: SpCall[] = [
        { name: 'upsertMessage', args: makeMessageArgs({ 0: 'You changed the theme' }) },
        { name: 'applyAdminMessageCTAV2', args: adminArgs },
      ];

      const results = dispatchBatch(calls);
      expect(results).toHaveLength(1);
      if (results[0]!.type === 'newMessage') {
        expect(results[0]!.raw.item_type).toBe('action_log');
        expect(results[0]!.raw.action_log?.description).toBe('You changed the theme');
      }
    });
  });

  describe('stickers', () => {
    it('produces animated_media with is_sticker for cutout stickers', () => {
      const calls: SpCall[] = [
        { name: 'upsertMessage', args: makeMessageArgs({ 0: null }) },
        {
          name: 'insertXmaAttachment',
          args: makeXmaAttachmentArgs('mid.$test1', {
            8: 'https://scontent.cdninstagram.com/sticker.webp',
            129: 'cutout_sticker',
          }),
        },
      ];

      const results = dispatchBatch(calls);
      if (results[0]!.type === 'newMessage') {
        expect(results[0]!.raw.item_type).toBe('animated_media');
        expect(results[0]!.raw.animated_media?.is_sticker).toBe(true);
        expect(results[0]!.raw.animated_media?.images?.fixed_height?.url).toBe(
          'https://scontent.cdninstagram.com/sticker.webp',
        );
      }
    });
  });

  describe('message edits', () => {
    it('produces editMessage delta from edit SPs', () => {
      const calls: SpCall[] = [
        {
          name: 'editMessage',
          args: ['mid.$test1', '80', 'Updated text', '1'],
        },
        {
          name: 'handleRepliesOnMessageEdit',
          args: ['17848629653856672', 'mid.$test1'],
        },
        {
          name: 'updateOrInsertEditMessageHistory',
          args: ['mid.$test1', '17848629653856672', '1773000195895', 'Original text', '2'],
        },
      ];

      const results = dispatchBatch(calls);
      expect(results).toHaveLength(1);
      expect(results[0]!.type).toBe('editMessage');
      if (results[0]!.type === 'editMessage') {
        expect(results[0]!.messageId).toBe('mid.$test1');
        expect(results[0]!.threadId).toBe('17848629653856672');
        expect(results[0]!.newText).toBe('Updated text');
        expect(results[0]!.oldText).toBe('Original text');
      }
    });

    it('handles editMessage without history SP', () => {
      const calls: SpCall[] = [
        {
          name: 'editMessage',
          args: ['mid.$test1', '80', 'New text', '1'],
        },
        {
          name: 'handleRepliesOnMessageEdit',
          args: ['12345', 'mid.$test1'],
        },
      ];

      const results = dispatchBatch(calls);
      expect(results).toHaveLength(1);
      if (results[0]!.type === 'editMessage') {
        expect(results[0]!.newText).toBe('New text');
        expect(results[0]!.oldText).toBeNull();
      }
    });
  });

  describe('insertMessage and deleteThenInsertMessage', () => {
    it('handles insertMessage the same as upsertMessage', () => {
      const calls: SpCall[] = [
        { name: 'insertMessage', args: makeMessageArgs() },
      ];

      const results = dispatchBatch(calls);
      expect(results).toHaveLength(1);
      expect(results[0]!.type).toBe('newMessage');
    });

    it('handles deleteThenInsertMessage the same as upsertMessage', () => {
      const calls: SpCall[] = [
        { name: 'deleteThenInsertMessage', args: makeMessageArgs() },
      ];

      const results = dispatchBatch(calls);
      expect(results).toHaveLength(1);
      expect(results[0]!.type).toBe('newMessage');
    });
  });
});
