import {
  bigintToInt64,
  deflateAsync,
  MqttotClient,
  objectToMap,
  safeUnzipAsync,
  serializeThrift,
} from "@instagramjs/mqttot";
import EventEmitter from "eventemitter3";
import { type MqttMessage } from "mqtts";
import Int64 from "node-int64";
import pino, { type Logger } from "pino";

import { RealtimeCommands } from "./commands";
import { IG_REALTIME_HOST } from "./constants";
import {
  defaultRealtimeTopicHandlers,
  type GraphqlMessage,
  type IrisSubResponseMessage,
  type MessageSyncMessage,
  type RealtimeTopicHandler,
  type RegionHintMessage,
  type SkywalkerMessage,
} from "./handlers";
import {
  MqttotClientInfo,
  MqttotConnectionPacket,
} from "./thrift/mqttot-connection";
import { RealtimeTopicId } from "./topics";

export type IrisData = { seq_id: number; snapshot_at_ms: number };

export type RealtimeClientOpts = {
  logger?: Logger;
  topicHandlers?: RealtimeTopicHandler[];
};

export type RealtimeClientConnectOpts = {
  appVersion: string;
  capabilitiesHeader: string;
  language: string;
  userAgent: string;
  deviceId: string;
  sessionId: string;
  userId: string;
  graphqlSubscriptions?: string[];
  skywalkerSubscriptions?: string[];
  irisData?: { seq_id: number; snapshot_at_ms: number };
  autoReconnect?: boolean;
};

