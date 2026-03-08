import { describe, expect, it } from 'vitest';
import { dispatchSp } from './sp-dispatch';

describe('dispatchSp', () => {
  describe('insertMessage', () => {
    it('produces a newMessage delta', () => {
      const delta = dispatchSp({
        name: 'insertMessage',
        args: [
          'Hello world',    // arg0: text
          null,             // arg1
          '80',             // arg2: type
          '110321187034821', // arg3: threadKey
          '0',              // arg4
          '1772963677067',  // arg5: timestampMs
          '1772963677067',  // arg6
          null,             // arg7
          'mid.$abc123',    // arg8: messageId
          '7436348398150181709', // arg9: otid
          '100105558060154', // arg10: senderId
        ],
      });

      expect(delta).not.toBeNull();
      expect(delta!.type).toBe('newMessage');
      if (delta!.type === 'newMessage') {
        expect(delta!.threadId).toBe('110321187034821');
        expect(delta!.raw.item_id).toBe('mid.$abc123');
        expect(delta!.raw.user_id).toBe('100105558060154');
        expect(delta!.raw.text).toBe('Hello world');
        expect(delta!.raw.item_type).toBe('text');
      }
    });
  });

  describe('upsertMessage', () => {
    it('produces a newMessage delta for text', () => {
      const delta = dispatchSp({
        name: 'upsertMessage',
        args: [
          'Some text',      // arg0
          null,             // arg1
          '80',             // arg2
          '912118888038570', // arg3: threadKey
          '0',              // arg4
          '1770980372896',  // arg5: timestampMs
          '1770980372896',  // arg6
          null,             // arg7
          'mid.$cAAAD615m8qai-IphcWcx0UW6jCb7', // arg8: messageId
          '7428030052652555534', // arg9
          '17850442257321703', // arg10: senderId
        ],
      });

      expect(delta!.type).toBe('newMessage');
      if (delta!.type === 'newMessage') {
        expect(delta!.raw.text).toBe('Some text');
      }
    });

    it('detects media attachment from arg31', () => {
      const args = new Array(82).fill(null);
      args[0] = null;                  // text
      args[3] = '12345';              // threadKey
      args[5] = '1000';              // timestamp
      args[8] = 'mid.media1';         // messageId
      args[10] = '456';               // senderId
      args[31] = 'https://cdn.url/img.jpg'; // mediaUrl
      args[33] = '480';               // width
      args[34] = '640';               // height
      args[35] = 'image/jpeg';        // mimeType

      const delta = dispatchSp({ name: 'upsertMessage', args });

      expect(delta!.type).toBe('newMessage');
      if (delta!.type === 'newMessage') {
        expect(delta!.raw.item_type).toBe('media');
        expect(delta!.raw.media?.media_type).toBe(1);
        expect(delta!.raw.media?.image_versions2?.candidates?.[0]?.url).toBe('https://cdn.url/img.jpg');
      }
    });

    it('detects video from mime type', () => {
      const args = new Array(82).fill(null);
      args[3] = '12345';
      args[5] = '1000';
      args[8] = 'mid.vid1';
      args[10] = '456';
      args[31] = 'https://cdn.url/vid.mp4';
      args[35] = 'video/mp4';

      const delta = dispatchSp({ name: 'upsertMessage', args });
      if (delta!.type === 'newMessage') {
        expect(delta!.raw.media?.media_type).toBe(2);
      }
    });

    it('detects reply from arg23', () => {
      const args = new Array(82).fill(null);
      args[3] = '12345';
      args[5] = '1000';
      args[8] = 'mid.reply1';
      args[10] = '456';
      args[23] = 'mid.original';

      const delta = dispatchSp({ name: 'upsertMessage', args });
      if (delta!.type === 'newMessage') {
        expect(delta!.raw.replied_to_message?.item_id).toBe('mid.original');
      }
    });
  });

  describe('deleteMessage', () => {
    it('produces a deleteMessage delta', () => {
      const delta = dispatchSp({
        name: 'deleteMessage',
        args: ['17848629653856672', 'mid.$cAAAPv25Tebqi_h1f0WczNgPN0Y-n'],
      });

      expect(delta).toEqual({
        type: 'deleteMessage',
        threadId: '17848629653856672',
        messageId: 'mid.$cAAAPv25Tebqi_h1f0WczNgPN0Y-n',
      });
    });
  });

  describe('upsertReaction', () => {
    it('produces a reaction add delta', () => {
      const delta = dispatchSp({
        name: 'upsertReaction',
        args: [
          '110321187034821',   // arg0: threadKey
          '1772920941698',     // arg1: timestampMs
          'mid.$cAAAF06z3ziGi_f7Qp2czLmF277GH', // arg2: messageId
          '17847614715005362', // arg3: senderId
          '❤',                // arg4: emoji
          '80',               // arg5: type
          '1772487928356',     // arg6: reactionTs
        ],
      });

      expect(delta).toEqual({
        type: 'reaction',
        action: 'add',
        threadId: '110321187034821',
        messageId: 'mid.$cAAAF06z3ziGi_f7Qp2czLmF277GH',
        senderId: '17847614715005362',
        emoji: '❤',
      });
    });
  });

  describe('deleteReaction', () => {
    it('produces a reaction remove delta', () => {
      const delta = dispatchSp({
        name: 'deleteReaction',
        args: ['17848629653856672', 'mid.$abc', '17845642809153562'],
      });

      expect(delta).toEqual({
        type: 'reaction',
        action: 'remove',
        threadId: '17848629653856672',
        messageId: 'mid.$abc',
        senderId: '17845642809153562',
        emoji: '',
      });
    });
  });

  describe('updateTypingIndicator', () => {
    it('produces a typing delta for typing start', () => {
      const delta = dispatchSp({
        name: 'updateTypingIndicator',
        args: ['17843594121516983', '100105558060154', true, null],
      });

      expect(delta).toEqual({
        type: 'typing',
        threadId: '17843594121516983',
        senderId: '100105558060154',
        isTyping: true,
      });
    });

    it('produces a typing delta for typing stop', () => {
      const delta = dispatchSp({
        name: 'updateTypingIndicator',
        args: ['17843594121516983', '17843594121516983', false, null],
      });

      expect(delta).toEqual({
        type: 'typing',
        threadId: '17843594121516983',
        senderId: '17843594121516983',
        isTyping: false,
      });
    });
  });

  describe('updateReadReceipt', () => {
    it('produces a readReceipt delta', () => {
      const delta = dispatchSp({
        name: 'updateReadReceipt',
        args: ['1772963605863', '912118888038570', '17842053083098320', '1772963521498'],
      });

      expect(delta!.type).toBe('readReceipt');
      if (delta!.type === 'readReceipt') {
        expect(delta!.threadId).toBe('912118888038570');
        expect(delta!.userId).toBe('17842053083098320');
        expect(delta!.timestamp.getTime()).toBe(1772963605863);
      }
    });
  });

  describe('syncUpdateThreadName', () => {
    it('produces a threadUpdate delta with name', () => {
      const delta = dispatchSp({
        name: 'syncUpdateThreadName',
        args: ['12345', 'New Thread Name', '0'],
      });

      expect(delta).toEqual({
        type: 'threadUpdate',
        threadId: '12345',
        name: 'New Thread Name',
      });
    });
  });

  describe('updateThreadMuteSetting', () => {
    it('produces a threadUpdate delta with muted', () => {
      const delta = dispatchSp({
        name: 'updateThreadMuteSetting',
        args: [true, '12345'],
      });

      expect(delta).toEqual({
        type: 'threadUpdate',
        threadId: '12345',
        muted: true,
      });
    });
  });

  describe('deleteThread', () => {
    it('produces a threadDelete delta', () => {
      const delta = dispatchSp({
        name: 'deleteThread',
        args: ['12345', '0'],
      });

      expect(delta).toEqual({
        type: 'threadDelete',
        threadId: '12345',
      });
    });
  });

  describe('unknown SPs', () => {
    it('returns null for unhandled SP names', () => {
      expect(dispatchSp({ name: 'taskExists', args: ['abc'] })).toBeNull();
      expect(dispatchSp({ name: 'removeTask', args: ['1', '2'] })).toBeNull();
      expect(dispatchSp({ name: 'someUnknownSP', args: [] })).toBeNull();
    });
  });
});
