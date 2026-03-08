import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Client } from './client';
import { DEFAULT_CLIENT_OPTIONS } from './constants';
import { ApiError, AuthError, IgBotError, TimeoutError, ValidationError } from './errors';
import { Thread } from './models/thread';

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
      username: 'testbot',
      seqId: 0,
    }),
  };
});

const defaultInboxResponse = {
  data: {
    get_slide_mailbox_for_iris_subscription: {
      iris_inactive_subscription_uq_seq_id: '100',
    },
  },
};

const mockHttpInstance = {
  graphql: vi.fn().mockResolvedValue(defaultInboxResponse),
  rest: vi.fn(),
  upload: vi.fn(),
};

vi.mock('./http', () => ({
  HttpClient: vi.fn().mockImplementation(() => mockHttpInstance),
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
    mockHttpInstance.graphql.mockResolvedValue(defaultInboxResponse);
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
      expect(client.user!.username).toBe('testbot');
      expect(readyHandler).toHaveBeenCalledOnce();
    });

    it('populates user cache with client user', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');

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
        '/ls_resp',
        '/ls_app_settings',
      ]);
    });

    it('publishes Lightspeed sync on login', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');

      expect(mockMqttInstance.publish).toHaveBeenCalledWith(
        '/ls_req',
        expect.any(String),
      );
      const lsCalls = mockMqttInstance.publish.mock.calls.filter(
        (c: unknown[]) => c[0] === '/ls_req',
      );
      expect(lsCalls.length).toBeGreaterThanOrEqual(1);
      const syncPayload = JSON.parse(lsCalls[0]![1] as string);
      expect(syncPayload.type).toBe(1); // LS_REQUEST_TYPE.SYNC
    });

    it('uptime is computed after login', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');

      expect(client.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  function getMessageHandler(client: Client): (topic: string, payload: Buffer) => void {
    client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
    const calls = mockMqttInstance.on.mock.calls;
    const messageCall = calls.find(
      (c: unknown[]) => c[0] === 'message',
    );
    return messageCall![1] as (topic: string, payload: Buffer) => void;
  }

  function seedThread(client: Client): void {
    const thread = Thread.from({
      thread_id: 'thread-1',
      thread_title: 'Test Thread',
      users: [{ pk: '456', username: 'user1', full_name: 'User One' }],
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
    }, client);
    client.threads.set(thread.id, thread);
  }

  describe('MQTT actions', () => {
    function simulateLsResponse(
      handler: (topic: string, payload: Buffer) => void,
      requestId: number,
    ) {
      handler('/ls_resp', Buffer.from(JSON.stringify({
        request_id: requestId,
        payload: '{}',
        sp: [],
        target: 0,
      })));
    }

    function getLastLsReqPayload(): Record<string, unknown> {
      const lsCalls = mockMqttInstance.publish.mock.calls.filter(
        (c: unknown[]) => c[0] === '/ls_req',
      );
      return JSON.parse(lsCalls[lsCalls.length - 1]![1] as string) as Record<string, unknown>;
    }

    it('sendText publishes correct payload via Lightspeed', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);
      mockMqttInstance.publish.mockClear();

      const promise = client.sendText('thread-1', 'Hello!');

      const envelope = getLastLsReqPayload();
      expect(envelope['type']).toBe(3); // LS_REQUEST_TYPE.TASK
      expect(envelope['app_id']).toBe('936619743392459');
      const requestId = envelope['request_id'] as number;

      const innerPayload = JSON.parse(envelope['payload'] as string);
      const task = innerPayload.tasks[0];
      const taskPayload = JSON.parse(task.payload);
      expect(taskPayload.text).toBe('Hello!');
      expect(task.label).toBe('46'); // SEND_MESSAGE

      simulateLsResponse(handler, requestId);
      await promise;
    });

    it('sendText includes reply metadata when replying', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);
      mockMqttInstance.publish.mockClear();

      const promise = client.sendText('thread-1', 'Reply', 'msg-parent');

      const envelope = getLastLsReqPayload();
      const requestId = envelope['request_id'] as number;
      const innerPayload = JSON.parse(envelope['payload'] as string);
      const taskPayload = JSON.parse(innerPayload.tasks[0].payload);
      expect(taskPayload.reply_metadata.reply_source_id).toBe('msg-parent');

      simulateLsResponse(handler, requestId);
      await promise;
    });

    it('sendReaction calls GraphQL mutation', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');

      client.sendReaction('thread-1', 'msg-1', '\u2764\ufe0f');

      expect(mockHttpInstance.graphql).toHaveBeenCalledWith('IGDirectReactionSendMutation', {
        thread_id: 'thread-1',
        item_id: 'msg-1',
        reaction_status: 'created',
        emoji: '\u2764\ufe0f',
      });
    });

    it('removeReaction calls GraphQL mutation with deleted status', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');

      client.removeReaction('thread-1', 'msg-1');

      expect(mockHttpInstance.graphql).toHaveBeenCalledWith('IGDirectReactionSendMutation', {
        thread_id: 'thread-1',
        item_id: 'msg-1',
        reaction_status: 'deleted',
      });
    });

    it('sendTyping publishes typing envelope via Lightspeed', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      mockMqttInstance.publish.mockClear();

      client.sendTyping('thread-1', 1);

      expect(mockMqttInstance.publish).toHaveBeenCalledWith('/ls_req', expect.any(String));
      const envelope = getLastLsReqPayload();
      expect(envelope['type']).toBe(2); // LS_REQUEST_TYPE.FOREGROUND
      const innerPayload = JSON.parse(envelope['payload'] as string);
      const typingPayload = JSON.parse(innerPayload.payload);
      expect(typingPayload.is_typing).toBe(1);
    });

    it('sendTyping publishes stop typing', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      mockMqttInstance.publish.mockClear();

      client.sendTyping('thread-1', 0);

      const envelope = getLastLsReqPayload();
      const innerPayload = JSON.parse(envelope['payload'] as string);
      const typingPayload = JSON.parse(innerPayload.payload);
      expect(typingPayload.is_typing).toBe(0);
    });
  });

  describe('GraphQL actions', () => {
    async function loginAndGetHttp(client: Client) {
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      return mockHttpInstance;
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
      return mockHttpInstance;
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
      vi.mocked(mockHttpInstance.upload).mockResolvedValue({ id: '123456' });
      vi.mocked(mockHttpInstance.rest).mockResolvedValue(broadcastResponse);
      return mockHttpInstance;
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

  describe('input validation', () => {
    it('send rejects empty threadId', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      expect(() => client.send('', 'hello')).toThrow(ValidationError);
    });

    it('sendText rejects empty threadId or text', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      expect(() => client.sendText('', 'hello')).toThrow(ValidationError);
      expect(() => client.sendText('t1', '')).toThrow(ValidationError);
    });

    it('sendReaction rejects empty args', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      expect(() => client.sendReaction('', 'item', '\ud83d\udc4d')).toThrow(ValidationError);
      expect(() => client.sendReaction('t1', '', '\ud83d\udc4d')).toThrow(ValidationError);
      expect(() => client.sendReaction('t1', 'item', '')).toThrow(ValidationError);
    });

    it('removeReaction rejects empty args', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      expect(() => client.removeReaction('', 'item')).toThrow(ValidationError);
      expect(() => client.removeReaction('t1', '')).toThrow(ValidationError);
    });

    it('fetchThread rejects empty threadId', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      await expect(client.fetchThread('')).rejects.toThrow(ValidationError);
    });

    it('createGroupThread rejects empty userIds', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      await expect(client.createGroupThread([])).rejects.toThrow(ValidationError);
    });

    it('searchUsers rejects empty query', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      await expect(client.searchUsers('')).rejects.toThrow(ValidationError);
    });

    it('approveThreads rejects empty array', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      await expect(client.approveThreads([])).rejects.toThrow(ValidationError);
    });

    it('declineThreads rejects empty array', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      await expect(client.declineThreads([])).rejects.toThrow(ValidationError);
    });
  });

  describe('send response handling', () => {
    function simulateLsResponse(
      handler: (topic: string, payload: Buffer) => void,
      requestId: number,
    ) {
      handler('/ls_resp', Buffer.from(JSON.stringify({
        request_id: requestId,
        payload: '{}',
        sp: [],
        target: 0,
      })));
    }

    function getRequestIdFromLastPublish(): number {
      const lsCalls = mockMqttInstance.publish.mock.calls.filter(
        (c: unknown[]) => c[0] === '/ls_req',
      );
      const lastCall = lsCalls[lsCalls.length - 1]!;
      const envelope = JSON.parse(lastCall[1] as string);
      return envelope.request_id as number;
    }

    it('sendText resolves on ok response', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);

      const promise = client.sendText('thread-1', 'Hello');
      const requestId = getRequestIdFromLastPublish();
      simulateLsResponse(handler, requestId);

      await expect(promise).resolves.toBeUndefined();
    });

    it('sendText rejects with TimeoutError on timeout', async () => {
      vi.useFakeTimers();

      const client = new Client({ sendTimeout: 100 });
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');

      const promise = client.sendText('thread-1', 'Hello');
      vi.advanceTimersByTime(100);

      await expect(promise).rejects.toThrow(TimeoutError);

      vi.useRealTimers();
    });

    it('multiple concurrent sends resolved by request_id', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);

      const results: number[] = [];
      const p1 = client.sendText('thread-1', 'First').then(() => results.push(1));
      const reqId1 = getRequestIdFromLastPublish();
      const p2 = client.sendText('thread-1', 'Second').then(() => results.push(2));
      const reqId2 = getRequestIdFromLastPublish();

      // Resolve second one first to prove request_id matching works
      simulateLsResponse(handler, reqId2);
      await p2;
      simulateLsResponse(handler, reqId1);
      await p1;

      expect(results).toEqual([2, 1]);
    });

    it('response with unknown request_id is silently ignored', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);

      // Should not throw
      simulateLsResponse(handler, 999999);
    });

    it('emits ApiError when ls_resp is unparseable', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);
      const errorHandler = vi.fn();
      client.on('error', errorHandler);

      handler('/ls_resp', Buffer.from('not json'));

      expect(errorHandler).toHaveBeenCalledOnce();
      expect(errorHandler.mock.calls[0]![0]).toBeInstanceOf(ApiError);
    });

    it('client.send routes text to sendText', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);

      const promise = client.send('thread-1', 'Hello');
      const requestId = getRequestIdFromLastPublish();
      simulateLsResponse(handler, requestId);

      await expect(promise).resolves.toBeUndefined();
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

    it('rejects pending sends', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');

      const promise = client.sendText('thread-1', 'Hello');
      await client.destroy();

      await expect(promise).rejects.toThrow('Client destroyed');
    });

    it('clears typing timers', async () => {
      vi.useFakeTimers();

      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      seedThread(client);

      const handler = getMessageHandler(client);

      // Send a Lightspeed typing indicator via /ls_resp
      handler('/ls_resp', Buffer.from(JSON.stringify({
        request_id: null,
        payload: JSON.stringify({
          step: [5, 0, 'thread-1', '456', 1, null],
        }),
        sp: ['updateTypingIndicator'],
        target: 0,
      })));

      await client.destroy();

      const typingStopHandler = vi.fn();
      client.on('typingStop', typingStopHandler);
      vi.advanceTimersByTime(30000);
      expect(typingStopHandler).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('emits destroyed disconnect reason', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');

      const disconnectHandler = vi.fn();
      client.on('disconnect', disconnectHandler);

      await client.destroy();

      expect(disconnectHandler).toHaveBeenCalledWith({
        reason: 'destroyed',
        willReconnect: false,
      });
    });

  });

  describe('reconnect', () => {
    function getMqttDisconnectHandler(): () => void {
      const disconnectCall = mockMqttInstance.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'disconnect',
      );
      return disconnectCall![1] as () => void;
    }

    function getMqttErrorHandler(): (err: Error) => void {
      const errorCall = mockMqttInstance.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'error',
      );
      return errorCall![1] as (err: Error) => void;
    }

    it('suppresses error events when disconnected', async () => {
      const client = new Client({ reconnect: true, reconnectInterval: 100 });
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const disconnectHandler = getMqttDisconnectHandler();
      const errorHandler = getMqttErrorHandler();

      const errors: Error[] = [];
      client.on('error', (err) => errors.push(err));

      disconnectHandler();
      errorHandler(new Error('connection refused'));

      expect(errors).toHaveLength(0);
    });

    it('emits error events when connected', async () => {
      const client = new Client({ reconnect: true, reconnectInterval: 100 });
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const errorHandler = getMqttErrorHandler();

      const errors: Error[] = [];
      client.on('error', (err) => errors.push(err));

      errorHandler(new Error('keepalive timeout'));

      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toBe('keepalive timeout');
    });

    it('caps backoff delay at 300,000ms', async () => {
      vi.useFakeTimers();

      const client = new Client({ reconnect: true, reconnectInterval: 1000, reconnectMaxRetries: 100 });
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const disconnectHandler = getMqttDisconnectHandler();

      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

      // Simulate many reconnect attempts to exceed the cap
      for (let i = 0; i < 20; i++) {
        disconnectHandler();
      }

      // After enough attempts, delay should be capped at 300_000
      const reconnectDelays = setTimeoutSpy.mock.calls
        .map((c) => c[1])
        .filter((d): d is number => typeof d === 'number' && d >= 1000);

      const maxDelay = Math.max(...reconnectDelays);
      expect(maxDelay).toBe(300_000);

      setTimeoutSpy.mockRestore();
      vi.useRealTimers();
    });

    it('does not reset reconnect counter immediately on success', async () => {
      vi.useFakeTimers();

      const client = new Client({ reconnect: true, reconnectInterval: 100 });
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const disconnectHandler = getMqttDisconnectHandler();

      disconnectHandler();
      await vi.advanceTimersByTimeAsync(100);

      // Counter should not be 0 immediately — stability timer pending
      // Disconnect again quickly (within 30s) to test it wasn't reset
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      disconnectHandler();

      const reconnectCalls = setTimeoutSpy.mock.calls.filter((c) => typeof c[1] === 'number' && c[1]! >= 100);
      const lastDelay = reconnectCalls[reconnectCalls.length - 1]?.[1];
      expect(lastDelay).toBeGreaterThan(100);

      setTimeoutSpy.mockRestore();
      vi.useRealTimers();
    });

    it('resets reconnect counter after 30s stability', async () => {
      vi.useFakeTimers();

      const client = new Client({ reconnect: true, reconnectInterval: 100 });
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const disconnectHandler = getMqttDisconnectHandler();

      disconnectHandler();
      await vi.advanceTimersByTimeAsync(100);

      // Wait the full 30s stability period
      await vi.advanceTimersByTimeAsync(30_000);

      // Now disconnect again — delay should be based on attempt 0 (reset)
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      disconnectHandler();

      const reconnectCalls = setTimeoutSpy.mock.calls.filter((c) => typeof c[1] === 'number' && c[1]! >= 100);
      const lastDelay = reconnectCalls[reconnectCalls.length - 1]?.[1];
      expect(lastDelay).toBe(100);

      setTimeoutSpy.mockRestore();
      vi.useRealTimers();
    });

    it('emits auth_expired and stops retrying on AuthError', async () => {
      vi.useFakeTimers();

      const client = new Client({ reconnect: true, reconnectInterval: 100 });
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const disconnectHandler = getMqttDisconnectHandler();

      mockMqttInstance.connect.mockRejectedValueOnce(new AuthError('expired'));

      const disconnectEvents: Array<{ reason: string; willReconnect: boolean }> = [];
      client.on('disconnect', (evt) => disconnectEvents.push(evt));

      disconnectHandler();
      await vi.advanceTimersByTimeAsync(100);

      const authEvent = disconnectEvents.find((e) => e.reason === 'auth_expired');
      expect(authEvent).toEqual({ reason: 'auth_expired', willReconnect: false });

      vi.useRealTimers();
    });

    it('retries on non-auth errors', async () => {
      vi.useFakeTimers();

      const client = new Client({ reconnect: true, reconnectInterval: 100 });
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const disconnectHandler = getMqttDisconnectHandler();

      mockMqttInstance.connect.mockRejectedValueOnce(new Error('network error'));

      const disconnectEvents: Array<{ reason: string; willReconnect: boolean }> = [];
      client.on('disconnect', (evt) => disconnectEvents.push(evt));

      disconnectHandler();
      await vi.advanceTimersByTimeAsync(100);

      // Initial disconnect emits once with willReconnect: true
      expect(disconnectEvents[0]).toEqual({ reason: 'connection_lost', willReconnect: true });
      // Failed retry schedules another attempt without emitting again
      expect(disconnectEvents).toHaveLength(1);

      vi.useRealTimers();
    });

    it('subscribes to all topics on reconnect', async () => {
      vi.useFakeTimers();

      const client = new Client({ reconnect: true, reconnectInterval: 100 });
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const disconnectHandler = getMqttDisconnectHandler();

      mockMqttInstance.subscribe.mockClear();
      disconnectHandler();
      await vi.advanceTimersByTimeAsync(100);

      expect(mockMqttInstance.subscribe).toHaveBeenCalledWith([
        '/ls_resp',
        '/ls_app_settings',
      ]);

      vi.useRealTimers();
    });
  });

});
