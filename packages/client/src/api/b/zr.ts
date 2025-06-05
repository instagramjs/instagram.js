import { type InstagramBFetchClient } from "@instagramjs/openapi-clients";

import { type DeviceConfig } from "~/device";
import { type ClientState } from "~/state";

import { generateBaseHeaders } from "../utils";

export class InstagramBZrApi {
  constructor(
    private readonly clientState: ClientState,
    private readonly deviceConfig: DeviceConfig,
    private readonly fetchClient: InstagramBFetchClient,
  ) {}

  async createDualTokens(options?: { fetchReason?: string }) {
    const result = await this.fetchClient.POST("/v1/zr/dual_tokens/", {
      params: {
        header: {
          ...generateBaseHeaders(this.clientState, this.deviceConfig),
          "content-type": "application/x-www-form-urlencoded",
        },
      },
      body: {
        normal_token_hash: "",
        device_id: this.deviceConfig.androidId,
        custom_device_id: this.deviceConfig.deviceId,
        fetch_reason: options?.fetchReason ?? "token_expired",
        _uuid: this.deviceConfig.uuid,
      },
    });

    return result.data;
  }
}