export class RealtimeClient extends EventEmitter<{
  warning: (error: Error) => void;
  error: (error: Error) => void;
  connect: () => void;
  disconnect: (event?: { reason?: string | Error; reconnect: boolean }) => void;
  graphqlMessage: (message: GraphqlMessage) => void;
  skywalkerMessage: (message: SkywalkerMessage) => void;
  sendMessageResponse: (message: unknown) => void;
  irisSubResponse: (message: IrisSubResponseMessage) => void;
  messageSync: (message: MessageSyncMessage[]) => void;
  regionHint: (message: RegionHintMessage) => void;
}> {
  logger: Logger;
  topicHandlers: RealtimeTopicHandler[];

  commands = new RealtimeCommands(this);

  #mqttot: MqttotClient | null = null;
  #connectOpts: RealtimeClientConnectOpts | null = null;

  constructor(opts?: RealtimeClientOpts) {
    super();
    this.logger = opts?.logger ?? makeSilentLogger();
    this.topicHandlers = opts?.topicHandlers ?? defaultRealtimeTopicHandlers;
  }

  #getConnectionPayload(opts: RealtimeClientConnectOpts) {
    const struct = new MqttotConnectionPacket({
      clientIdentifier: opts.deviceId.substring(0, 20),
      clientInfo: new MqttotClientInfo({
        userId: bigintToInt64(BigInt(opts.userId)),
        userAgent: opts.userAgent,
        clientCapabilities: new Int64(183),
        endpointCapabilities: new Int64(0),
        publishFormat: 1,
        noAutomaticForeground: false,
        makeUserAvailableInForeground: true,
        deviceId: opts.deviceId,
        isInitiallyForeground: true,
        networkType: 1,
        networkSubtype: 0,
        clientMqttSessionId: bigintToInt64(
          BigInt(Date.now()) & BigInt(0xffffffff),
        ),
        subscribeTopics: [88, 135, 149, 150, 133, 146],
        clientType: "cookie_auth",
        appId: bigintToInt64(BigInt("567067343352427")),
        clientStack: 3,
      }),
      password: `sessionid=${opts.sessionId}`,
      appSpecificInfo: objectToMap({
        app_version: opts.appVersion,
        "X-IG-Capabilities": opts.capabilitiesHeader,
        everclear_subscriptions: JSON.stringify({
          inapp_notification_subscribe_comment: "17899377895239777",
          inapp_notification_subscribe_comment_mention_and_reply:
            "17899377895239777",
          video_call_participant_state_delivery: "17977239895057311",
          presence_subscribe: "17846944882223835",
        }),
        "User-Agent": opts.userAgent,
        "Accept-Language": opts.language,
        platform: "android",
        ig_mqtt_route: "django",
        pubsub_msg_type_blacklist: "direct, typing_type",
        auth_cache_enabled: "0",
      }),
    });
    return deflateAsync(serializeThrift(struct));
  }

  async connect(opts: RealtimeClientConnectOpts) {
    if (this.#mqttot) {
      throw new Error("Client already connected");
    }

    this.#connectOpts = opts;
    this.#mqttot = new MqttotClient({
      url: IG_REALTIME_HOST,
      autoReconnect: opts.autoReconnect,
      connectPayloadRequired: false,
      connectPayloadProvider: () => this.#getConnectionPayload(opts),
    });
    this.#mqttot.on("error", this.#handleError);
    this.#mqttot.on("warning", this.#handleWarning);
    this.#mqttot.on("connect", this.#handleConnect);
    this.#mqttot.on("disconnect", this.#handleDisconnect);

    if (this.topicHandlers) {
      for (const handler of this.topicHandlers) {
        this.#mqttot.listen(handler.topic, async (message: MqttMessage) => {
          const unzipped = await safeUnzipAsync(message.payload);
          await handler.handle(this, unzipped);
        });
      }
    }

    return new Promise<void>((resolve, reject) => {
      this.#mqttot!.on("connect", async () => {
        await Promise.all([
          opts.graphqlSubscriptions?.length &&
            this.graphqlSubscribe(opts.graphqlSubscriptions),
          opts.skywalkerSubscriptions?.length &&
            this.skywalkerSubscribe(opts.skywalkerSubscriptions),
          opts.irisData && this.irisSubscribe(opts.irisData),
        ]);
        resolve(void 0);
      });
      this.#mqttot!.connect({
        keepAlive: 20,
        protocolLevel: 3,
        clean: true,
        connectDelay: 60 * 1000,
      }).catch(reject);
    });
  }

  async disconnect() {
    if (this.#mqttot) {
      await this.#mqttot.disconnect();
      this.#mqttot = null;
    }
  }

  #handleError = (error: Error) => {
    this.emit("error", error);
  };

  #handleWarning = (error: Error) => {
    this.emit("warning", error);
  };

  #handleConnect = () => {
    this.emit("connect");
  };

  #handleDisconnect = (event?: {
    reason?: string | Error;
    reconnect: boolean;
  }) => {
    this.emit("disconnect", event);
  };

  async publishToTopic(topic: string, data: string | Buffer, qosLevel: 0 | 1) {
    if (!this.#mqttot) {
      throw new Error(
        "Can't publish to topic before MqTToT client is initialized",
      );
    }
    return this.#mqttot.publish({
      topic,
      payload: typeof data === "string" ? Buffer.from(data) : data,
      qosLevel,
    });
  }

  async updateSubscriptions(
    topic: string,
    data:
      | {
          subscribe?: string[];
          unsubscribe?: string[];
        }
      | Record<string, unknown>,
  ) {
    return this.publishToTopic(
      topic,
      await deflateAsync(JSON.stringify(data)),
      1,
    );
  }

  graphqlSubscribe(subscriptions: string[]) {
    return this.updateSubscriptions(RealtimeTopicId.GRAPHQL, {
      subscribe: subscriptions,
    });
  }

  skywalkerSubscribe(subscriptions: string[]) {
    return this.updateSubscriptions(RealtimeTopicId.SKYWALKER, {
      subscribe: subscriptions,
    });
  }

  irisSubscribe(data: IrisData) {
    return this.updateSubscriptions(RealtimeTopicId.IRIS_SUB, {
      seq_id: data.seq_id,
      snapshot_at_ms: data.snapshot_at_ms,
      snapshot_app_version: this.#connectOpts?.appVersion,
    });
  }
}

function makeSilentLogger() {
  return pino({
    level: "silent",
  });
}
