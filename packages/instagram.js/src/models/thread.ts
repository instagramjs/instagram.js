import { Collection } from '../collection';
import type { RawThread, ThreadParticipant } from '../types';
import type { Message } from './message';
import { createMessage } from './message';
import { User } from './user';

export class Thread {
  id: string;
  name: string | null;
  participants: ThreadParticipant[];
  messages: Collection<string, Message>;
  isGroup: boolean;
  unreadCount: number;
  muted: boolean;
  declare readonly client: unknown;

  constructor(data: {
    id: string;
    name?: string | null;
    participants?: ThreadParticipant[];
    messages?: Collection<string, Message>;
    isGroup?: boolean;
    unreadCount?: number;
    muted?: boolean;
    client?: unknown;
  }) {
    this.id = data.id;
    this.name = data.name ?? null;
    this.participants = data.participants ?? [];
    this.messages = data.messages ?? new Collection();
    this.isGroup = data.isGroup ?? false;
    this.unreadCount = data.unreadCount ?? 0;
    this.muted = data.muted ?? false;

    if (data.client !== undefined) {
      Object.defineProperty(this, 'client', {
        value: data.client,
        writable: true,
        enumerable: false,
        configurable: true,
      });
    }
  }

  /** Create a Thread from raw API data. */
  static from(data: RawThread, client?: unknown): Thread {
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
      client,
    });

    if (data.items) {
      for (const item of data.items) {
        const authorUser =
          users.find((u) => u.id === String(item.user_id)) ??
          new User({ id: String(item.user_id), partial: true });
        const message = createMessage(item, data.thread_id, authorUser, client);
        thread.messages.set(message.id, message);
      }
    }

    return thread;
  }


  send(_content: string): Promise<Message> {
    if (!this.client) {
      throw new Error('Cannot send: no client attached');
    }
    throw new Error('send is not implemented yet');
  }

  startTyping(): Promise<void> {
    if (!this.client) {
      throw new Error('Cannot startTyping: no client attached');
    }
    throw new Error('startTyping is not implemented yet');
  }

  stopTyping(): Promise<void> {
    if (!this.client) {
      throw new Error('Cannot stopTyping: no client attached');
    }
    throw new Error('stopTyping is not implemented yet');
  }

  markAsRead(): Promise<void> {
    if (!this.client) {
      throw new Error('Cannot markAsRead: no client attached');
    }
    throw new Error('markAsRead is not implemented yet');
  }

  mute(): Promise<void> {
    if (!this.client) {
      throw new Error('Cannot mute: no client attached');
    }
    throw new Error('mute is not implemented yet');
  }

  unmute(): Promise<void> {
    if (!this.client) {
      throw new Error('Cannot unmute: no client attached');
    }
    throw new Error('unmute is not implemented yet');
  }

  rename(_name: string): Promise<void> {
    if (!this.client) {
      throw new Error('Cannot rename: no client attached');
    }
    throw new Error('rename is not implemented yet');
  }

  setNickname(_userId: string, _nickname: string | null): Promise<void> {
    if (!this.client) {
      throw new Error('Cannot setNickname: no client attached');
    }
    throw new Error('setNickname is not implemented yet');
  }

  delete(): Promise<void> {
    if (!this.client) {
      throw new Error('Cannot delete: no client attached');
    }
    throw new Error('delete is not implemented yet');
  }

  fetchMessages(_options?: { limit?: number; before?: string }): Promise<Message[]> {
    if (!this.client) {
      throw new Error('Cannot fetchMessages: no client attached');
    }
    throw new Error('fetchMessages is not implemented yet');
  }

  searchMessages(
    _query: string,
    _options?: { offset?: number },
  ): Promise<{ results: unknown[]; hasMore: boolean; nextOffset: number | null }> {
    if (!this.client) {
      throw new Error('Cannot searchMessages: no client attached');
    }
    throw new Error('searchMessages is not implemented yet');
  }
}
