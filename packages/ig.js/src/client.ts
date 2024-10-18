import { ApiClient, generateDeviceState } from "@igjs/api";
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

    this.emit("ready");
  }
}
