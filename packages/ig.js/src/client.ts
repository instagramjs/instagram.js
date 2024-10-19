import {
  ApiClient,
  APP_VERSION,
  CAPABILITIES_HEADER,
  generateDeviceState,
  LANGUAGE,
} from "@igjs/api";
import { IgRealtimeClient } from "@igjs/mqttot";
import EventEmitter from "eventemitter3";
import { type Logger } from "pino";

import { type StateAdapter } from "./barrel";

export type IgClientEvents = {
  ready: () => void;
  error: (error: Error) => void;
};

export type IgClientOpts = {
  logger?: Logger;
  stateAdapter?: StateAdapter;
};
export const defaultIgClientOpts: IgClientOpts = {};

export class IgClient extends EventEmitter<IgClientEvents> {
  opts: IgClientOpts;

  api = new ApiClient();
  realtime = new IgRealtimeClient();

  constructor(opts?: IgClientOpts) {
    super();
    this.opts = { ...structuredClone(defaultIgClientOpts), ...opts };
  }

  async login(username: string, password: string) {
    const { stateAdapter } = this.opts;
    if (stateAdapter) {
      const state = await stateAdapter.loadState();
      if (state) {
        this.api.importState(state);
      }
    }

    this.api.on("response", () => {
      if (stateAdapter) {
        void stateAdapter.saveState(this.api.state);
      }
    });

    if (!this.api.isAuthenticated()) {
      this.api.state.device = generateDeviceState(username);
      await this.api.qe.syncLoginExperiments();
      await this.api.account.login(username, password);
    }

    await this.api.qe.syncExperiments();

    const sessionId = this.api.state.auth?.sessionId ?? "";
    const inbox = await this.api.direct.getInbox().request();
    await this.realtime.connect({
      appVersion: APP_VERSION,
      capabilitiesHeader: CAPABILITIES_HEADER,
      language: LANGUAGE.replace("_", "-"),
      userAgent: this.api.getUserAgent(),
      deviceId: this.api.state.device.phoneId,
      sessionId: sessionId,
      userId: this.api.state.auth?.userId ?? "",
      irisData: inbox,
      autoReconnect: true,
    });

    this.emit("ready");
  }
}
