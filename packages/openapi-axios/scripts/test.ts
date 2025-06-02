import { type InstagramOpenAPIPaths } from "@instagramjs/openapi-clients";
import axios from "axios";

import { OpenApiAxios } from "../src";

const client = new OpenApiAxios<InstagramOpenAPIPaths, "fetch">(
  axios.create({
    baseURL: "https://i.instagram.com/api",
  }),
  { validStatus: "fetch" },
);

async function mainAxios() {
  const response = await client.get("/v1/direct_v2/inbox/", {
    axios: {
      headers: {
        "x-ig-app-locale": "en_US",
        "x-ig-device-locale": "en_US",
        "x-ig-mapped-locale": "en_US",
        "x-pigeon-session-id": "UFS-0f443389-a4f7-495c-a722-c8b92f75348b-7",
        "x-pigeon-rawclienttime": "1748829240.233",
        "x-ig-bandwidth-speed-kbps": "2172.000",
        "x-ig-bandwidth-totalbytes-b": "144054076",
        "x-ig-bandwidth-totaltime-ms": "45250",
        "x-bloks-version-id":
          "16e9197b928710eafdf1e803935ed8c450a1a2e3eb696bff1184df088b900bcf",
        "x-ig-www-claim":
          "hmac.AR0-_frIdH49_d_KvgO2xiZCQ9AxnCjNsYl9_jKnK4eVNMEi",
        "x-bloks-prism-button-version": "CONTROL",
        "x-bloks-prism-colors-enabled": "false",
        "x-bloks-prism-ax-base-colors-enabled": "false",
        "x-bloks-prism-font-enabled": "false",
        "x-bloks-is-layout-rtl": "false",
        "x-ig-device-id": "f78a83d7-b663-4f5d-a41b-cb8faf505166",
        "x-ig-family-device-id": "8c765e2d-3d1d-4508-a578-95c1ff152a63",
        "x-ig-android-id": "android-8f9a1062a223ba71",
        "x-ig-timezone-offset": "28800",
        "x-ig-nav-chain":
          "MainFeedFragment:feed_timeline:1:cold_start:1748826985.716::,DirectInboxFragment:direct_inbox:11:swipe:1748827879.921::",
        "x-fb-connection-type": "WIFI",
        "x-ig-connection-type": "WIFI",
        "x-ig-capabilities": "3brTv10=",
        "x-ig-app-id": "567067343352427",
        priority: "u=3",
        "user-agent":
          "Instagram 361.0.0.46.88 Android (33/13; 280dpi; 720x1471; samsung; SM-S134DL; a03su; mt6765; en_US; 674674275)",
        "accept-language": "en-US",
        authorization:
          "Bearer IGT:2:eyJkc191c2VyX2lkIjoiNTU5MDEzOTI2NzEiLCJzZXNzaW9uaWQiOiI1NTkwMTM5MjY3MSUzQTlFOW1vV3drZmhweGNCJTNBMSUzQUFZZUQzMVNXV0JUVnVpTWd6bkFoTlRLZjh5WU11WDBDTEFFR244MHMzUSJ9",
        "x-mid": "aDyzRQABAAELhxawjF998m9PcE8b",
        "ig-u-ds-user-id": "55901392671",
        "ig-u-rur":
          "VLL,55901392671,1780364589:01fe476d4bcdc618dd2f6279613713a054fca649c239537eec93b3ddcb2360eac5fa82f9",
        "ig-intended-user-id": "55901392671",
        "x-fb-http-engine": "Liger",
        "x-fb-client-ip": "True",
        "x-fb-server-cluster": "True",
        "accept-encoding": "gzip, deflate",
      },
    },
    query: {
      visual_message_return_type: "unseen",
      eb_device_id: "0",
      igd_request_log_tracking_id: "28bacc76-711f-4b5a-bce4-31359f2b9c91",
      no_pending_badge: "true",
      thread_message_limit: "5",
      persistentBadging: "true",
      limit: "15",
      is_prefetching: "false",
      fetch_reason: "manual_refresh",
    },
  });

  console.log(response.data);
}

mainAxios();
