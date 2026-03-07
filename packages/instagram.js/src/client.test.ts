import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Client } from './client';
import { DEFAULT_CLIENT_OPTIONS } from './constants';

vi.mock('./session', async (importOriginal) => {
  const original = await importOriginal<typeof import('./session')>();
  return {
    ...original,
    parseAndValidateCookies: vi.fn().mockReturnValue({
      sessionid: 'abc',
      csrftoken: 'csrf',
      ds_user_id: '123',
      mid: 'mid',
    }),
    bootstrapSession: vi.fn().mockResolvedValue({
      cookies: { sessionid: 'abc', csrftoken: 'csrf', ds_user_id: '123', mid: 'mid' },
      fbDtsg: 'dtsg',
      lsd: 'lsd',
      rolloutHash: '111',
      spinR: '111',
      spinB: 'trunk',
      spinT: '222',
      hs: 'hs',
      bloksVersion: 'bv',
      deviceId: 'dev',
      sessionId: '999',
      igScopedId: '5555',
      seqId: 0,
    }),
  };
});

vi.mock('./http', () => ({
  HttpClient: vi.fn().mockImplementation(() => ({
    graphql: vi.fn().mockResolvedValue({
      data: {
        viewer: {
          message_threads: {
            nodes: [
              {
                thread_id: 'thread-1',
                thread_title: 'Test Thread',
                users: [
                  { pk: '456', username: 'user1', full_name: 'User One' },
                ],
                left_users: [],
                items: [
                  {
                    item_id: 'msg-1',
                    user_id: '456',
                    timestamp: '1700000000000000',
                    item_type: 'text',
                    text: 'Hello',
                  },
                ],
                read_state: 0,
                is_group: false,
                muted: false,
                admin_user_ids: [],
              },
            ],
          },
          seq_id: 100,
        },
      },
    }),
    rest: vi.fn(),
    upload: vi.fn(),
  })),
}));

const mockMqttInstance = {
  connect: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn().mockResolvedValue(undefined),
  publish: vi.fn(),
  disconnect: vi.fn(),
  on: vi.fn(),
  removeAllListeners: vi.fn(),
};

vi.mock('./mqtt', () => ({
  MqttClient: vi.fn().mockImplementation(() => mockMqttInstance),
}));

