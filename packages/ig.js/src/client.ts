import { Collection } from "@discordjs/collection";
import {
  ApiClient,
  APP_VERSION,
  CAPABILITIES_HEADER,
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

import { type StateAdapter } from "./state/adapters";
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
  threadNameUpdate: (
    thread: Thread,
    oldName: string | null,
    newName: string | null,
  ) => void;
  messageCreate: (message: Message) => void;
  messageDelete: (message: Message) => void;
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

  async #saveState() {
    const adapter = this.opts.stateAdapter;
    if (adapter) {
      await adapter.saveState(
        exportedClientStateSchema.parse({
          ...this.api.exportState(),
          irisData: structuredClone(this.#irisData),
        }),
      );
    }
  }

  async #loadState() {
    const adapter = this.opts.stateAdapter;
    if (adapter) {
      const unparsedState = await adapter.loadState();
      if (unparsedState) {
        const state = exportedClientStateSchema.parse(unparsedState);
        this.api.importState(state);
        this.#irisData = state.irisData;
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

    this.realtime.on("messageSync", (messages) => {
      void this.#handleMessageSync(messages);
    });

    const inbox = await this.api.direct.getInbox().request();
    if (!this.#irisData) {
      this.#irisData = {
        seq_id: inbox.seq_id,
        snapshot_at_ms: inbox.snapshot_at_ms,
      };
      await this.#saveState();
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

    const pendingInbox = await this.api.direct.getPendingInbox().request();
    const threads = [...inbox.inbox.threads, ...pendingInbox.inbox.threads];
    for (const thread of threads) {
      this.threads.set(
        thread.thread_id,
        new Thread(this, thread.thread_id, thread),
      );
    }

    this.emit("ready");
  }

  async #fetchThread(threadId: string) {
    const thread = this.threads.get(threadId);
    if (thread) {
      return thread;
    }

    const data = await this.api.direct.getById(threadId).request();
    const newThread = new Thread(this, threadId, data.thread);
    this.threads.set(threadId, newThread);
    return newThread;
  }

  async #handleMessageSync(messages: MessageSyncMessage[]) {
    console.log(JSON.stringify(messages, null, 2));

    for (const message of messages) {
      this.#irisData = {
        seq_id: message.seq_id,
        snapshot_at_ms: Date.now(),
      };

      if (!message.data) {
        continue;
      }
      for (const data of message.data) {
        switch (data.op) {
          case "replace": {
            const threadId = matchThreadPath(data.path);
            if (threadId) {
              const value = data.value as DirectThreadDto;
              const thread = await this.#fetchThread(threadId);
              if (thread) {
                const oldName = thread.name;
                thread.patch(value);

                if (oldName !== thread.name) {
                  this.emit("threadNameUpdate", thread, oldName, thread.name);
                }
              } else {
                const newThread = new Thread(this, threadId, value);
                this.threads.set(threadId, newThread);
              }
            }

            break;
          }

          case "add": {
            const matchedMessagePath = matchMessagePath(data.path);
            if (matchedMessagePath) {
              const value = data.value as DirectItemDto;
              if (
                value.item_type === "action_log" ||
                value.item_type === "video_call_event"
              ) {
                break;
              }

              const [threadId] = matchedMessagePath;
              const thread = await this.#fetchThread(threadId);
              if (thread) {
                const message = new Message(
                  this,
                  value.item_id,
                  threadId,
                  value,
                );
                this.messages.set(value.item_id, message);
                this.emit("messageCreate", message);
              }
            }

            break;
          }

          case "remove": {
            const matchedMessagePath = matchMessagePath(data.path);
            if (matchedMessagePath) {
              const [, itemId] = matchedMessagePath;
              const message = this.messages.get(itemId);
              if (message) {
                message.thread.messages.delete(itemId);
                this.messages.delete(itemId);
                this.emit("messageDelete", message);
              }
            }

            break;
          }
        }
      }
    }

    await this.#saveState();
  }
}

// function matchAdminPath(path: string): [string, string] | null {
//   const matched = /\/direct_v2\/threads\/(\d+)\/admin_user_ids\/(\d+)/.exec(
//     path,
//   );
//   if (matched) {
//     return [matched[1]!, matched[2]!];
//   }
//   return null;
// }

function matchMessagePath(path: string): [string, string] | null {
  const matched = /\/direct_v2\/threads\/(\d+)\/items\/(\d+)/.exec(path);
  if (matched) {
    return [matched[1]!, matched[2]!];
  }
  return null;
}

function matchThreadPath(path: string) {
  return /\/direct_v2\/inbox\/threads\/(\d+)/.exec(path)?.[1] ?? null;
}
