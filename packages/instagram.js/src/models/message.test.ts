import { describe, expect, it, vi } from 'vitest';
import type { Client } from '../client';
import type { RawMessage } from '../types';
import { createMessage } from './message';
import { User } from './user';

const author = new User({ id: '1', username: 'sender' });
const threadId = 'thread_123';
const fakeClient = { fake: true } as unknown as Client;

function makeRaw(overrides: Partial<RawMessage> & { item_type: string }): RawMessage {
  return {
    item_id: 'msg_1',
    user_id: '1',
    timestamp: '1700000000000000',
    ...overrides,
  };
}

describe('createMessage', () => {
  it('creates a TextMessage for item_type "text"', () => {
    const msg = createMessage({
      raw: makeRaw({ item_type: 'text', text: 'hello' }),
      threadId,
      author,
      client: fakeClient,
    });
    expect(msg.type).toBe('text');
    if (msg.type === 'text') {
      expect(msg.text).toBe('hello');
    }
  });

  it('creates a LikeMessage for item_type "like"', () => {
    const msg = createMessage({ raw: makeRaw({ item_type: 'like' }), threadId, author, client: fakeClient });
    expect(msg.type).toBe('like');
  });

  it('creates a MediaMessage for item_type "media"', () => {
    const msg = createMessage({ raw: makeRaw({ item_type: 'media' }), threadId, author, client: fakeClient });
    expect(msg.type).toBe('media');
  });

  it('creates a LinkMessage for item_type "link"', () => {
    const msg = createMessage({
      raw: makeRaw({
        item_type: 'link',
        link: {
          text: 'check this',
          link_context: {
            link_url: 'https://example.com',
            link_title: 'Example',
            link_summary: 'A site',
            link_image_url: 'https://example.com/thumb.jpg',
          },
        },
      }),
      threadId,
      author,
      client: fakeClient,
    });
    expect(msg.type).toBe('link');
    if (msg.type === 'link') {
      expect(msg.url).toBe('https://example.com');
      expect(msg.title).toBe('Example');
      expect(msg.summary).toBe('A site');
      expect(msg.text).toBe('check this');
    }
  });

  it('creates a MediaShareMessage for item_type "media_share"', () => {
    const msg = createMessage({
      raw: makeRaw({ item_type: 'media_share', media_share: { id: '456', code: 'abc' } }),
      threadId,
      author,
      client: fakeClient,
    });
    expect(msg.type).toBe('mediaShare');
  });

  it('creates a ReelShareMessage for item_type "reel_share"', () => {
    const msg = createMessage({
      raw: makeRaw({ item_type: 'reel_share', reel_share: { text: 'cool reel' } }),
      threadId,
      author,
      client: fakeClient,
    });
    expect(msg.type).toBe('reelShare');
    if (msg.type === 'reelShare') {
      expect(msg.text).toBe('cool reel');
    }
  });

  it('creates a StoryShareMessage for item_type "story_share"', () => {
    const msg = createMessage({
      raw: makeRaw({ item_type: 'story_share', story_share: {} }),
      threadId,
      author,
      client: fakeClient,
    });
    expect(msg.type).toBe('storyShare');
  });

  it('creates a VoiceMediaMessage for item_type "voice_media"', () => {
    const msg = createMessage({
      raw: makeRaw({ item_type: 'voice_media', voice_media: {} }),
      threadId,
      author,
      client: fakeClient,
    });
    expect(msg.type).toBe('voiceMedia');
  });

  it('creates an AnimatedMediaMessage for item_type "animated_media"', () => {
    const msg = createMessage({
      raw: makeRaw({ item_type: 'animated_media', animated_media: {} }),
      threadId,
      author,
      client: fakeClient,
    });
    expect(msg.type).toBe('animatedMedia');
  });

  it('creates a RavenMediaMessage for item_type "raven_media"', () => {
    const msg = createMessage({
      raw: makeRaw({ item_type: 'raven_media', visual_media: {} }),
      threadId,
      author,
      client: fakeClient,
    });
    expect(msg.type).toBe('ravenMedia');
  });

  it('creates a ClipMessage for item_type "clip"', () => {
    const msg = createMessage({
      raw: makeRaw({ item_type: 'clip', clip: { clip: { id: '789' } } }),
      threadId,
      author,
      client: fakeClient,
    });
    expect(msg.type).toBe('clip');
  });

  it('maps "clip_share" to clip type', () => {
    const msg = createMessage({
      raw: makeRaw({ item_type: 'clip_share', clip: { clip: {} } }),
      threadId,
      author,
      client: fakeClient,
    });
    expect(msg.type).toBe('clip');
  });

  it('creates an ActionLogMessage for item_type "action_log"', () => {
    const msg = createMessage({
      raw: makeRaw({ item_type: 'action_log', action_log: { description: 'X named the group' } }),
      threadId,
      author,
      client: fakeClient,
    });
    expect(msg.type).toBe('actionLog');
    if (msg.type === 'actionLog') {
      expect(msg.actionText).toBe('X named the group');
    }
  });

  it('creates a PlaceholderMessage for item_type "placeholder"', () => {
    const msg = createMessage({
      raw: makeRaw({ item_type: 'placeholder', placeholder: { message: 'unsupported' } }),
      threadId,
      author,
      client: fakeClient,
    });
    expect(msg.type).toBe('placeholder');
    if (msg.type === 'placeholder') {
      expect(msg.placeholderText).toBe('unsupported');
    }
  });

  it('creates an UnknownMessage for unrecognized item_type', () => {
    const msg = createMessage({
      raw: makeRaw({ item_type: 'xyzzy_new_type' }),
      threadId,
      author,
      client: fakeClient,
    });
    expect(msg.type).toBe('unknown');
    if (msg.type === 'unknown') {
      expect(msg.rawValue).toBeDefined();
    }
  });

  it('preserves base fields on all variants', () => {
    const msg = createMessage({
      raw: makeRaw({
        item_type: 'text',
        text: 'test',
        item_id: 'msg_42',
        reactions: {
          likes: [{ sender_id: '2', emoji: '❤️', timestamp: '1700000000000000' }],
        },
        replied_to_message: {
          item_id: 'msg_41',
          text: 'parent',
          user_id: '3',
          timestamp: '1699999999000000',
        },
      }),
      threadId,
      author,
      client: fakeClient,
    });
    expect(msg.id).toBe('msg_42');
    expect(msg.threadId).toBe(threadId);
    expect(msg.author).toBe(author);
    expect(msg.timestamp).toBeInstanceOf(Date);
    expect(msg.rawType).toBe('text');
    expect(msg.reactions).toHaveLength(1);
    expect(msg.reactions[0]!.emoji).toBe('❤️');
    expect(msg.repliedTo).not.toBeNull();
    expect(msg.repliedTo!.id).toBe('msg_41');
  });

  it('makes client non-enumerable', () => {
    const msg = createMessage({
      raw: makeRaw({ item_type: 'text', text: 'hi' }),
      threadId,
      author,
      client: fakeClient,
    });
    expect(Object.keys(msg)).not.toContain('client');
    const descriptor = Object.getOwnPropertyDescriptor(msg, 'client');
    expect(descriptor?.value).toBe(fakeClient);
    expect(descriptor?.enumerable).toBe(false);
  });

  it('action methods throw when no client attached', () => {
    const msg = createMessage({
      raw: makeRaw({ item_type: 'text', text: 'hi' }),
      threadId,
      author,
    });
    expect(() => msg.reply('test')).toThrow('No client attached');
  });

  it('reply with string calls sendText with replyToId', () => {
    const sendText = vi.fn();
    const client = { sendText } as unknown as Client;
    const msg = createMessage({
      raw: makeRaw({ item_type: 'text', text: 'hi', item_id: 'msg-99' }),
      threadId,
      author,
      client,
    });

    msg.reply('response');

    expect(sendText).toHaveBeenCalledWith(threadId, 'response', 'msg-99');
  });

  it('reply with SendContent calls sendMedia', async () => {
    const sentMessage = { id: 'msg-new', type: 'media' };
    const sendMedia = vi.fn().mockResolvedValue(sentMessage);
    const client = { sendMedia } as unknown as Client;
    const msg = createMessage({
      raw: makeRaw({ item_type: 'text', text: 'hi' }),
      threadId,
      author,
      client,
    });

    const content = { link: 'https://example.com', text: 'Check this' };
    const result = await msg.reply(content);

    expect(sendMedia).toHaveBeenCalledWith(threadId, content);
    expect(result).toBe(sentMessage);
  });

  it('reply with SendContent throws when no client attached', () => {
    const msg = createMessage({
      raw: makeRaw({ item_type: 'text', text: 'hi' }),
      threadId,
      author,
    });
    expect(() => msg.reply({ gif: 'abc123' })).toThrow('No client attached');
  });
});
