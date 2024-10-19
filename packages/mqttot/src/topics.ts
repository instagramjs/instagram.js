import {
  GraphqlParser,
  IrisParser,
  JsonParser,
  type Parser,
  RegionHintParser,
  SkywalkerParser,
} from "./parsers";

export type Topic<T = unknown> = {
  id: string;
  path: string;
  parser?: Parser<T>;
};

export const GraphqlTopic: Topic = {
  id: "9",
  path: "/graphql",
  parser: new GraphqlParser(),
};
export const PubSubTopic: Topic = {
  id: "88",
  path: "/pubsub",
  parser: new SkywalkerParser(),
};
export const SendMessageResponseTopic: Topic = {
  id: "133",
  path: "/ig_send_message_response",
  parser: new JsonParser(),
};
export const IrisSubTopic: Topic = {
  id: "134",
  path: "/ig_sub_iris",
};
export const IrisSubResponseTopic: Topic = {
  id: "135",
  path: "/ig_sub_iris_response",
  parser: new JsonParser(),
};
export const MessageSyncTopic: Topic = {
  id: "146",
  path: "/ig_message_sync",
  parser: new IrisParser(),
};
export const RealtimeSubTopic: Topic = {
  id: "149",
  path: "/ig_realtime_sub",
  parser: new GraphqlParser(),
};
export const RegionHintTopic: Topic = {
  id: "150",
  path: "/t_region_hint",
  parser: new RegionHintParser(),
};
export const ForegroundStateTopic: Topic = {
  id: "151",
  path: "/t_foreground_state",
  parser: new JsonParser(),
};
export const BackgroundStateTopic: Topic = {
  id: "152",
  path: "/t_background_state",
  parser: new JsonParser(),
};
