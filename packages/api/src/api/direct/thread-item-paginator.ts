import {
  type DirectItemDto,
  type DirectThreadResponseDto,
} from "@igjs/api-types";

import { type ApiClient } from "~/client";
import { Paginator } from "~/paginator";

export class DirectThreadItemsPaginator extends Paginator<
  DirectThreadResponseDto,
  DirectItemDto
> {
  cursor?: string;
  #hasMore = false;

  constructor(
    client: ApiClient,
    public threadId: string,
  ) {
    super(client);
  }

  async request() {
    const response = await this.client.makeRequest<DirectThreadResponseDto>({
      url: `/api/v1/direct_v2/threads/${this.threadId}/`,
      method: "GET",
      params: {
        visual_message_return_type: "unseen",
        cursor: this.cursor,
        direction: "older",
        limit: 10,
      },
    });
    this.cursor = response.thread.oldest_cursor;
    this.#hasMore = !response.thread.has_older;
    return response;
  }

  async items() {
    const response = await this.request();
    return response.thread.items;
  }

  hasMore() {
    return this.#hasMore;
  }
}
