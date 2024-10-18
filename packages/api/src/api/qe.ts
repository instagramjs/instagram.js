import { type ApiClient } from "~/client";
import { EXPERIMENTS, LOGIN_EXPERIMENTS } from "~/constants";

export type QeSyncResponseDto = {
  experiments: QeExperimentDto[];
  status: string;
};
export type QeExperimentDto = {
  name: string;
  group: string;
  additional_params: QeExperimentParamDto[];
  params: QeExperimentParamDto[];
};
export type QeExperimentParamDto = {
  name: string;
  value: string;
};

export class QeApi {
  constructor(public client: ApiClient) {}

  async syncExperiments() {
    return this.sync(EXPERIMENTS);
  }

  async syncLoginExperiments() {
    return this.sync(LOGIN_EXPERIMENTS);
  }

  async sync(experiments: string) {
    if (!this.client.state.device.uuid) {
      throw new Error("Cannot sync experiments without UUID");
    }
    let formData: Record<string, string> = {
      id: this.client.state.device.uuid,
    };

    const uuid = this.client.getUserId();
    const csrfToken = this.client.getCsrfToken();
    if (uuid && csrfToken) {
      formData = {
        _csrftoken: csrfToken,
        id: uuid,
        _uid: uuid,
        _uuid: uuid,
      };
    }

    const response = await this.client.makeRequest<QeSyncResponseDto>({
      method: "POST",
      url: "/api/v1/qe/sync/",
      headers: {
        "X-DEVICE-ID": this.client.state.device.uuid,
      },
      form: this.client.signFormData({ ...formData, experiments }),
    });
    return response;
  }
}