describe('Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMqttInstance.connect.mockResolvedValue(undefined);
    mockMqttInstance.subscribe.mockResolvedValue(undefined);
    mockMqttInstance.on.mockReset();
  });

  describe('constructor', () => {
    it('uses default options', () => {
      const client = new Client();
      expect(client.threads.maxSize).toBe(DEFAULT_CLIENT_OPTIONS.maxCachedThreads);
      expect(client.connected).toBe(false);
      expect(client.readyAt).toBeNull();
      expect(client.user).toBeNull();
    });

    it('merges custom options', () => {
      const client = new Client({ maxCachedThreads: 10 });
      expect(client.threads.maxSize).toBe(10);
    });

    it('uptime is null before login', () => {
      const client = new Client();
      expect(client.uptime).toBeNull();
    });
  });

  describe('login', () => {
    it('completes the full login flow', async () => {
      const client = new Client();
      const readyHandler = vi.fn();
      client.on('ready', readyHandler);

      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123; mid=mid');

      expect(client.connected).toBe(true);
      expect(client.readyAt).toBeInstanceOf(Date);
      expect(client.user).not.toBeNull();
      expect(client.user!.id).toBe('123');
      expect(client.user!.igScopedId).toBe('5555');
      expect(readyHandler).toHaveBeenCalledOnce();
    });

    it('populates thread cache from inbox', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');

      expect(client.threads.size).toBe(1);
      expect(client.threads.has('thread-1')).toBe(true);

      const thread = client.threads.get('thread-1')!;
      expect(thread.name).toBe('Test Thread');
      expect(thread.messages.size).toBe(1);
    });

    it('populates user cache from participants', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');

      expect(client.users.has('456')).toBe(true);
      expect(client.users.has('123')).toBe(true);
    });

    it('stores seq_id from inbox query', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');

      expect(client.getSeqId()).toBe(100);
    });

    it('subscribes to MQTT topics', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');

      expect(mockMqttInstance.subscribe).toHaveBeenCalledWith([
        '/ig_message_sync',
        '/ig_send_message_response',
      ]);
    });

    it('publishes Iris subscription', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');

      expect(mockMqttInstance.publish).toHaveBeenCalledWith(
        '/ig_sub_iris',
        expect.stringContaining('"seq_id":100'),
        1,
      );
    });

    it('uptime is computed after login', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');

      expect(client.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('delta processing', () => {
    function getMessageHandler(client: Client): (topic: string, payload: Buffer) => void {
      client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const calls = mockMqttInstance.on.mock.calls;
      const messageCall = calls.find(
        (c: unknown[]) => c[0] === 'message',
      );
      return messageCall![1] as (topic: string, payload: Buffer) => void;
    }

    it('emits message event for new items', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);
      const messageHandler = vi.fn();
      client.on('message', messageHandler);

      const delta = {
        event: 'patch',
        data: [
          {
            op: 'add',
            path: '/direct_v2/threads/thread-1/items/msg-2',
            value: JSON.stringify({
              item_id: 'msg-2',
              user_id: '456',
              timestamp: '1700000001000000',
              item_type: 'text',
              text: 'New message',
            }),
          },
        ],
        seq_id: 101,
      };

      handler('/ig_message_sync', Buffer.from(JSON.stringify(delta)));

      expect(messageHandler).toHaveBeenCalledOnce();
      const msg = messageHandler.mock.calls[0]![0];
      expect(msg.type).toBe('text');
      expect(msg.text).toBe('New message');
    });

    it('filters self-messages', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);
      const messageHandler = vi.fn();
      client.on('message', messageHandler);

      const delta = {
        event: 'patch',
        data: [
          {
            op: 'add',
            path: '/direct_v2/threads/thread-1/items/msg-self',
            value: JSON.stringify({
              item_id: 'msg-self',
              user_id: '123',
              timestamp: '1700000001000000',
              item_type: 'text',
              text: 'Self sent',
            }),
          },
        ],
        seq_id: 102,
      };

      handler('/ig_message_sync', Buffer.from(JSON.stringify(delta)));

      expect(messageHandler).not.toHaveBeenCalled();
    });

    it('emits messageDelete event', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);
      const deleteHandler = vi.fn();
      client.on('messageDelete', deleteHandler);

      const delta = {
        event: 'patch',
        data: [
          {
            op: 'remove',
            path: '/direct_v2/threads/thread-1/items/msg-1',
          },
        ],
        seq_id: 103,
      };

      handler('/ig_message_sync', Buffer.from(JSON.stringify(delta)));

      expect(deleteHandler).toHaveBeenCalledOnce();
      expect(deleteHandler.mock.calls[0]![0].messageId).toBe('msg-1');
      expect(deleteHandler.mock.calls[0]![0].message).not.toBeNull();
    });

    it('emits messageEdit when text changes', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);
      const editHandler = vi.fn();
      client.on('messageEdit', editHandler);

      const delta = {
        event: 'patch',
        data: [
          {
            op: 'replace',
            path: '/direct_v2/threads/thread-1/items/msg-1',
            value: JSON.stringify({
              item_id: 'msg-1',
              user_id: '456',
              timestamp: '1700000000000000',
              item_type: 'text',
              text: 'Edited text',
            }),
          },
        ],
        seq_id: 104,
      };

      handler('/ig_message_sync', Buffer.from(JSON.stringify(delta)));

      expect(editHandler).toHaveBeenCalledOnce();
      expect(editHandler.mock.calls[0]![0].oldText).toBe('Hello');
      expect(editHandler.mock.calls[0]![0].message.text).toBe('Edited text');
    });

    it('emits rawDelta for every delta', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);
      const rawHandler = vi.fn();
      client.on('rawDelta', rawHandler);

      const delta = {
        event: 'patch',
        data: [
          { op: 'add', path: '/direct_v2/threads/thread-1/items/msg-x', value: '{}' },
        ],
        seq_id: 105,
      };

      handler('/ig_message_sync', Buffer.from(JSON.stringify(delta)));

      expect(rawHandler).toHaveBeenCalledOnce();
    });

    it('updates seq_id from deltas', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);

      const delta = {
        event: 'patch',
        data: [
          { op: 'add', path: '/some/path', value: '{}' },
        ],
        seq_id: 200,
      };

      handler('/ig_message_sync', Buffer.from(JSON.stringify(delta)));

      expect(client.getSeqId()).toBe(200);
    });

    it('emits threadDelete on inbox thread remove', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);
      const threadDeleteHandler = vi.fn();
      client.on('threadDelete', threadDeleteHandler);

      const delta = {
        event: 'patch',
        data: [
          {
            op: 'remove',
            path: '/direct_v2/inbox/threads/thread-1',
          },
        ],
        seq_id: 106,
      };

      handler('/ig_message_sync', Buffer.from(JSON.stringify(delta)));

      expect(threadDeleteHandler).toHaveBeenCalledOnce();
      expect(threadDeleteHandler.mock.calls[0]![0].threadId).toBe('thread-1');
      expect(client.threads.has('thread-1')).toBe(false);
    });

    it('emits typingStart and auto-stops after TTL', async () => {
      vi.useFakeTimers();

      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);
      const typingStartHandler = vi.fn();
      const typingStopHandler = vi.fn();
      client.on('typingStart', typingStartHandler);
      client.on('typingStop', typingStopHandler);

      const delta = {
        event: 'patch',
        data: [
          {
            op: 'add',
            path: '/direct_v2/threads/thread-1/activity_indicator_id/uuid-1',
            value: JSON.stringify({
              sender_id: '456',
              activity_status: 1,
              ttl: 22000,
            }),
          },
        ],
        seq_id: 107,
      };

      handler('/ig_message_sync', Buffer.from(JSON.stringify(delta)));

      expect(typingStartHandler).toHaveBeenCalledOnce();
      expect(typingStopHandler).not.toHaveBeenCalled();

      vi.advanceTimersByTime(22000);

      expect(typingStopHandler).toHaveBeenCalledOnce();

      vi.useRealTimers();
    });

    it('emits reaction event', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);
      const reactionHandler = vi.fn();
      client.on('reaction', reactionHandler);

      const delta = {
        event: 'patch',
        data: [
          {
            op: 'add',
            path: '/direct_v2/threads/thread-1/items/msg-1/reactions/likes/456',
            value: JSON.stringify({ emoji: '\u2764\ufe0f' }),
          },
        ],
        seq_id: 108,
      };

      handler('/ig_message_sync', Buffer.from(JSON.stringify(delta)));

      expect(reactionHandler).toHaveBeenCalledOnce();
      expect(reactionHandler.mock.calls[0]![0].emoji).toBe('\u2764\ufe0f');
      expect(reactionHandler.mock.calls[0]![0].messageId).toBe('msg-1');
    });

    it('emits readReceipt event', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);
      const receiptHandler = vi.fn();
      client.on('readReceipt', receiptHandler);

      const delta = {
        event: 'patch',
        data: [
          {
            op: 'replace',
            path: '/direct_v2/threads/thread-1/participants/456/has_seen',
            value: JSON.stringify({ item_id: 'msg-1', timestamp: 1700000000000 }),
          },
        ],
        seq_id: 109,
      };

      handler('/ig_message_sync', Buffer.from(JSON.stringify(delta)));

      expect(receiptHandler).toHaveBeenCalledOnce();
      expect(receiptHandler.mock.calls[0]![0].messageId).toBe('msg-1');
    });

    it('ignores non-patch events', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);
      const rawHandler = vi.fn();
      client.on('rawDelta', rawHandler);

      handler(
        '/ig_message_sync',
        Buffer.from(JSON.stringify({ event: 'snapshot', data: [] })),
      );

      expect(rawHandler).not.toHaveBeenCalled();
    });
  });

  describe('MQTT actions', () => {
    it('sendText publishes correct payload', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      mockMqttInstance.publish.mockClear();

      client.sendText('thread-1', 'Hello!');

      expect(mockMqttInstance.publish).toHaveBeenCalledWith(
        '/ig_send_message',
        expect.any(String),
        1,
      );

      const payload = JSON.parse(mockMqttInstance.publish.mock.calls[0]![1] as string);
      expect(payload.action).toBe('send_item');
      expect(payload.item_type).toBe('text');
      expect(payload.text).toBe('Hello!');
      expect(payload.thread_id).toBe('thread-1');
      expect(payload.device_id).toBe('dev');
      expect(payload.mutation_token).toBeTruthy();
      expect(payload.client_context).toBeTruthy();
      expect(payload.replied_to_item_id).toBeNull();
    });

    it('sendText includes reply fields when replying', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      mockMqttInstance.publish.mockClear();

      client.sendText('thread-1', 'Reply', 'msg-parent');

      const payload = JSON.parse(mockMqttInstance.publish.mock.calls[0]![1] as string);
      expect(payload.replied_to_item_id).toBe('msg-parent');
    });

    it('sendReaction publishes reaction payload', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      mockMqttInstance.publish.mockClear();

      client.sendReaction('thread-1', 'msg-1', '\u2764\ufe0f');

      const payload = JSON.parse(mockMqttInstance.publish.mock.calls[0]![1] as string);
      expect(payload.item_type).toBe('reaction');
      expect(payload.reaction_status).toBe('created');
      expect(payload.emoji).toBe('\u2764\ufe0f');
      expect(payload.item_id).toBe('msg-1');
      expect(payload.node_type).toBe('item');
    });

    it('removeReaction publishes deleted reaction', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      mockMqttInstance.publish.mockClear();

      client.removeReaction('thread-1', 'msg-1');

      const payload = JSON.parse(mockMqttInstance.publish.mock.calls[0]![1] as string);
      expect(payload.reaction_status).toBe('deleted');
    });

    it('sendTyping publishes start typing with QoS 0', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      mockMqttInstance.publish.mockClear();

      client.sendTyping('thread-1', 1);

      expect(mockMqttInstance.publish).toHaveBeenCalledWith('/ig_send_message', expect.any(String), 0);
      const payload = JSON.parse(mockMqttInstance.publish.mock.calls[0]![1] as string);
      expect(payload.action).toBe('indicate_activity');
      expect(payload.activity_status).toBe(1);
      expect(payload.thread_id).toBe('thread-1');
    });

    it('sendTyping publishes stop typing', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      mockMqttInstance.publish.mockClear();

      client.sendTyping('thread-1', 0);

      const payload = JSON.parse(mockMqttInstance.publish.mock.calls[0]![1] as string);
      expect(payload.activity_status).toBe(0);
    });
  });

  describe('GraphQL actions', () => {
    async function loginAndGetHttp(client: Client) {
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const { HttpClient: HttpCtor } = await import('./http');
      const httpInstance = vi.mocked(HttpCtor).mock.results[0]!.value;
      return httpInstance;
    }

    it('markAsRead calls correct mutation', async () => {
      const client = new Client();
      const http = await loginAndGetHttp(client);

      await client.markAsRead('thread-1', '1700000000000000');

      expect(http.graphql).toHaveBeenCalledWith('useIGDMarkThreadAsReadMutation', {
        threadId: 'thread-1',
        lastSeenMessageTimestamp: '1700000000000000',
      });
    });

    it('editMessage calls correct mutation', async () => {
      const client = new Client();
      const http = await loginAndGetHttp(client);

      await client.editMessage('thread-1', 'msg-1', 'New text');

      expect(http.graphql).toHaveBeenCalledWith('IGDirectEditMessageMutation', {
        thread_id: 'thread-1',
        item_id: 'msg-1',
        text: 'New text',
      });
    });

    it('unsendMessage calls correct mutation', async () => {
      const client = new Client();
      const http = await loginAndGetHttp(client);

      await client.unsendMessage('thread-1', 'msg-1');

      expect(http.graphql).toHaveBeenCalledWith('IGDMessageUnsendDialogOffMsysMutation', {
        thread_id: 'thread-1',
        item_id: 'msg-1',
      });
    });

    it('editThreadName calls correct mutation', async () => {
      const client = new Client();
      const http = await loginAndGetHttp(client);

      await client.editThreadName('thread-1', 'New Name');

      expect(http.graphql).toHaveBeenCalledWith('IGDEditThreadNameDialogOffMsysMutation', {
        thread_id: 'thread-1',
        name: 'New Name',
      });
    });

    it('deleteThread calls correct mutation', async () => {
      const client = new Client();
      const http = await loginAndGetHttp(client);

      await client.deleteThread('thread-1');

      expect(http.graphql).toHaveBeenCalledWith(
        'IGDInboxInfoDeleteThreadDialogOffMsysMutation',
        { thread_id: 'thread-1' },
      );
    });

    it('muteThread calls correct mutation', async () => {
      const client = new Client();
      const http = await loginAndGetHttp(client);

      await client.muteThread('thread-1', true);

      expect(http.graphql).toHaveBeenCalledWith('IGDInboxInfoMuteToggleOffMsysMutation', {
        thread_id: 'thread-1',
        muted: true,
      });
    });

    it('setNickname calls correct mutation', async () => {
      const client = new Client();
      const http = await loginAndGetHttp(client);

      await client.setNickname('thread-1', '456', 'Nick');

      expect(http.graphql).toHaveBeenCalledWith('useIGDEditNicknameMutation', {
        thread_id: 'thread-1',
        user_id: '456',
        nickname: 'Nick',
      });
    });

    it('fetchThread parses response into Thread', async () => {
      const client = new Client();
      const http = await loginAndGetHttp(client);
      vi.mocked(http.graphql).mockResolvedValueOnce({
        data: {
          thread: {
            thread_id: 'thread-1',
            thread_title: 'Test',
            users: [{ pk: '456', username: 'user1' }],
            left_users: [],
            items: [],
            read_state: 0,
            is_group: false,
            muted: false,
            admin_user_ids: [],
          },
        },
      });

      const thread = await client.fetchThread('thread-1');
      expect(thread.id).toBe('thread-1');
      expect(thread.name).toBe('Test');
    });

    it('fetchMessages returns Message array', async () => {
      const client = new Client();
      const http = await loginAndGetHttp(client);
      vi.mocked(http.graphql).mockResolvedValueOnce({
        data: {
          thread: {
            items: [
              { item_id: 'msg-1', user_id: '456', timestamp: '1700000000000000', item_type: 'text', text: 'Hi' },
            ],
          },
        },
      });

      const messages = await client.fetchMessages('thread-1');
      expect(messages).toHaveLength(1);
      expect(messages[0]!.id).toBe('msg-1');
    });
  });

  describe('REST actions', () => {
    async function loginAndGetHttp(client: Client) {
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const { HttpClient: HttpCtor } = await import('./http');
      const httpInstance = vi.mocked(HttpCtor).mock.results[0]!.value;
      return httpInstance;
    }

    it('createGroupThread sends correct body', async () => {
      const client = new Client();
      const http = await loginAndGetHttp(client);
      vi.mocked(http.rest).mockResolvedValueOnce({
        thread_id: 'new-thread',
        thread_title: 'Group',
        users: [],
        left_users: [],
        items: [],
        read_state: 0,
        is_group: true,
        muted: false,
        admin_user_ids: [],
      });

      const thread = await client.createGroupThread(['123', '456'], 'Group');

      expect(http.rest).toHaveBeenCalledWith('/api/v1/direct_v2/create_group_thread/', {
        method: 'POST',
        body: {
          recipient_users: '["123","456"]',
          thread_title: 'Group',
        },
      });
      expect(thread.id).toBe('new-thread');
    });

    it('createThread calls createGroupThread with single user', async () => {
      const client = new Client();
      const http = await loginAndGetHttp(client);
      vi.mocked(http.rest).mockResolvedValueOnce({
        thread_id: 'dm-thread',
        thread_title: null,
        users: [],
        left_users: [],
        items: [],
        read_state: 0,
        is_group: false,
        muted: false,
        admin_user_ids: [],
      });

      const thread = await client.createThread('789');
      expect(http.rest).toHaveBeenCalledWith('/api/v1/direct_v2/create_group_thread/', {
        method: 'POST',
        body: { recipient_users: '["789"]' },
      });
      expect(thread.id).toBe('dm-thread');
    });

    it('searchUsers sends correct query params', async () => {
      const client = new Client();
      const http = await loginAndGetHttp(client);

      await client.searchUsers('john');

      expect(http.rest).toHaveBeenCalledWith('/api/v1/direct_v2/ranked_recipients/', {
        query: { mode: 'universal', query: 'john', show_threads: 'true' },
      });
    });

    it('searchMessages sends correct query params', async () => {
      const client = new Client();
      const http = await loginAndGetHttp(client);

      await client.searchMessages('hello', { offset: 10 });

      expect(http.rest).toHaveBeenCalledWith('/api/v1/direct_v2/search_secondary/', {
        query: {
          query: 'hello',
          result_types: '["message_content"]',
          offsets: '{"message_content":10}',
        },
      });
    });

    it('fetchPendingThreads fetches from pending inbox', async () => {
      const client = new Client();
      const http = await loginAndGetHttp(client);
      vi.mocked(http.rest).mockResolvedValueOnce({ inbox: { threads: [] } });

      const threads = await client.fetchPendingThreads();
      expect(threads).toEqual([]);
      expect(http.rest).toHaveBeenCalledWith('/api/v1/direct_v2/pending_inbox/');
    });

    it('approveThreads sends correct body', async () => {
      const client = new Client();
      const http = await loginAndGetHttp(client);

      await client.approveThreads(['t1', 't2']);

      expect(http.rest).toHaveBeenCalledWith('/api/v1/direct_v2/threads/approve_multiple/', {
        method: 'POST',
        body: { thread_ids: '["t1","t2"]' },
      });
    });

    it('declineThreads sends correct body', async () => {
      const client = new Client();
      const http = await loginAndGetHttp(client);

      await client.declineThreads(['t1']);

      expect(http.rest).toHaveBeenCalledWith('/api/v1/direct_v2/threads/decline_multiple/', {
        method: 'POST',
        body: { thread_ids: '["t1"]' },
      });
    });

    it('declineAllThreads sends POST', async () => {
      const client = new Client();
      const http = await loginAndGetHttp(client);

      await client.declineAllThreads();

      expect(http.rest).toHaveBeenCalledWith('/api/v1/direct_v2/threads/decline_all/', {
        method: 'POST',
      });
    });
  });

  describe('sendMedia', () => {
    const broadcastResponse = {
      item_id: 'sent-1',
      user_id: '123',
      timestamp: '1700000000000000',
      item_type: 'text',
    };

    async function loginAndGetHttp(client: Client) {
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const { HttpClient: HttpCtor } = await import('./http');
      const httpInstance = vi.mocked(HttpCtor).mock.results[0]!.value;
      vi.mocked(httpInstance.upload).mockResolvedValue({ id: '123456' });
      vi.mocked(httpInstance.rest).mockResolvedValue(broadcastResponse);
      return httpInstance;
    }

    it('sends photo via upload and broadcast', async () => {
      const client = new Client();
      const http = await loginAndGetHttp(client);

      const result = await client.sendMedia('thread-1', { photo: Buffer.from('img') });

      expect(http.upload).toHaveBeenCalledWith(Buffer.from('img'), 'photo.jpg');
      expect(http.rest).toHaveBeenCalledWith(
        '/api/v1/direct_v2/threads/broadcast/configure_photo/',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({
            content_type: 'photo',
            thread_id: 'thread-1',
          }),
        }),
      );
      expect(result.id).toBe('sent-1');
    });

    it('sends gif by ID', async () => {
      const client = new Client();
      const http = await loginAndGetHttp(client);

      await client.sendMedia('thread-1', { gif: 'xT9IgzoKnwFNmISR8I' });

      expect(http.rest).toHaveBeenCalledWith(
        '/api/v1/direct_v2/threads/broadcast/animated_media/',
        expect.objectContaining({
          body: expect.objectContaining({
            id: 'xT9IgzoKnwFNmISR8I',
          }),
        }),
      );
    });

    it('sends link', async () => {
      const client = new Client();
      const http = await loginAndGetHttp(client);

      await client.sendMedia('thread-1', { link: 'https://example.com', text: 'Check this' });

      expect(http.rest).toHaveBeenCalledWith(
        '/api/v1/direct_v2/threads/broadcast/link/',
        expect.objectContaining({
          body: expect.objectContaining({
            link_urls: '["https://example.com"]',
            link_text: 'Check this',
          }),
        }),
      );
    });

    it('throws when not connected', async () => {
      const client = new Client();
      await expect(client.sendMedia('thread-1', { photo: Buffer.from('x') })).rejects.toThrow('Client not connected');
    });
  });

  describe('destroy', () => {
    it('clears all state', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');

      await client.destroy();

      expect(client.connected).toBe(false);
      expect(client.readyAt).toBeNull();
      expect(client.user).toBeNull();
      expect(client.threads.size).toBe(0);
      expect(client.users.size).toBe(0);
      expect(mockMqttInstance.disconnect).toHaveBeenCalled();
    });

    it('clears typing timers', async () => {
      vi.useFakeTimers();

      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');

      const handler = mockMqttInstance.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'message',
      )![1] as (topic: string, payload: Buffer) => void;

      handler(
        '/ig_message_sync',
        Buffer.from(
          JSON.stringify({
            event: 'patch',
            data: [
              {
                op: 'add',
                path: '/direct_v2/threads/thread-1/activity_indicator_id/x',
                value: JSON.stringify({ sender_id: '456', activity_status: 1, ttl: 22000 }),
              },
            ],
            seq_id: 110,
          }),
        ),
      );

      await client.destroy();

      const typingStopHandler = vi.fn();
      client.on('typingStop', typingStopHandler);
      vi.advanceTimersByTime(30000);
      expect(typingStopHandler).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});
