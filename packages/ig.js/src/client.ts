import { Collection } from "@discordjs/collection";
import {
  ApiClient,
  APP_VERSION,
  CAPABILITIES_HEADER,
  type ExportedApiState,
  generateDeviceState,
  LANGUAGE,
} from "@igjs/api";
import { type DirectItemDto, type DirectThreadDto } from "@igjs/api-types";
import {
  IgRealtimeClient,
  type IrisData,
  type MessageSyncMessage,
} from "@igjs/realtime";
import EventEmitter from "eventemitter3";
import { type Logger } from "pino";

import { type StorageAdapter } from "./storage";
import { Message, type MessageAsJSON } from "./structures/message";
import { Thread, type ThreadAsJSON } from "./structures/thread";

export type ClientOpts = {
  logger?: Logger;
  storageAdapter?: StorageAdapter;
};
export const defaultClientOpts: ClientOpts = {};

enum StorageTable {
  STATE = "state",
  THREADS = "threads",
  MESSAGES = "messages",
}

enum StorageStateKey {
  API_STATE = "api-state",
  IRIS_DATA = "iris-data",
}

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
  messages = new Collection<string, Message>();

  constructor(opts?: ClientOpts) {
    super();
    this.opts = { ...structuredClone(defaultClientOpts), ...opts };
  }

  async #saveApiState() {
    await this.opts.storageAdapter?.set(
      StorageTable.STATE,
      StorageStateKey.API_STATE,
      this.api.exportState(),
    );
  }

  async #saveIrisData() {
    if (this.#irisData) {
      await this.opts.storageAdapter?.set(
        StorageTable.STATE,
        StorageStateKey.IRIS_DATA,
        this.#irisData,
      );
    }
  }

  async #loadStorage() {
    const adapter = this.opts.storageAdapter;
    if (!adapter) {
      return;
    }

    const state = await adapter.get(
      StorageTable.STATE,
      StorageStateKey.API_STATE,
    );
    if (state) {
      this.api.importState(state as ExportedApiState);
    }

    const irisData = await adapter.get(
      StorageTable.STATE,
      StorageStateKey.IRIS_DATA,
    );
    if (irisData) {
      this.#irisData = irisData as IrisData;
    }

    const threads = (await adapter.getAll(StorageTable.THREADS)) as Map<
      string,
      ThreadAsJSON
    >;
    for (const [id, data] of threads) {
      this.threads.set(id, Thread.fromJSON(this, data));
    }

    const messages = (await adapter.getAll(StorageTable.MESSAGES)) as Map<
      string,
      MessageAsJSON
    >;
    for (const [id, data] of messages) {
      this.messages.set(id, Message.fromJSON(this, data));
    }
  }

  async #patchThread(data: DirectThreadDto) {
    let thread = this.threads.get(data.thread_id);
    if (thread) {
      thread.patch(data);
    } else {
      thread = new Thread(this, data.thread_id, data);
      this.threads.set(data.thread_id, thread);
    }

    const adapter = this.opts.storageAdapter;
    if (adapter) {
      await adapter.set(StorageTable.THREADS, data.thread_id, {
        ...thread.toJSON(),
        messages: [],
      });
    }
  }

  async #patchMessage(
    threadId: string,
    data: DirectItemDto,
    emitOnCreate = false,
  ) {
    let message = this.messages.get(data.item_id);
    if (message) {
      message.patch(data);
    } else {
      message = new Message(this, data.item_id, threadId, data);
      this.messages.set(data.item_id, message);
      if (emitOnCreate) {
        this.emit("messageCreate", message);
      }
    }

    const adapter = this.opts.storageAdapter;
    if (adapter) {
      await adapter.set(StorageTable.MESSAGES, data.item_id, message.toJSON());
    }
  }

  async #patchThreads(data: DirectThreadDto[]) {
    await Promise.all(data.map((t) => this.#patchThread(t)));
    await Promise.all(
      data.map((t) =>
        t.items.map((i) => this.#patchMessage(t.thread_id, i, true)).flat(),
      ),
    );
  }

  async #fetchInbox() {
    const inbox = await this.api.direct.getInbox().request();
    await this.#patchThreads(inbox.inbox.threads);
    return inbox;
  }

  async #fetchPendingInbox() {
    const inbox = await this.api.direct.getPendingInbox().request();
    await this.#patchThreads(inbox.inbox.threads);
    return inbox;
  }

  async #fetchIrisData(): Promise<IrisData> {
    const inbox = await this.#fetchInbox();
    return {
      seq_id: inbox.seq_id,
      snapshot_at_ms: inbox.snapshot_at_ms,
    };
  }

  async login(username: string, password: string) {
    await this.#loadStorage();

    this.api.on("response", () => {
      void this.#saveApiState();
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
      this.#irisData = await this.#fetchIrisData();
      await this.#saveIrisData();
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

    await this.#fetchPendingInbox();

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
            await this.#fetchInbox();
            gotInbox = true;
          }
          await this.#patchMessage(threadId, data.value, true);
        }
      }
    }

    await this.#saveIrisData();
  }
}

function getThreadIdFromSyncPath(path: string) {
  const match = /\/direct_v2\/threads\/(\d+)\//.exec(path);
  return match ? match[1] : null;
}
