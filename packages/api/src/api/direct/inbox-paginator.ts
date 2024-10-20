import {
  type DirectInboxResponseDto,
  type DirectThreadDto,
} from "@igjs/api-types";

import { Paginator } from "~/paginator";

export class DirectInboxPaginator extends Paginator<
  DirectInboxResponseDto,
  DirectThreadDto
> {
  cursor?: string;
  sequenceId?: number;
  #hasMore = false;

  async request() {
    const response = await this.client.makeRequest<DirectInboxResponseDto>({
      url: `/api/v1/direct_v2/inbox/`,
      method: "GET",
      params: {
        visual_message_return_type: "unseen",
        cursor: this.cursor,
        direction: this.cursor ? "older" : undefined,
        seq_id: this.sequenceId,
        thread_message_limit: 10,
        persistentBadging: true,
        limit: 20,
      },
    });
    this.cursor = response.inbox.oldest_cursor;
    this.sequenceId = response.seq_id;
    this.#hasMore = !response.inbox.has_older;
    return response;
  }

  async items() {
    const response = await this.request();
    return response.inbox.threads;
  }

  hasMore() {
    return this.#hasMore;
  }
}
