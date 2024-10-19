import Int64 from "node-int64";

import {
  MqttotClientInfo,
  MqttotConnectionPacket,
} from "~/thrift/structs/mqttot-connection";
import { deserializeThrift, serializeThrift } from "~/thrift/util";
import { bigintToInt64, objectToMap } from "~/util";

async function main() {
  console.time("serialize");
  const buffer = serializeThrift(
    new MqttotConnectionPacket({
      clientIdentifier: "1938b0b4-30f3-56ce-8",
      clientInfo: new MqttotClientInfo({
        userId: bigintToInt64(BigInt("69565573321")),
        userAgent:
          "Instagram 222.0.0.13.114 Android (24/7.0; 480dpi; 1080x1920; Xiaomi; MI 5s; capricorn; qcom; en_US; 350696709)",
        clientCapabilities: new Int64(183),
        endpointCapabilities: new Int64(0),
        publishFormat: 1,
        noAutomaticForeground: false,
        makeUserAvailableInForeground: true,
        deviceId: "1938b0b4-30f3-56ce-8ffe-59b8022a6ebb",
        isInitiallyForeground: true,
        networkType: 1,
        networkSubtype: 0,
        clientMqttSessionId: bigintToInt64(BigInt("2763605041")),
        subscribeTopics: [88, 135, 149, 150, 133, 146],
        clientType: "cookie_auth",
        appId: bigintToInt64(BigInt("567067343352427")),
        clientStack: 3,
      }),
      password:
        "sessionid=69565573321%3AzuxKUKZMA2SLA9%3A22%3AAYdJTIgPgwEp4YaLVVTFJxx_BjX21uuzZARuWoIfVQ",
      appSpecificInfo: objectToMap({
        app_version: "222.0.0.13.114",
        "X-IG-Capabilities": "3brTv70=",
        everclear_subscriptions:
          '{"inapp_notification_subscribe_comment":"17899377895239777","inapp_notification_subscribe_comment_mention_and_reply":"17899377895239777","video_call_participant_state_delivery":"17977239895057311","presence_subscribe":"17846944882223835"}',
        "User-Agent":
          "Instagram 222.0.0.13.114 Android (24/7.0; 480dpi; 1080x1920; Xiaomi; MI 5s; capricorn; qcom; en_US; 350696709)",
        "Accept-Language": "en-US",
        platform: "android",
        ig_mqtt_route: "django",
        pubsub_msg_type_blacklist: "direct, typing_type",
        auth_cache_enabled: "0",
      }),
    }),
  );
  console.log(buffer);
  console.timeEnd("serialize");

  console.time("deserialize");
  const object = deserializeThrift(MqttotConnectionPacket, buffer);
  console.log(object);
  console.timeEnd("deserialize");
}

void main();
