import {
  type DirectInboxResponseDto,
  type DirectThreadDto,
} from "@instagramjs/api-types";
import { type ParsedUrlQuery } from "querystring";

import { Paginator } from "~/paginator";

export class DirectInboxPaginator extends Paginator<
  DirectInboxResponseDto,
  DirectThreadDto
> {
  cursor?: string;
  sequenceId?: number;
  #hasMore = false;

  async request() {
    const params: ParsedUrlQuery = {
      visual_message_return_type: "unseen",
      persistentBadging: "true",
      is_prefetching: "false",
      thread_message_limit: "10",
      limit: "20",
    };
    if (this.sequenceId) {
      params.seq_id = this.sequenceId.toString();
    }
    if (this.cursor) {
      params.cursor = this.cursor;
      params.direction = "older";
    }

    const response = await this.client.makeRequest<DirectInboxResponseDto>({
      url: `/api/v1/direct_v2/inbox/`,
      method: "GET",
      params,
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
