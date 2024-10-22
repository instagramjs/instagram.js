import { bufferIsJson, deserializeThrift } from "@instagramjs/mqttot";

import { type RealtimeClient } from "./client";
import { MqttotGraphqlMessagePacket } from "./thrift/graphql-message";
import { MqttotRegionHintPacket } from "./thrift/region-hint-message";
import { MqttotSkywalkerMessagePacket } from "./thrift/skywalker-message";
import { RealtimeTopicId } from "./topics";

export type RealtimeTopicHandler = {
  topic: string;
  path: string;
  handle: (client: RealtimeClient, payload: Buffer) => Promise<void> | void;
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
  topic: RealtimeTopicId.GRAPHQL,
  path: "/graphql",
  handle: (client, payload) => {
    const data = parseGraphqlMessage(payload);
    client.emit("graphqlMessage", data);
  },
};

export type SkywalkerMessage = MqttotSkywalkerMessagePacket;
export const SkywalkerTopicHandler: RealtimeTopicHandler = {
  topic: RealtimeTopicId.SKYWALKER,
  path: "/pubsub",
  handle: (client, payload) => {
    const data = deserializeThrift(MqttotSkywalkerMessagePacket, payload);
    client.emit("skywalkerMessage", data);
  },
};

export const SendMessageResponseTopicHandler: RealtimeTopicHandler = {
  topic: RealtimeTopicId.SEND_MESSAGE_RESPONSE,
  path: "/ig_send_message_response",
  handle: (client, payload) => {
    const data = JSON.parse(payload.toString("utf8")) as unknown;
    client.emit("sendMessageResponse", data);
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
  topic: RealtimeTopicId.IRIS_SUB_RESPONSE,
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
  topic: RealtimeTopicId.MESSAGE_SYNC,
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

export type RegionHintMessage = MqttotRegionHintPacket;
export const RegionHintTopicHandler: RealtimeTopicHandler = {
  topic: RealtimeTopicId.REGION_HINT,
  path: "/t_region_hint",
  handle: (client, payload) => {
    const data = deserializeThrift(MqttotRegionHintPacket, payload);
    client.emit("regionHint", data);
  },
};

export const defaultRealtimeTopicHandlers = [
  GraphqlTopicHandler,
  SkywalkerTopicHandler,
  SendMessageResponseTopicHandler,
  IrisSubResponseTopicHandler,
  MessageSyncTopicHandler,
  RegionHintTopicHandler,
] satisfies RealtimeTopicHandler[];
