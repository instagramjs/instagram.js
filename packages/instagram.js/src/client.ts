import { Collection } from "@discordjs/collection";
import {
  ApiClient,
  type ApiClientOpts,
  CAPABILITIES_HEADER,
} from "@instagramjs/api";
import {
  type DirectItemDto,
  type DirectThreadDto,
} from "@instagramjs/api-types";
import {
  type IrisData,
  type MessageSyncMessage,
  RealtimeClient,
  type RealtimeClientOpts,
} from "@instagramjs/realtime";
import EventEmitter from "eventemitter3";
import pino, { type Logger } from "pino";

import { User } from "./barrel";
import { type StateAdapter } from "./state/adapters";
import { exportedClientStateSchema } from "./state/exported";
import { Message } from "./structures/message";
import { Thread } from "./structures/thread";

export type ClientOpts = {
  logger?: Logger;
  stateAdapter?: StateAdapter;
  api?: ApiClientOpts;
  realtime?: RealtimeClientOpts;
};

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
  logger: Logger;
  stateAdapter?: StateAdapter;

  api: ApiClient;
  realtime: RealtimeClient;

  threads = new Collection<string, Thread>();
  messages = new Collection<string, Message>();
  users = new Collection<string, User>();

  #irisData?: IrisData;

  constructor(opts?: ClientOpts) {
    super();
    this.logger = opts?.logger ?? makeSilentLogger();
    this.stateAdapter = opts?.stateAdapter;
    this.api = new ApiClient({
      ...opts?.api,
      logger: this.logger.child({ module: "api" }),
    });
    this.realtime = new RealtimeClient({
      ...opts?.realtime,
      logger: this.logger.child({ module: "realtime" }),
    });
  }

  async #saveState() {
    const adapter = this.stateAdapter;
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
    const adapter = this.stateAdapter;
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
      await this.api.qe.syncLoginExperiments();
      await this.api.account.login(username, password);
    }

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
      appVersion: this.api.appVersion,
      capabilitiesHeader: CAPABILITIES_HEADER,
      language: this.api.language.replace("_", "-"),
      userAgent: this.api.generateUserAgent(),
      deviceId: this.api.device.phoneId,
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

    const data = await this.api.direct.getById(threadId);
    const newThread = new Thread(this, threadId, data);
    this.threads.set(threadId, newThread);
    return newThread;
  }

  async #fetchUser(userId: string) {
    const user = this.users.get(userId);
    if (user) {
      return user;
    }

    const data = await this.api.user.getUser(userId);
    const newUser = new User(this, data);
    this.users.set(userId, newUser);
    return newUser;
  }

  async #handleMessageSync(messages: MessageSyncMessage[]) {
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
                if ("user_id" in value) {
                  await this.#fetchUser(value.user_id.toString());
                }
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

function makeSilentLogger() {
  return pino({
    level: "silent",
  });
}
