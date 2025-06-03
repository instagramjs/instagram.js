import { type InstagramBFetchClient } from "@instagramjs/openapi-clients";

import { type DeviceConfig } from "~/device";

import { generateBaseHeaders } from "./utils";

export async function getDualTokens(
  deviceConfig: DeviceConfig,
  fetchClient: InstagramBFetchClient,
) {
  const result = await fetchClient.POST("/v1/zr/dual_tokens/", {
    params: {
      // @ts-expect-error - TODO: fix this
      header: {
        ...generateBaseHeaders(deviceConfig),
        "content-type": "application/x-www-form-urlencoded",
      },
    },
    body: {
      normal_token_hash: "",
      device_id: deviceConfig.androidId,
      custom_device_id: deviceConfig.deviceId,
      fetch_reason: "token_expired",
      _uuid: deviceConfig.uuid,
    },
  });

  return result.data;
}

export default {
  getDualTokens,
};
