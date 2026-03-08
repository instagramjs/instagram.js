import type { Client } from '../client';
import { Collection } from '../collection';
import type { SendContent } from '../media';
import type { RawThread, ThreadParticipant, MessageSearchResponse } from '../types';
import { IgBotError } from '../errors';
import { defineHiddenProperty } from '../utils';
import type { Message } from './message';
import { createMessage } from './message';
import { User } from './user';

export class Thread {
  readonly id: string;
  name: string | null;
  readonly participants: readonly ThreadParticipant[];
  readonly messages: Collection<string, Message>;
  readonly isGroup: boolean;
  unreadCount: number;
  muted: boolean;
  declare readonly client: Client;

  constructor(data: {
    id: string;
    name?: string | null;
    participants?: readonly ThreadParticipant[];
    messages?: Collection<string, Message>;
    isGroup?: boolean;
    unreadCount?: number;
    muted?: boolean;
    client?: Client;
  }) {
    this.id = data.id;
    this.name = data.name ?? null;
    this.participants = data.participants ?? [];
    this.messages = data.messages ?? new Collection();
    this.isGroup = data.isGroup ?? false;
    this.unreadCount = data.unreadCount ?? 0;
    this.muted = data.muted ?? false;

    if (data.client !== undefined) {
      defineHiddenProperty(this, 'client', data.client);
    }
  }

  /**
   * Create a Thread from raw API data.
   *
   * @example
   * ```ts
   * const thread = Thread.from(rawThreadData, client);
   * thread.participants.forEach((p) => console.log(p.user.username));
   * ```
   */
  static from(data: RawThread, client?: Client): Thread {
    const users = data.users.map((u) => User.from(u, client));
    const adminIds = new Set(data.admin_user_ids ?? []);

    const participants: ThreadParticipant[] = users.map((user) => ({
      user,
      isAdmin: adminIds.has(user.id),
      nickname: null,
    }));

    const thread = new Thread({
      id: data.thread_id,
      name: data.thread_title ?? null,
      participants,
      isGroup: data.is_group ?? participants.length > 2,
      unreadCount: data.read_state ?? 0,
      muted: data.muted ?? false,
      ...(client !== undefined ? { client } : {}),
    });

    if (data.items) {
      for (const item of data.items) {
        const authorUser =
          users.find((u) => u.id === String(item.user_id)) ??
          new User({ id: String(item.user_id), partial: true });
        const message = createMessage({ raw: item, threadId: data.thread_id, author: authorUser, ...(client !== undefined ? { client } : {}) });
        thread.messages.set(message.id, message);
      }
    }

    return thread;
  }

  private requireClient(): Client {
    if (!this.client) {
      throw new IgBotError('No client attached', 'NO_CLIENT');
    }
    return this.client;
  }

  /**
   * Send a message to this thread.
   *
   * @example
   * ```ts
   * thread.send('Hello!');
   * thread.send({ photo: imageBuffer });
   * thread.send({ link: 'https://example.com' });
   * ```
   */
  send(content: string): Promise<void>;
  send(content: SendContent): Promise<Message>;
  send(content: string | SendContent): Promise<void> | Promise<Message> {
    const client = this.requireClient();
    if (typeof content === 'string') {
      return client.sendText(this.id, content);
    }
    return client.sendMedia(this.id, content);
  }

  /** Send typing start indicator. */
  startTyping(): void {
    this.requireClient().sendTyping(this.id, 1);
  }

  /** Send typing stop indicator. */
  stopTyping(): void {
    this.requireClient().sendTyping(this.id, 0);
  }

  /** Mark this thread as read. */
  async markAsRead(): Promise<void> {
    const lastMsg = this.messages.last();
    const timestamp = lastMsg ? String(lastMsg.timestamp.getTime() * 1000) : '0';
    await this.requireClient().markAsRead(this.id, timestamp);
  }

  /** Mute this thread. */
  async mute(): Promise<void> {
    await this.requireClient().muteThread(this.id, true);
    this.muted = true;
  }

  /** Unmute this thread. */
  async unmute(): Promise<void> {
    await this.requireClient().muteThread(this.id, false);
    this.muted = false;
  }

  /** Rename this thread. */
  async rename(name: string): Promise<void> {
    await this.requireClient().editThreadName(this.id, name);
    this.name = name;
  }

  /** Set a participant's nickname. */
  async setNickname(userId: string, nickname: string | null): Promise<void> {
    await this.requireClient().setNickname(this.id, userId, nickname);
  }

  /** Delete this thread. */
  async delete(): Promise<void> {
    await this.requireClient().deleteThread(this.id);
  }

  /** Fetch messages for this thread. */
  async fetchMessages(options?: { limit?: number; before?: string }): Promise<Message[]> {
    return this.requireClient().fetchMessages(this.id, options);
  }

  /** Search messages in this thread. */
  async searchMessages(
    query: string,
    options?: { offset?: number },
  ): Promise<MessageSearchResponse> {
    return this.requireClient().searchInThread(this.id, query, options);
  }
}
