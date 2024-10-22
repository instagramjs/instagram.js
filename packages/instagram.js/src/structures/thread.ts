import { Collection } from "@discordjs/collection";
import { type DirectSendOpts } from "@instagramjs/api";
import { type DirectThreadDto } from "@instagramjs/api-types";

import { type Client } from "~/client";

import { Message, type MessageAsJSON } from "./message";

export type ThreadAsJSON = Pick<
  Thread,
  | "id"
  | "name"
  | "isMuted"
  | "isVoiceMuted"
  | "isPinned"
  | "isNamed"
  | "isPending"
  | "isGroup"
  | "isSpam"
  | "isCalling"
  | "approvalIsRequiredForNewMembers"
  | "adminUserIds"
  | "pendingUserIds"
> & {
  lastActivityAt: string;
  messages: MessageAsJSON[];
};

export type StartTypingOpts = { duration?: number; disableOnSend?: boolean };

export class Thread {
  name: string | null = null;
  isMuted = false;
  isVoiceMuted = false;
  isPinned = false;
  isNamed = false;
  isPending = false;
  isGroup = false;
  isSpam = false;
  isCalling = false;
  approvalIsRequiredForNewMembers = false;
  adminUserIds: string[] = [];
  pendingUserIds: string[] = [];
  lastActivityAt = new Date();
  messages = new Collection<string, Message>();

  isTyping = false;
  #disableTypingOnSend: boolean | null = null;
  #keepTypingAliveInterval: NodeJS.Timeout | null = null;

  constructor(
    public client: Client,
    public id: string,
    data?: DirectThreadDto,
  ) {
    if (data) {
      this.patch(data);
    }
  }

  #sortMessages() {
    this.messages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  patch(data: Partial<DirectThreadDto>) {
    if ("thread_title" in data) {
      this.name = data.thread_title ?? null;
    }
    if ("muted" in data) {
      this.isMuted = !!data.muted;
    }
    if ("vc_muted" in data) {
      this.isVoiceMuted = !!data.vc_muted;
    }
    if ("is_pin" in data) {
      this.isPinned = !!data.is_pin;
    }
    if ("named" in data) {
      this.isNamed = !!data.named;
    }
    if ("pending" in data) {
      this.isPending = !!data.pending;
    }
    if ("is_group" in data) {
      this.isGroup = !!data.is_group;
    }
    if ("spam" in data) {
      this.isSpam = !!data.spam;
    }
    if ("is_spam" in data) {
      this.isSpam = !!data.spam;
    }
    this.isCalling = !!data.video_call_id;
    if ("approval_required_for_new_members" in data) {
      this.approvalIsRequiredForNewMembers =
        !!data.approval_required_for_new_members;
    }
    if ("admin_user_ids" in data) {
      this.adminUserIds = data.admin_user_ids?.map((id) => id.toString()) ?? [];
    }
    if ("pending_user_ids" in data) {
      this.pendingUserIds =
        data.pending_user_ids?.map((id) => id.toString()) ?? [];
    }
    if ("last_activity_at" in data) {
      this.lastActivityAt = new Date((data.last_activity_at ?? 1000) / 1000);
    }
    if (data.items) {
      for (const item of data.items) {
        const existing = this.messages.get(item.item_id);
        if (existing) {
          existing.patch(item);
        } else {
          this.messages.set(
            item.message_id,
            new Message(this.client, item.item_id, this.id, item),
          );
        }
      }
    }
    this.#sortMessages();
  }

  toJSON(): ThreadAsJSON {
    return {
      id: this.id,
      name: this.name,
      isMuted: this.isMuted,
      isVoiceMuted: this.isVoiceMuted,
      isPinned: this.isPinned,
      isNamed: this.isNamed,
      isPending: this.isPending,
      isGroup: this.isGroup,
      isSpam: this.isSpam,
      isCalling: this.isCalling,
      approvalIsRequiredForNewMembers: this.approvalIsRequiredForNewMembers,
      adminUserIds: this.adminUserIds,
      pendingUserIds: this.pendingUserIds,
      lastActivityAt: this.lastActivityAt.toString(),
      messages: this.messages.map((m) => m.toJSON()),
    };
  }

  async fetch() {
    const data = await this.client.api.direct.getById(this.id);
    this.patch(data);
  }

  async approve() {
    await this.client.api.direct.approve(this.id);
    this.isPending = false;
  }

  async send(text: string, replyTo?: Message) {
    const opts: DirectSendOpts = {
      threadIds: [this.id],
      text,
    };
    if (replyTo) {
      opts.replyTo = {
        itemId: replyTo.id,
        clientContext: replyTo.clientContext ?? undefined,
      };
    }

    const response = this.client.api.direct.send(opts);
    if (this.#disableTypingOnSend) {
      void this.stopTyping();
    }
    return response;
  }

  async #keepTypingAlive() {
    if (this.isTyping) {
      await this.client.realtime.commands.indicateActivity({
        threadId: this.id,
        isActive: true,
      });
    } else if (this.#keepTypingAliveInterval) {
      clearInterval(this.#keepTypingAliveInterval);
      this.#keepTypingAliveInterval = null;
    }
  }

  async startTyping({ duration, disableOnSend }: StartTypingOpts = {}) {
    this.isTyping = true;

    await this.client.realtime.commands.indicateActivity({
      threadId: this.id,
      isActive: true,
    });

    this.#disableTypingOnSend = disableOnSend ?? true;
    this.#keepTypingAliveInterval = setInterval(
      this.#keepTypingAlive.bind(this),
      9000,
    );
    setTimeout(this.stopTyping.bind(this), duration ?? 10000);
  }

  async stopTyping() {
    if (!this.isTyping) {
      return;
    }

    if (this.#keepTypingAliveInterval) {
      clearTimeout(this.#keepTypingAliveInterval);
      this.#keepTypingAliveInterval = null;
    }
    this.isTyping = false;
    this.#disableTypingOnSend = null;

    await this.client.realtime.commands.indicateActivity({
      threadId: this.id,
      isActive: false,
    });
  }
}
