import { type ApiClient } from "./client";

export abstract class Paginator<R = unknown, I = unknown> {
  constructor(public client: ApiClient) {}

  [Symbol.asyncIterator]() {
    return {
      next: async () => {
        const items = await this.items();
        return {
          value: items,
          done: !this.hasMore(),
        };
      },
    };
  }

  abstract request(): Promise<R>;
  abstract items(): Promise<I[]>;
  abstract hasMore(): boolean;
}
