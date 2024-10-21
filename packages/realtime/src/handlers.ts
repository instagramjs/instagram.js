import { bufferIsJson, deserializeThrift } from "@igjs/mqttot";

import { type IgRealtimeClient } from "./client";
import { MqttotGraphqlMessagePacket } from "./thrift/graphql-message";
import { MqttotRegionHintPacket } from "./thrift/region-hint-message";
import { MqttotSkywalkerMessagePacket } from "./thrift/skywalker-message";

export type RealtimeTopicHandler = {
  topic: string;
  path: string;
  handle: (client: IgRealtimeClient, payload: Buffer) => Promise<void> | void;
};

function parseGraphqlMessage(
  payload: Buffer,
): string | MqttotGraphqlMessagePacket {
  if (bufferIsJson(payload)) {
    return payload.toString("utf8");
  }
  return deserializeThrift(MqttotGraphqlMessagePacket, payload);
}

export type GraphqlMessage = string | MqttotGraphqlMessagePacket;
export const GraphqlTopicHandler: RealtimeTopicHandler = {
  topic: "9",
  path: "/graphql",
  handle: (client, payload) => {
    const data = parseGraphqlMessage(payload);
    client.emit("graphqlMessage", data);
  },
};

export type SkywalkerMessage = MqttotSkywalkerMessagePacket;
export const SkywalkerTopicHandler: RealtimeTopicHandler = {
  topic: "88",
  path: "/pubsub",
  handle: (client, payload) => {
    const data = deserializeThrift(MqttotSkywalkerMessagePacket, payload);
    client.emit("skywalkerMessage", data);
  },
};

export const SendMessageResponseTopicHandler: RealtimeTopicHandler = {
  topic: "133",
  path: "/ig_send_message_response",
  handle: (client, payload) => {
    const data = JSON.parse(payload.toString("utf8")) as unknown;
    client.emit("sendMessageResponse", data);
  },
};

export const IrisSubTopicHandler: RealtimeTopicHandler = {
  topic: "134",
  path: "/ig_sub_iris",
  handle: (client, payload) => {
    const data = payload.toString("utf8");
    console.log("ig_sub_iris", data);
  },
};

export type IrisSubResponseMessage = {
  succeeded: boolean;
  seq_id: number;
  error_type: string | null;
  error_message: string | null;
  subscribed_at_ms: number;
  latest_seq_id: number;
};
export const IrisSubResponseTopicHandler: RealtimeTopicHandler = {
  topic: "135",
  path: "/ig_sub_iris_response",
  handle: (client, payload) => {
    const data = JSON.parse(payload.toString("utf8")) as IrisSubResponseMessage;
    client.emit("irisSubResponse", data);
  },
};

type RawMessageSyncMessage = {
  event: string;
  data?: {
    op: string;
    path: string;
    value?: string;
  }[];
  message_type: number;
  seq_id: number;
  mutation_token: null | string;
  realtime: boolean;
  op?: string;
  path?: string;
  sampled?: boolean;
};
export type MessageSyncData = {
  op: string;
  path: string;
  value?: unknown;
};
export type MessageSyncMessage = Omit<RawMessageSyncMessage, "data"> & {
  data?: MessageSyncData[];
};
export const MessageSyncTopicHandler: RealtimeTopicHandler = {
  topic: "146",
  path: "/ig_message_sync",
  handle: (client, payload) => {
    const rawMessages = JSON.parse(
      payload.toString("utf8"),
    ) as RawMessageSyncMessage[];
    const messages = rawMessages.map((m) => ({
      ...m,
      data: m.data
        ? m.data.map((d) => ({
            ...d,
            value: d.value ? (JSON.parse(d.value) as unknown) : undefined,
          }))
        : undefined,
    })) as MessageSyncMessage[];
    client.emit("messageSync", messages);
  },
};

export const RealtimeSubTopicHandler: RealtimeTopicHandler = {
  topic: "149",
  path: "/ig_realtime_sub",
  handle: (client, payload) => {
    const data = parseGraphqlMessage(payload);
    console.log("ig_realtime_sub", data);
  },
};

export type RegionHintMessage = MqttotRegionHintPacket;
export const RegionHintTopicHandler: RealtimeTopicHandler = {
  topic: "150",
  path: "/t_region_hint",
  handle: (client, payload) => {
    const data = deserializeThrift(MqttotRegionHintPacket, payload);
    client.emit("regionHint", data);
  },
};

export const ForegroundStateTopicHandler: RealtimeTopicHandler = {
  topic: "151",
  path: "/t_foreground_state",
  handle: (client, payload) => {
    const data = JSON.parse(payload.toString("utf8")) as unknown;
    console.log("t_foreground_state", data);
  },
};

export const BackgroundStateTopicHandler: RealtimeTopicHandler = {
  topic: "152",
  path: "/t_background_state",
  handle: (client, payload) => {
    const data = JSON.parse(payload.toString("utf8")) as unknown;
    console.log("t_background_state", data);
  },
};

export const defaultRealtimeTopicHandlers = [
  GraphqlTopicHandler,
  SkywalkerTopicHandler,
  SendMessageResponseTopicHandler,
  IrisSubTopicHandler,
  IrisSubResponseTopicHandler,
  MessageSyncTopicHandler,
  RealtimeSubTopicHandler,
  RegionHintTopicHandler,
  ForegroundStateTopicHandler,
  BackgroundStateTopicHandler,
] satisfies RealtimeTopicHandler[];
