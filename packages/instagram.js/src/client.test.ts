import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Client, toRawMessage } from './client';
import { DEFAULT_CLIENT_OPTIONS } from './constants';
import { ApiError, AuthError, TimeoutError } from './errors';
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
        '/ig_message_sync',
        '/ig_sub_iris_response',
      ]);
    });

    it('publishes Iris subscription', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');

      expect(mockMqttInstance.publish).toHaveBeenCalledWith(
        '/ig_sub_iris',
        expect.stringContaining('"seq_id":100'),
      );
      const irisPayload = JSON.parse(mockMqttInstance.publish.mock.calls[0]![1] as string);
      expect(irisPayload.subscription_type).toBe('slide_gql');
      expect(irisPayload.graphql_config).toBeTruthy();
      const config = JSON.parse(irisPayload.graphql_config);
      expect(config.slide_doc_id).toBe('26744961355092044');
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

  function slideDelta(mutations: Record<string, unknown>[]): Buffer {
    return Buffer.from(JSON.stringify({
      data: { slide_delta_processor: mutations },
    }));
  }

  describe('delta processing', () => {
    it('emits message event for SlideUQPPNewMessage', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);
      const messageHandler = vi.fn();
      client.on('message', messageHandler);

      handler('/ig_message_sync', slideDelta([{
        __typename: 'SlideUQPPNewMessage',
        uq_seq_id: '101',
        message: {
          thread_fbid: 'thread-1',
          id: 'mid.msg-2',
          sender_fbid: '456',
          timestamp_ms: '1700000001000',
          text_body: 'New message',
          content: { __typename: 'SlideMessageText' },
        },
      }]));

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

      handler('/ig_message_sync', slideDelta([{
        __typename: 'SlideUQPPNewMessage',
        uq_seq_id: '102',
        message: {
          thread_fbid: 'thread-1',
          id: 'mid.msg-self',
          sender_fbid: '123',
          timestamp_ms: '1700000001000',
          text_body: 'Self sent',
          content: { __typename: 'SlideMessageText' },
        },
      }]));

      expect(messageHandler).not.toHaveBeenCalled();
    });

    it('emits messageDelete for SlideUQPPDeleteMessage', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      seedThread(client);
      const handler = getMessageHandler(client);
      const deleteHandler = vi.fn();
      client.on('messageDelete', deleteHandler);

      handler('/ig_message_sync', slideDelta([{
        __typename: 'SlideUQPPDeleteMessage',
        uq_seq_id: '103',
        thread_fbid: 'thread-1',
        message_id: 'msg-1',
      }]));

      expect(deleteHandler).toHaveBeenCalledOnce();
      expect(deleteHandler.mock.calls[0]![0].messageId).toBe('msg-1');
      expect(deleteHandler.mock.calls[0]![0].message).not.toBeNull();
    });

    it('emits rawDelta for every mutation', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);
      const rawHandler = vi.fn();
      client.on('rawDelta', rawHandler);

      handler('/ig_message_sync', slideDelta([{
        __typename: 'SlideUQPPNotYetImplementedMutation',
        uq_seq_id: '105',
      }]));

      expect(rawHandler).toHaveBeenCalledOnce();
      expect(rawHandler.mock.calls[0]![0].__typename).toBe('SlideUQPPNotYetImplementedMutation');
    });

    it('updates seqId from uq_seq_id', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);

      handler('/ig_message_sync', slideDelta([{
        __typename: 'SlideUQPPNotYetImplementedMutation',
        uq_seq_id: '200',
      }]));

      expect(client.getSeqId()).toBe(200);
    });

    it('emits threadDelete for SlideUQPPDeleteThread', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      seedThread(client);
      const handler = getMessageHandler(client);
      const threadDeleteHandler = vi.fn();
      client.on('threadDelete', threadDeleteHandler);

      handler('/ig_message_sync', slideDelta([{
        __typename: 'SlideUQPPDeleteThread',
        uq_seq_id: '106',
        thread_fbid: 'thread-1',
      }]));

      expect(threadDeleteHandler).toHaveBeenCalledOnce();
      expect(threadDeleteHandler.mock.calls[0]![0].threadId).toBe('thread-1');
      expect(client.threads.has('thread-1')).toBe(false);
    });

    it('emits reaction for SlideUQPPCreateReaction', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      seedThread(client);
      const handler = getMessageHandler(client);
      const reactionHandler = vi.fn();
      client.on('reaction', reactionHandler);

      handler('/ig_message_sync', slideDelta([{
        __typename: 'SlideUQPPCreateReaction',
        uq_seq_id: '108',
        thread_fbid: 'thread-1',
        message_id: 'msg-1',
        reaction: { reaction: '\u2764\ufe0f', sender_id: '456' },
      }]));

      expect(reactionHandler).toHaveBeenCalledOnce();
      expect(reactionHandler.mock.calls[0]![0].emoji).toBe('\u2764\ufe0f');
      expect(reactionHandler.mock.calls[0]![0].messageId).toBe('msg-1');
    });

    it('emits reactionRemove for SlideUQPPDeleteReaction', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      seedThread(client);
      const handler = getMessageHandler(client);
      const reactionHandler = vi.fn();
      client.on('reactionRemove', reactionHandler);

      handler('/ig_message_sync', slideDelta([{
        __typename: 'SlideUQPPDeleteReaction',
        uq_seq_id: '109',
        thread_fbid: 'thread-1',
        message_id: 'msg-1',
        reaction: { reaction: '\u2764\ufe0f', sender_id: '456' },
      }]));

      expect(reactionHandler).toHaveBeenCalledOnce();
      expect(reactionHandler.mock.calls[0]![0].emoji).toBe('\u2764\ufe0f');
    });

    it('emits readReceipt for SlideUQPPReadReceipt', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      seedThread(client);
      const handler = getMessageHandler(client);
      const receiptHandler = vi.fn();
      client.on('readReceipt', receiptHandler);

      handler('/ig_message_sync', slideDelta([{
        __typename: 'SlideUQPPReadReceipt',
        uq_seq_id: '110',
        thread_fbid: 'thread-1',
        read_receipt: {
          participant_fbid: '456',
          watermark_timestamp_ms: '1700000000000',
        },
      }]));

      expect(receiptHandler).toHaveBeenCalledOnce();
    });

    it('emits threadUpdate for SlideUQPPChangeMuteSettings', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      seedThread(client);
      const handler = getMessageHandler(client);
      const updateHandler = vi.fn();
      client.on('threadUpdate', updateHandler);

      handler('/ig_message_sync', slideDelta([{
        __typename: 'SlideUQPPChangeMuteSettings',
        uq_seq_id: '111',
        thread_fbid: 'thread-1',
        is_muted_now: true,
      }]));

      expect(updateHandler).toHaveBeenCalledOnce();
      expect(updateHandler.mock.calls[0]![0].changes.muted).toBe(true);
    });

    it('emits threadUpdate for SlideUQPPThreadName', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      seedThread(client);
      const handler = getMessageHandler(client);
      const updateHandler = vi.fn();
      client.on('threadUpdate', updateHandler);

      handler('/ig_message_sync', slideDelta([{
        __typename: 'SlideUQPPThreadName',
        uq_seq_id: '112',
        thread_fbid: 'thread-1',
        thread_name: 'New Name',
      }]));

      expect(updateHandler).toHaveBeenCalledOnce();
      expect(updateHandler.mock.calls[0]![0].changes.name).toBe('New Name');
    });

    it('ignores messages without slide_delta_processor', async () => {
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

    it('backfills user data from sender.user_dict', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);
      const messageHandler = vi.fn();
      client.on('message', messageHandler);

      handler('/ig_message_sync', slideDelta([{
        __typename: 'SlideUQPPNewMessage',
        uq_seq_id: '120',
        message: {
          thread_fbid: 'thread-1',
          id: 'mid.msg-backfill',
          sender_fbid: '789',
          timestamp_ms: '1700000001000',
          text_body: 'Hi',
          content: { __typename: 'SlideMessageText' },
          sender: {
            user_dict: {
              pk: '789',
              username: 'someuser',
              profile_pic_url: 'https://example.com/pic.jpg',
            },
          },
        },
      }]));

      expect(messageHandler).toHaveBeenCalledOnce();
      const author = messageHandler.mock.calls[0]![0].author;
      expect(author.username).toBe('someuser');
      expect(author.profilePicUrl).toBe('https://example.com/pic.jpg');
    });

    it('handles SlideUQPPAdminTextMessage as a message', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);
      const messageHandler = vi.fn();
      client.on('message', messageHandler);

      handler('/ig_message_sync', slideDelta([{
        __typename: 'SlideUQPPAdminTextMessage',
        uq_seq_id: '130',
        message: {
          thread_fbid: 'thread-1',
          id: 'mid.admin-1',
          sender_fbid: '456',
          timestamp_ms: '1700000001000',
          text_body: null,
          content: {
            __typename: 'SlideMessageAdminText',
            text_fragments: [{ plaintext: 'Group name changed' }],
          },
        },
      }]));

      expect(messageHandler).toHaveBeenCalledOnce();
      const msg = messageHandler.mock.calls[0]![0];
      expect(msg.type).toBe('actionLog');
      expect(msg.actionText).toBe('Group name changed');
    });
  });

  describe('MQTT actions', () => {
    function simulateSendResponse(
      handler: (topic: string, payload: Buffer) => void,
      response: Record<string, unknown> = { status: 'ok', payload: {} },
    ) {
      handler('/ig_send_message_response', Buffer.from(JSON.stringify(response)));
    }

    it('sendText publishes correct payload', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);
      mockMqttInstance.publish.mockClear();

      const promise = client.sendText('thread-1', 'Hello!');
      simulateSendResponse(handler);
      await promise;

      expect(mockMqttInstance.publish).toHaveBeenCalledWith(
        '/ig_send_message',
        expect.any(String),
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
      const handler = getMessageHandler(client);
      mockMqttInstance.publish.mockClear();

      const promise = client.sendText('thread-1', 'Reply', 'msg-parent');
      simulateSendResponse(handler);
      await promise;

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

      expect(mockMqttInstance.publish).toHaveBeenCalledWith('/ig_send_message', expect.any(String));
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

  describe('send response handling', () => {
    function simulateSendResponse(
      handler: (topic: string, payload: Buffer) => void,
      response: Record<string, unknown> = { status: 'ok', payload: {} },
    ) {
      handler('/ig_send_message_response', Buffer.from(JSON.stringify(response)));
    }

    it('sendText resolves on ok response', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);

      const promise = client.sendText('thread-1', 'Hello');
      simulateSendResponse(handler);

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

    it('sendText rejects with ApiError on error response', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);

      const promise = client.sendText('thread-1', 'Hello');
      simulateSendResponse(handler, { status: 'error', payload: {} });

      await expect(promise).rejects.toThrow(ApiError);
    });

    it('multiple concurrent sends resolved in FIFO order', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);

      const results: number[] = [];
      const p1 = client.sendText('thread-1', 'First').then(() => results.push(1));
      const p2 = client.sendText('thread-1', 'Second').then(() => results.push(2));

      simulateSendResponse(handler);
      await p1;
      simulateSendResponse(handler);
      await p2;

      expect(results).toEqual([1, 2]);
    });

    it('activity responses are skipped and do not resolve message sends', async () => {
      const client = new Client({ sendTimeout: 100 });
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);

      vi.useFakeTimers();
      const promise = client.sendText('thread-1', 'Hello');

      // Typing indicator response should be ignored
      simulateSendResponse(handler, {
        status: 'ok',
        payload: { activity_status: 1 },
      });

      // The send should still be pending — advance timers to trigger timeout
      vi.advanceTimersByTime(100);
      await expect(promise).rejects.toThrow(TimeoutError);

      vi.useRealTimers();
    });

    it('response with empty queue is silently ignored', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);

      // Should not throw
      simulateSendResponse(handler);
    });

    it('client.send routes text to sendText', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);

      const promise = client.send('thread-1', 'Hello');
      simulateSendResponse(handler);

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

    it('clears iris retry timer', async () => {
      vi.useFakeTimers();

      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);

      handler('/ig_sub_iris_response', Buffer.from(JSON.stringify({ error_type: 2 })));

      await client.destroy();

      mockMqttInstance.publish.mockClear();
      vi.advanceTimersByTime(10_000);
      expect(mockMqttInstance.publish).not.toHaveBeenCalled();

      vi.useRealTimers();
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

    it('subscribes to iris response topic on reconnect', async () => {
      vi.useFakeTimers();

      const client = new Client({ reconnect: true, reconnectInterval: 100 });
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const disconnectHandler = getMqttDisconnectHandler();

      mockMqttInstance.subscribe.mockClear();
      disconnectHandler();
      await vi.advanceTimersByTimeAsync(100);

      expect(mockMqttInstance.subscribe).toHaveBeenCalledWith([
        '/ig_message_sync',
        '/ig_sub_iris_response',
      ]);

      vi.useRealTimers();
    });
  });

  describe('iris subscription error handling', () => {
    it('performs resync on error_type 1', async () => {
      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);

      // Override graphql to return a new seq_id for the resync call.
      // Need two "once" values: handleIrisResponse synchronously triggers
      // performResync which awaits graphql, but vi.waitFor may also trigger
      // the default mock between microtasks. Two ensures the first real call gets 500.
      const resyncResponse = {
        data: {
          get_slide_mailbox_for_iris_subscription: {
            iris_inactive_subscription_uq_seq_id: '500',
          },
        },
      };
      mockHttpInstance.graphql.mockResolvedValueOnce(resyncResponse);
      mockHttpInstance.graphql.mockResolvedValueOnce(resyncResponse);

      const resyncHandler = vi.fn();
      client.on('resync', resyncHandler);

      handler('/ig_sub_iris_response', Buffer.from(JSON.stringify({ error_type: 1 })));

      await vi.waitFor(() => {
        expect(resyncHandler).toHaveBeenCalledOnce();
      });

      expect(client.getSeqId()).toBe(500);
      expect(mockMqttInstance.publish).toHaveBeenCalledWith(
        '/ig_sub_iris',
        expect.stringContaining('"seq_id":500'),
      );
    });

    it('schedules retry with exponential backoff on error_type 2', async () => {
      vi.useFakeTimers();

      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);
      mockMqttInstance.publish.mockClear();

      // First retry: 1s delay (2^0 * 1000)
      handler('/ig_sub_iris_response', Buffer.from(JSON.stringify({ error_type: 2 })));

      vi.advanceTimersByTime(999);
      expect(mockMqttInstance.publish).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(mockMqttInstance.publish).toHaveBeenCalledWith(
        '/ig_sub_iris',
        expect.any(String),
      );

      mockMqttInstance.publish.mockClear();

      // Second retry: 2s delay (2^1 * 1000)
      handler('/ig_sub_iris_response', Buffer.from(JSON.stringify({ error_type: 2 })));

      vi.advanceTimersByTime(1999);
      expect(mockMqttInstance.publish).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(mockMqttInstance.publish).toHaveBeenCalledOnce();

      mockMqttInstance.publish.mockClear();

      // Third retry: 4s delay (2^2 * 1000)
      handler('/ig_sub_iris_response', Buffer.from(JSON.stringify({ error_type: 2 })));

      vi.advanceTimersByTime(3999);
      expect(mockMqttInstance.publish).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(mockMqttInstance.publish).toHaveBeenCalledOnce();

      vi.useRealTimers();
    });

    it('caps iris retry backoff at 64s', async () => {
      vi.useFakeTimers();

      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);

      // Fire 7 error_type 2 responses to exceed 64s cap (2^7 = 128 > 64)
      for (let i = 0; i < 7; i++) {
        handler('/ig_sub_iris_response', Buffer.from(JSON.stringify({ error_type: 2 })));
        vi.advanceTimersByTime(100_000);
      }

      mockMqttInstance.publish.mockClear();
      handler('/ig_sub_iris_response', Buffer.from(JSON.stringify({ error_type: 2 })));

      vi.advanceTimersByTime(63_999);
      expect(mockMqttInstance.publish).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(mockMqttInstance.publish).toHaveBeenCalledOnce();

      vi.useRealTimers();
    });

    it('resets retry counter on success response', async () => {
      vi.useFakeTimers();

      const client = new Client();
      await client.login('sessionid=abc; csrftoken=csrf; ds_user_id=123');
      const handler = getMessageHandler(client);

      // Build up retry counter
      handler('/ig_sub_iris_response', Buffer.from(JSON.stringify({ error_type: 2 })));
      vi.advanceTimersByTime(10_000);
      handler('/ig_sub_iris_response', Buffer.from(JSON.stringify({ error_type: 2 })));
      vi.advanceTimersByTime(10_000);

      // Success resets counter
      handler('/ig_sub_iris_response', Buffer.from(JSON.stringify({ succeeded: true })));

      mockMqttInstance.publish.mockClear();

      // Next error should use 1s delay (2^0), not 4s (2^2)
      handler('/ig_sub_iris_response', Buffer.from(JSON.stringify({ error_type: 2 })));

      vi.advanceTimersByTime(999);
      expect(mockMqttInstance.publish).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(mockMqttInstance.publish).toHaveBeenCalledOnce();

      vi.useRealTimers();
    });
  });
});

