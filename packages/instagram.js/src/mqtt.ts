import { EventEmitter } from 'node:events';
import mqtt from 'mqtt';
import { MQTT_ENDPOINT } from './constants';
import { MqttError } from './errors';
import { buildCookieString, buildMqttUsername } from './session';
import type { SessionData } from './types';

type MqttClientEvents = {
  connect: [];
  message: [topic: string, payload: Buffer];
  disconnect: [reason: string];
  error: [err: Error];
};

export class MqttClient extends EventEmitter<MqttClientEvents> {
  private readonly session: SessionData;
  private readonly keepAlive: number;
  private client: mqtt.MqttClient | null = null;
  private _connected = false;

  constructor(session: SessionData, options: { keepAlive: number }) {
    super();
    this.session = session;
    this.keepAlive = options.keepAlive;
  }

  get connected(): boolean {
    return this._connected;
  }

  /** Open WebSocket connection and send MQTT CONNECT. */
  async connect(): Promise<void> {
    const sid = this.session.sessionId;
    const cid = this.session.deviceId;
    const url = `${MQTT_ENDPOINT}?sid=${sid}&cid=${cid}`;
    const username = buildMqttUsername(this.session);
    const cookieHeader = buildCookieString(this.session.cookies);

    return new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new MqttError('MQTT connection timed out'));
      }, 30_000);

      this.client = mqtt.connect(url, {
        protocolId: 'MQIsdp',
        protocolVersion: 3,
        clientId: 'mqttwsclient',
        username,
        keepalive: this.keepAlive,
        clean: true,
        connectTimeout: 30_000,
        wsOptions: {
          headers: {
            'Cookie': cookieHeader,
            'Origin': 'https://www.instagram.com',
            'User-Agent': this.session.cookies.sessionid ? 'Mozilla/5.0' : '',
          },
        },
      });

      this.client.on('connect', () => {
        clearTimeout(timeoutId);
        this._connected = true;
        this.emit('connect');
        resolve();
      });

      this.client.on('message', (topic: string, payload: Buffer) => {
        this.emit('message', topic, payload);
      });

      this.client.on('close', () => {
        if (this._connected) {
          this._connected = false;
          this.emit('disconnect', 'connection_closed');
        }
      });

      this.client.on('error', (err: Error) => {
        clearTimeout(timeoutId);
        if (!this._connected) {
          reject(new MqttError('MQTT connection failed', err));
        } else {
          this.emit('error', err);
        }
      });

      this.client.on('offline', () => {
        if (this._connected) {
          this._connected = false;
          this.emit('disconnect', 'went_offline');
        }
      });
    });
  }

  /** Subscribe to one or more topics at QoS 1. */
  async subscribe(topics: string[]): Promise<void> {
    if (!this.client) {
      throw new MqttError('Not connected');
    }

    const subscriptions: Record<string, { qos: 0 | 1 | 2 }> = {};
    for (const topic of topics) {
      subscriptions[topic] = { qos: 1 };
    }

    return new Promise<void>((resolve, reject) => {
      this.client!.subscribe(subscriptions, (err) => {
        if (err) {
          reject(new MqttError('Subscribe failed', err));
        } else {
          resolve();
        }
      });
    });
  }

  /** Publish a message to a topic. */
  publish(topic: string, payload: string | Buffer, qos: 0 | 1 = 0): void {
    if (!this.client) {
      throw new MqttError('Not connected');
    }
    this.client.publish(topic, payload, { qos });
  }

  /** Send DISCONNECT and close the connection. */
  disconnect(): void {
    this._connected = false;
    if (this.client) {
      this.client.end(true);
      this.client = null;
    }
  }
}
