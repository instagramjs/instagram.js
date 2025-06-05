import { type InstagramBFetchClient } from "@instagramjs/openapi-clients";

import { type DeviceConfig } from "~/device";
import { type ClientState } from "~/state";

import { generateBaseHeaders } from "../utils";

export class InstagramBAttestationApi {
  constructor(
    private readonly clientState: ClientState,
    private readonly deviceConfig: DeviceConfig,
    private readonly fetchClient: InstagramBFetchClient,
  ) {}

  async createAndroidKeystore() {
    const result = await this.fetchClient.POST(
      "/v1/attestation/create_android_keystore/",
      {
        params: {
          header: {
            ...generateBaseHeaders(this.clientState, this.deviceConfig),
          },
        },
        body: {
          app_scoped_device_id: this.deviceConfig.deviceId,
          key_hash: "",
        },
      },
    );

    return result.data;
  }
}
