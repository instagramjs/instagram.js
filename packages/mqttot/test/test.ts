import { MqttotGraphqlMessagePacket } from "~/thrift/structs/graphql-message";
import { deserializeThrift, serializeThrift } from "~/thrift/util";

async function main() {
  console.time("serialize");
  const buffer = serializeThrift(
    new MqttotGraphqlMessagePacket({
      topic: "test",
      payload: "test2",
    }),
  );
  console.log(buffer);
  console.timeEnd("serialize");

  console.time("deserialize");
  const object = deserializeThrift(MqttotGraphqlMessagePacket, buffer);
  console.log(object);
  console.timeEnd("deserialize");
}

void main();
