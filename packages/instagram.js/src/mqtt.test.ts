import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { MqttError } from './errors';
import type { Cookies, SessionData } from './types';
import { MqttClient } from './mqtt';

const cookies: Cookies = {
  sessionid: 'abc123',
  csrftoken: 'csrf456',
  ds_user_id: '12345678',
  mid: 'mid789',
};

const session: SessionData = {
  cookies,
  fbDtsg: 'dtsg',
  lsd: 'lsd',
  rolloutHash: '123',
  spinR: '123',
  spinB: 'trunk',
  spinT: '111',
  hs: 'hs',
  bloksVersion: 'bv',
  deviceId: 'dev-uuid',
  sessionId: '9999',
  igScopedId: '178414',
  seqId: 0,
};

class MockMqttClient extends EventEmitter {
  subscribe = vi.fn((_topics: unknown, callback: (err: Error | null) => void) => {
    callback(null);
  });
  publish = vi.fn();
  end = vi.fn();
}

vi.mock('mqtt', () => ({
  default: {
    connect: vi.fn(),
  },
}));

describe('MqttClient', () => {
  let mockInternalClient: MockMqttClient;

  beforeEach(async () => {
    mockInternalClient = new MockMqttClient();
    const mqttModule = await import('mqtt');
    vi.mocked(mqttModule.default.connect).mockReturnValue(
      mockInternalClient as unknown as ReturnType<typeof mqttModule.default.connect>,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('connect', () => {
    it('resolves on CONNACK', async () => {
      const client = new MqttClient(session, { keepAlive: 10 });

      const connectPromise = client.connect();
      mockInternalClient.emit('connect');

      await expect(connectPromise).resolves.toBeUndefined();
      expect(client.connected).toBe(true);
    });

    it('rejects on error before connect', async () => {
      const client = new MqttClient(session, { keepAlive: 10 });

      const connectPromise = client.connect();
      mockInternalClient.emit('error', new Error('connection refused'));

      await expect(connectPromise).rejects.toThrow(MqttError);
    });

    it('emits connect event', async () => {
      const client = new MqttClient(session, { keepAlive: 10 });
      const connectHandler = vi.fn();
      client.on('connect', connectHandler);

      const connectPromise = client.connect();
      mockInternalClient.emit('connect');
      await connectPromise;

      expect(connectHandler).toHaveBeenCalledOnce();
    });

    it('passes correct MQTT options', async () => {
      const client = new MqttClient(session, { keepAlive: 10 });

      const connectPromise = client.connect();
      mockInternalClient.emit('connect');
      await connectPromise;

      const mqttModule = await import('mqtt');
      const call = vi.mocked(mqttModule.default.connect).mock.calls[0]!;
      const url = call[0] as string;
      expect(url).toContain('edge-chat.instagram.com');
      expect(url).toContain('sid=9999');
      expect(url).toContain('cid=dev-uuid');

      const opts = call[1] as Record<string, unknown>;
      expect(opts['protocolId']).toBe('MQIsdp');
      expect(opts['protocolVersion']).toBe(3);
      expect(opts['clientId']).toBe('mqttwsclient');
      expect(opts['keepalive']).toBe(10);
    });
  });

  describe('subscribe', () => {
    it('subscribes to topics at QoS 1', async () => {
      const client = new MqttClient(session, { keepAlive: 10 });
      const connectPromise = client.connect();
      mockInternalClient.emit('connect');
      await connectPromise;

      await client.subscribe(['/ig_message_sync', '/ig_send_message_response']);

      expect(mockInternalClient.subscribe).toHaveBeenCalledWith(
        {
          '/ig_message_sync': { qos: 1 },
          '/ig_send_message_response': { qos: 1 },
        },
        expect.any(Function),
      );
    });

    it('throws MqttError when not connected', async () => {
      const client = new MqttClient(session, { keepAlive: 10 });
      await expect(client.subscribe(['/test'])).rejects.toThrow(MqttError);
    });

    it('rejects on subscribe error', async () => {
      const client = new MqttClient(session, { keepAlive: 10 });
      const connectPromise = client.connect();
      mockInternalClient.emit('connect');
      await connectPromise;

      mockInternalClient.subscribe.mockImplementationOnce(
        (_topics: unknown, callback: (err: Error | null) => void) => {
          callback(new Error('sub failed'));
        },
      );

      await expect(client.subscribe(['/test'])).rejects.toThrow(MqttError);
    });
  });

  describe('publish', () => {
    it('publishes to topic', async () => {
      const client = new MqttClient(session, { keepAlive: 10 });
      const connectPromise = client.connect();
      mockInternalClient.emit('connect');
      await connectPromise;

      client.publish('/ig_send_message', '{"action":"send_item"}');

      expect(mockInternalClient.publish).toHaveBeenCalledWith(
        '/ig_send_message',
        '{"action":"send_item"}',
        { qos: 0 },
      );
    });

    it('throws MqttError when not connected', () => {
      const client = new MqttClient(session, { keepAlive: 10 });
      expect(() => client.publish('/test', 'data')).toThrow(MqttError);
    });
  });

  describe('message handling', () => {
    it('emits message events', async () => {
      const client = new MqttClient(session, { keepAlive: 10 });
      const messageHandler = vi.fn();
      client.on('message', messageHandler);

      const connectPromise = client.connect();
      mockInternalClient.emit('connect');
      await connectPromise;

      const payload = Buffer.from('{"event":"patch"}');
      mockInternalClient.emit('message', '/ig_message_sync', payload);

      expect(messageHandler).toHaveBeenCalledWith('/ig_message_sync', payload);
    });
  });

  describe('disconnect', () => {
    it('sends disconnect and cleans up', async () => {
      const client = new MqttClient(session, { keepAlive: 10 });
      const connectPromise = client.connect();
      mockInternalClient.emit('connect');
      await connectPromise;

      client.disconnect();

      expect(mockInternalClient.end).toHaveBeenCalledWith(true);
      expect(client.connected).toBe(false);
    });

    it('emits disconnect on connection close', async () => {
      const client = new MqttClient(session, { keepAlive: 10 });
      const disconnectHandler = vi.fn();
      client.on('disconnect', disconnectHandler);

      const connectPromise = client.connect();
      mockInternalClient.emit('connect');
      await connectPromise;

      mockInternalClient.emit('close');

      expect(disconnectHandler).toHaveBeenCalledWith('connection_closed');
      expect(client.connected).toBe(false);
    });
  });
});
