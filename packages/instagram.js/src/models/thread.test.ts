import { describe, expect, it } from 'vitest';
import { Collection } from '../collection';
import type { RawThread } from '../types';
import { Thread } from './thread';

const fakeClient = { fake: true };

describe('Thread', () => {
  it('constructs with defaults', () => {
    const thread = new Thread({ id: 't1' });
    expect(thread.id).toBe('t1');
    expect(thread.name).toBeNull();
    expect(thread.participants).toEqual([]);
    expect(thread.messages).toBeInstanceOf(Collection);
    expect(thread.messages.size).toBe(0);
    expect(thread.isGroup).toBe(false);
    expect(thread.unreadCount).toBe(0);
    expect(thread.muted).toBe(false);
  });

  it('makes client non-enumerable', () => {
    const thread = new Thread({ id: 't1', client: fakeClient });
    expect(Object.keys(thread)).not.toContain('client');
    expect(thread.client).toBe(fakeClient);
  });
});

describe('Thread.from', () => {
  const rawThread: RawThread = {
    thread_id: 'thread_456',
    thread_title: 'Test Group',
    users: [
      {
        pk: 1,
        pk_id: '1',
        username: 'alice',
        full_name: 'Alice',
        profile_pic_url: 'https://example.com/alice.jpg',
        is_verified: false,
      },
      {
        pk: 2,
        pk_id: '2',
        username: 'bob',
        full_name: 'Bob',
        profile_pic_url: 'https://example.com/bob.jpg',
        is_verified: true,
      },
      {
        pk: 3,
        pk_id: '3',
        username: 'charlie',
        full_name: 'Charlie',
        profile_pic_url: 'https://example.com/charlie.jpg',
        is_verified: false,
      },
    ],
    left_users: [],
    items: [
      {
        item_id: 'msg_1',
        user_id: '1',
        timestamp: '1700000000000000',
        item_type: 'text',
        text: 'Hello group!',
      },
    ],
    read_state: 1,
    is_group: true,
    muted: false,
    admin_user_ids: ['1'],
  };

  it('creates a thread from raw data', () => {
    const thread = Thread.from(rawThread, fakeClient);
    expect(thread.id).toBe('thread_456');
    expect(thread.name).toBe('Test Group');
    expect(thread.isGroup).toBe(true);
    expect(thread.muted).toBe(false);
  });

  it('populates participants', () => {
    const thread = Thread.from(rawThread, fakeClient);
    expect(thread.participants).toHaveLength(3);
    expect(thread.participants[0].user.username).toBe('alice');
    expect(thread.participants[0].isAdmin).toBe(true);
    expect(thread.participants[1].isAdmin).toBe(false);
  });

  it('populates messages', () => {
    const thread = Thread.from(rawThread, fakeClient);
    expect(thread.messages.size).toBe(1);
    const msg = thread.messages.get('msg_1');
    expect(msg).toBeDefined();
    expect(msg!.type).toBe('text');
  });

  it('sets isGroup based on is_group flag', () => {
    const thread = Thread.from({ ...rawThread, is_group: false }, fakeClient);
    expect(thread.isGroup).toBe(false);
  });
});

describe('Thread action stubs', () => {
  it('throws when no client is attached', () => {
    const thread = new Thread({ id: 't1' });
    expect(() => thread.send('hi')).toThrow('no client attached');
    expect(() => thread.startTyping()).toThrow('no client attached');
    expect(() => thread.stopTyping()).toThrow('no client attached');
    expect(() => thread.markAsRead()).toThrow('no client attached');
    expect(() => thread.delete()).toThrow('no client attached');
  });

  it('throws not implemented when client is attached', () => {
    const thread = new Thread({ id: 't1', client: fakeClient });
    expect(() => thread.send('hi')).toThrow('not implemented');
    expect(() => thread.rename('new name')).toThrow('not implemented');
  });
});
