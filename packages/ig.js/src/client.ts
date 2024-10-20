import {
  ApiClient,
  APP_VERSION,
  CAPABILITIES_HEADER,
  generateDeviceState,
  LANGUAGE,
} from "@igjs/api";
import { IgRealtimeClient, type IrisData } from "@igjs/realtime";
import EventEmitter from "eventemitter3";
import { type Logger } from "pino";

import { type StateAdapter } from "./barrel";
import { exportedClientStateSchema } from "./state/exported";

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

  #irisData?: IrisData;

  api = new ApiClient();
  realtime = new IgRealtimeClient();

  constructor(opts?: IgClientOpts) {
    super();
    this.opts = { ...structuredClone(defaultIgClientOpts), ...opts };
  }

  async #saveState() {
    if (this.opts.stateAdapter) {
      await this.opts.stateAdapter.saveState(
        exportedClientStateSchema.parse({
          ...this.api.exportState(),
          irisData: structuredClone(this.#irisData),
        }),
      );
    }
  }

  async #loadState() {
    const { stateAdapter } = this.opts;
    if (stateAdapter) {
      const state = exportedClientStateSchema.parse(
        await stateAdapter.loadState(),
      );
      if (state) {
        this.api.importState(state);
        this.#irisData = structuredClone(state.irisData);
      }
    }
  }

  async login(username: string, password: string) {
    await this.#loadState();

    this.api.on("response", () => {
      void this.#saveState();
    });

    if (!this.api.isAuthenticated()) {
      this.api.state.device = generateDeviceState(username);
      await this.api.qe.syncLoginExperiments();
      await this.api.account.login(username, password);
    }

    await this.api.qe.syncExperiments();

    this.realtime.on("irisSubResponse", (message) => {
      console.log(JSON.stringify(message, null, 2));
    });
    this.realtime.on("messageSync", (messages) => {
      console.log(JSON.stringify(messages, null, 2));
    });

    let shouldUpdateIrisData = true;
    if (!this.#irisData) {
      this.#irisData = await this.api.direct.getInbox().request();
      shouldUpdateIrisData = false;
    }
    await this.realtime.connect({
      appVersion: APP_VERSION,
      capabilitiesHeader: CAPABILITIES_HEADER,
      language: LANGUAGE.replace("_", "-"),
      userAgent: this.api.getUserAgent(),
      deviceId: this.api.state.device.phoneId,
      sessionId: this.api.state.auth?.sessionId ?? "",
      userId: this.api.state.auth?.userId ?? "",
      irisData: this.#irisData,
      autoReconnect: true,
    });

    if (shouldUpdateIrisData) {
      this.#irisData = await this.api.direct.getInbox().request();
    }
    await this.#saveState();

    this.emit("ready");
  }
}