function loadFixture(filename: string): Record<string, unknown> {
  const fixturePath = join(__dirname, '../../..', 'examples/message-type-logs', filename);
  return JSON.parse(readFileSync(fixturePath, 'utf-8'));
}

describe('toRawMessage', () => {
  it('parses text message', () => {
    const slide = loadFixture('SlideUQPPNewMessage_3592682.json');
    const raw = toRawMessage(slide);
    expect(raw).not.toBeNull();
    expect(raw!.item_type).toBe('text');
    expect(raw!.text).toBe('Hi');
    expect(raw!.user_id).toBe('17848424085136306');
    expect(raw!.snippet).toBe('evilbaby445: Hi');
    expect(raw!.is_forwarded).toBeUndefined();
  });

  it('parses image message with correct dimensions', () => {
    const slide = loadFixture('SlideUQPPNewMessage_3592683.json');
    const raw = toRawMessage(slide);
    expect(raw).not.toBeNull();
    expect(raw!.item_type).toBe('media');
    expect(raw!.media).toBeDefined();
    expect(raw!.media!.media_type).toBe(1);
    const candidate = raw!.media!.image_versions2?.candidates?.[0];
    expect(candidate).toBeDefined();
    expect(candidate!.width).toBe(442);
    expect(candidate!.height).toBe(960);
    expect(candidate!.url).toContain('fbcdn.net');
    expect(raw!.media!.preview_url).toContain('fbcdn.net');
  });

  it('parses video message (SlideMessageVideosContent)', () => {
    const slide = loadFixture('SlideUQPPNewMessage_3592684.json');
    const raw = toRawMessage(slide);
    expect(raw).not.toBeNull();
    expect(raw!.item_type).toBe('media');
    expect(raw!.media).toBeDefined();
    expect(raw!.media!.media_type).toBe(2);
    const candidate = raw!.media!.image_versions2?.candidates?.[0];
    expect(candidate).toBeDefined();
    expect(candidate!.url).toContain('.mp4');
    expect(candidate!.width).toBe(360);
    expect(candidate!.height).toBe(360);
  });

  it('parses link via XMA StandardXMA', () => {
    const slide = loadFixture('SlideUQPPNewMessage_3592690.json');
    const raw = toRawMessage(slide);
    expect(raw).not.toBeNull();
    expect(raw!.item_type).toBe('link');
    expect(raw!.link).toBeDefined();
    expect(raw!.link!.link_context?.link_url).toBe('https://www.instagram.com/link');
    expect(raw!.link!.link_context?.link_title).toBe('link');
  });

  it('parses reel share via XMA PortraitXMA with /reel/', () => {
    const slide = loadFixture('SlideUQPPNewMessage_3592688.json');
    const raw = toRawMessage(slide);
    expect(raw).not.toBeNull();
    expect(raw!.item_type).toBe('reel_share');
    expect(raw!.reel_share).toBeDefined();
    expect(raw!.reel_share!.media?.id).toBe('3834654736251454887');
    expect(raw!.reel_share!.media?.user?.username).toBe('edgyjexxo');
    expect(raw!.reel_share!.media?.image_versions2?.candidates?.[0]?.url).toContain('cdninstagram.com');
  });

  it('parses story share via XMA PortraitXMA with /stories/', () => {
    const slide = loadFixture('SlideUQPPNewMessage_3592691.json');
    const raw = toRawMessage(slide);
    expect(raw).not.toBeNull();
    expect(raw!.item_type).toBe('story_share');
    expect(raw!.story_share).toBeDefined();
    expect(raw!.story_share!.media?.user?.username).toBe('caden.001');
    expect(raw!.story_share!.media?.image_versions2?.candidates?.[0]?.url).toContain('cdninstagram.com');
  });

  it('parses voice media (AudiosContent)', () => {
    const slide = loadFixture('SlideUQPPNewMessage_3592692.json');
    const raw = toRawMessage(slide);
    expect(raw).not.toBeNull();
    expect(raw!.item_type).toBe('voice_media');
    expect(raw!.voice_media).toBeDefined();
    expect(raw!.voice_media!.media?.audio?.audio_src).toContain('fbsbx.com');
    expect(raw!.voice_media!.media?.audio?.duration).toBe(1407);
  });

  it('parses animated media (AnimatedMediaContent)', () => {
    const slide = loadFixture('SlideUQPPNewMessage_3592694.json');
    const raw = toRawMessage(slide);
    expect(raw).not.toBeNull();
    expect(raw!.item_type).toBe('animated_media');
    expect(raw!.animated_media).toBeDefined();
    expect(raw!.animated_media!.images?.fixed_height?.url).toContain('giphy.com');
    expect(raw!.animated_media!.images?.fixed_height?.width).toBe(200);
    expect(raw!.animated_media!.images?.fixed_height?.height).toBe(200);
    expect(raw!.animated_media!.is_sticker).toBe(true);
    expect(raw!.animated_media!.mp4_url).toContain('giphy.com');
  });

  it('parses raven media (SlideUQPPNewRavenMessage)', () => {
    const slide = loadFixture('SlideUQPPNewRavenMessage_3592695.json');
    const raw = toRawMessage(slide);
    expect(raw).not.toBeNull();
    expect(raw!.item_type).toBe('raven_media');
    expect(raw!.visual_media).toBeDefined();
    expect(raw!.visual_media!.view_mode).toBe('1');
    expect(raw!.visual_media!.media?.media_type).toBe(1);
    // attachment is null for view-once already viewed
    expect(raw!.visual_media!.media?.image_versions2).toBeUndefined();
  });

  it('parses admin text with text_fragments', () => {
    const slide = loadFixture('SlideUQPPAdminTextMessage_3592704.json');
    const raw = toRawMessage(slide);
    expect(raw).not.toBeNull();
    expect(raw!.item_type).toBe('action_log');
    expect(raw!.action_log).toBeDefined();
    expect(raw!.action_log!.description).toBe('evilbaby445 set your nickname to F.');
  });

  it('returns null for invalid slide data', () => {
    expect(toRawMessage({})).toBeNull();
    expect(toRawMessage({ message: {} })).toBeNull();
  });
});
