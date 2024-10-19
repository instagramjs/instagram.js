import EventEmitter from "eventemitter3";
import { type MqttMessage } from "mqtts";
import Int64 from "node-int64";

import { IG_REALTIME_HOST } from "./constants";
import { MqttotClient } from "./mqttot/client";
import {
  MqttotClientInfo,
  MqttotConnectionPacket,
} from "./thrift/structs/mqttot-connection";
import { deserializeThrift, serializeThrift } from "./thrift/util";
import {
  BackgroundStateTopic,
  ForegroundStateTopic,
  GraphqlTopic,
  IrisSubResponseTopic,
  IrisSubTopic,
  MessageSyncTopic,
  PubSubTopic,
  RealtimeSubTopic,
  RegionHintTopic,
  SendMessageResponseTopic,
  type Topic,
} from "./topics";
import {
  bigintToInt64,
  deflateAsync,
  objectToMap,
  safeUnzipAsync,
} from "./util";

export type IgRealtimeClientConnectOpts = {
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

export type IgRealtimeClientEvents = {
  error: (error: Error) => void;
  warning: (error: Error) => void;
};

const RealtimeTopics = [
  GraphqlTopic,
  PubSubTopic,
  SendMessageResponseTopic,
  IrisSubTopic,
  IrisSubResponseTopic,
  MessageSyncTopic,
  RealtimeSubTopic,
  RegionHintTopic,
  ForegroundStateTopic,
  BackgroundStateTopic,
] satisfies Topic[];

export class IgRealtimeClient extends EventEmitter {
  #mqttot: MqttotClient | null = null;
  #connectOpts: IgRealtimeClientConnectOpts | null = null;

  #getConnectionPayload(opts: IgRealtimeClientConnectOpts) {
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
    const result = serializeThrift(struct);
    console.log(result);
    console.log(deserializeThrift(MqttotConnectionPacket, result));
    return deflateAsync(serializeThrift(struct));
  }

  async connect(opts: IgRealtimeClientConnectOpts) {
    this.#connectOpts = opts;
    this.#mqttot = new MqttotClient({
      url: IG_REALTIME_HOST,
      autoReconnect: opts.autoReconnect,
      connectPayloadRequired: false,
      connectPayloadProvider: () => this.#getConnectionPayload(opts),
    });
    this.#mqttot.on("error", this.#handleMqttotError);
    this.#mqttot.on("warning", this.#handleMqttotWarning);
    this.#mqttot.on("message", this.#handleMqttotMessage);

    return new Promise<void>((resolve, reject) => {
      this.#mqttot!.on("connect", async () => {
        console.log("connected");
        await Promise.all([
          opts.graphqlSubscriptions?.length &&
            this.graphqlSubscribe(opts.graphqlSubscriptions),
          opts.skywalkerSubscriptions?.length &&
            this.skywalkerSubscribe(opts.skywalkerSubscriptions),
          opts.irisData && this.irisSubscribe(opts.irisData),
        ]);
        console.log("subscribed");
        resolve(void 0);
      });
      console.log("connecting");
      this.#mqttot!.connect({
        keepAlive: 20,
        protocolLevel: 3,
        clean: true,
        connectDelay: 60 * 1000,
      }).catch(reject);
    });
  }

  #handleMqttotError = (error: Error) => {
    this.emit("error", error);
    console.error(error);
  };

  #handleMqttotWarning = (error: Error) => {
    this.emit("warning", error);
    console.warn(error);
  };

  #handleMqttotMessage = async (message: MqttMessage) => {
    const unzipped = await safeUnzipAsync(message.payload);
    const topic = RealtimeTopics.find((t) => t.id === message.topic);

    if (topic?.parser) {
      const parsedMessages = topic.parser?.parseMessage(topic, unzipped);
      const messages = Array.isArray(parsedMessages)
        ? parsedMessages
        : [parsedMessages];
      for (const m of messages) {
        console.log(topic.path, m);
      }
    } else {
      console.log(message.topic, unzipped);
    }
  };

  async #publishToTopic(
    topic: string,
    compressedData: string | Buffer,
    qosLevel: 0 | 1,
  ) {
    if (!this.#mqttot) {
      throw new Error(
        "Can't public to topic before MqTToT client is initialized",
      );
    }
    return this.#mqttot.publish({
      topic,
      payload:
        typeof compressedData === "string"
          ? Buffer.from(compressedData)
          : compressedData,
      qosLevel,
    });
  }

  async updateSubscriptions(
    topic: Topic,
    data:
      | {
          subscribe?: string[];
          unsubscribe?: string[];
        }
      | Record<string, unknown>,
  ) {
    return this.#publishToTopic(
      topic.id,
      await deflateAsync(JSON.stringify(data)),
      1,
    );
  }

  graphqlSubscribe(subscriptions: string[]) {
    return this.updateSubscriptions(GraphqlTopic, { subscribe: subscriptions });
  }

  skywalkerSubscribe(subscriptions: string[]) {
    return this.updateSubscriptions(PubSubTopic, { subscribe: subscriptions });
  }

  irisSubscribe(data: { seq_id: number; snapshot_at_ms: number }) {
    return this.updateSubscriptions(IrisSubTopic, {
      seq_id: data.seq_id,
      snapshot_at_ms: data.snapshot_at_ms,
      snapshot_app_version: this.#connectOpts?.appVersion,
    });
  }
}
