import { MqttotGraphqlMessagePacket } from "./thrift/structs/graphql-message";
import { MqttotRegionHintPacket } from "./thrift/structs/region-hint-message";
import { MqttotSkywalkerMessagePacket } from "./thrift/structs/skywalker-message";
import { deserializeThrift } from "./thrift/util";
import { type Topic } from "./topics";
import { bufferIsJson } from "./util";

export interface Parser<T> {
  parseMessage(topic: Topic, payload: Buffer): T[] | T;
}

export type GraphqlMessage = {
  data: string | MqttotGraphqlMessagePacket;
};
export class GraphqlParser implements Parser<GraphqlMessage> {
  parseMessage(topic: Topic, payload: Buffer): GraphqlMessage {
    if (bufferIsJson(payload)) {
      return {
        data: payload.toString(),
      };
    }
    return {
      data: deserializeThrift(MqttotGraphqlMessagePacket, payload),
    };
  }
}

export type IrisMessage = {
  event: string;
  data?: unknown[];
  message_type: number;
  seq_id: number;
  mutation_token: null | string;
  realtime: boolean;
  op?: string;
  path?: string;
  sampled?: boolean;
};
export class IrisParser implements Parser<IrisMessage> {
  parseMessage(topic: Topic, payload: Buffer) {
    return JSON.parse(payload.toString("utf8")) as IrisMessage[];
  }
}

export type JsonMessage = {
  data: unknown;
};
export class JsonParser implements Parser<JsonMessage> {
  parseMessage(topic: Topic, payload: Buffer) {
    return {
      data: JSON.parse(payload.toString("utf8")) as unknown,
    };
  }
}

export type RegionHintMessage = {
  data: MqttotRegionHintPacket;
};
export class RegionHintParser implements Parser<RegionHintMessage> {
  parseMessage(topic: Topic, payload: Buffer) {
    return {
      data: deserializeThrift(MqttotRegionHintPacket, payload),
    };
  }
}

export type SkywalkerMessage = {
  data: MqttotSkywalkerMessagePacket;
};
export class SkywalkerParser implements Parser<SkywalkerMessage> {
  parseMessage(topic: Topic, payload: Buffer) {
    return {
      data: deserializeThrift(MqttotSkywalkerMessagePacket, payload),
    };
  }
}
