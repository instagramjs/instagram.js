import { Collection } from "@discordjs/collection";
import {
  ApiClient,
  APP_VERSION,
  CAPABILITIES_HEADER,
  generateDeviceState,
  LANGUAGE,
} from "@igjs/api";
import { type DirectThreadDto } from "@igjs/api-types";
import {
  IgRealtimeClient,
  type IrisData,
  type MessageSyncMessage,
} from "@igjs/realtime";
import EventEmitter from "eventemitter3";
import { type Logger } from "pino";

import { type StateAdapter } from "./barrel";
import { exportedClientStateSchema } from "./state/exported";
import { Message } from "./structures/message";
import { Thread } from "./structures/thread";

export type ClientOpts = {
  logger?: Logger;
  stateAdapter?: StateAdapter;
};
export const defaultClientOpts: ClientOpts = {};

export class Client extends EventEmitter<{
  ready: () => void;
  error: (error: Error) => void;
  messageCreate: (message: Message) => void;
}> {
  opts: ClientOpts;

  #irisData?: IrisData;

  api = new ApiClient();
  realtime = new IgRealtimeClient();

  threads = new Collection<string, Thread>();
  pendingThreads = new Collection<string, Thread>();

  constructor(opts?: ClientOpts) {
    super();
    this.opts = { ...structuredClone(defaultClientOpts), ...opts };
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
      const unparsed = await stateAdapter.loadState();
      if (unparsed) {
        const state = exportedClientStateSchema.parse(unparsed);
        this.api.importState(state);
        this.#irisData = structuredClone(state.irisData);
      }
    }
  }

  #patchThreads(
    threads: DirectThreadDto[],
    collection: Collection<string, Thread>,
  ) {
    for (const thread of threads) {
      const existing = collection.get(thread.thread_id);
      if (existing) {
        existing.patch(thread);
      } else {
        collection.set(
          thread.thread_id,
          new Thread(this, thread.thread_id, thread),
        );
      }
    }
  }

  async #getInbox() {
    const inbox = await this.api.direct.getInbox().request();
    this.#patchThreads(inbox.inbox.threads, this.threads);
    return inbox;
  }

  async #getPendingInbox() {
    const inbox = await this.api.direct.getPendingInbox().request();
    this.#patchThreads(inbox.inbox.threads, this.pendingThreads);
    return inbox;
  }

  async #getIrisData(): Promise<IrisData> {
    const inbox = await this.#getInbox();
    return {
      seq_id: inbox.seq_id,
      snapshot_at_ms: inbox.snapshot_at_ms,
    };
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

    this.realtime.on("messageSync", (messages) => {
      void this.#handleMessageSync(messages);
    });

    if (!this.#irisData) {
      this.#irisData = await this.#getIrisData();
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

    await this.#getPendingInbox();

    this.emit("ready");
  }

  async #handleMessageSync(messages: MessageSyncMessage[]) {
    let gotInbox = false;

    for (const message of messages) {
      this.#irisData = {
        seq_id: message.seq_id,
        snapshot_at_ms: Date.now(),
      };

      if (message.data) {
        for (const data of message.data) {
          const threadId = getThreadIdFromSyncPath(data.path);
          if (!threadId) {
            continue;
          }

          if (!this.threads.has(threadId) && !gotInbox) {
            await this.#getInbox();
            gotInbox = true;
          }

          const thread = this.threads.get(threadId);
          const item = data.value;
          if (thread) {
            const message = thread.messages.get(item.item_id);
            if (message) {
              message.patch(item);
            } else {
              const newMessage = new Message(thread, item.item_id, item);
              thread.messages.set(item.item_id, newMessage);
              this.emit("messageCreate", newMessage);
            }
          }
        }
      }
    }

    await this.#saveState();
  }
}

function getThreadIdFromSyncPath(path: string) {
  const match = /\/direct_v2\/threads\/(\d+)\//.exec(path);
  return match ? match[1] : null;
}
