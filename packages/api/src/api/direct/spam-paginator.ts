import {
  type DirectInboxResponseDto,
  type DirectThreadDto,
} from "@igjs/api-types";
import { type ParsedUrlQuery } from "querystring";

import { Paginator } from "~/paginator";

export class DirectSpamPaginator extends Paginator<
  DirectInboxResponseDto,
  DirectThreadDto
> {
  cursor?: string;
  #hasMore = false;

  async request() {
    const params: ParsedUrlQuery = {
      visual_message_return_type: "unseen",
      persistentBadging: "true",
      is_prefetching: "false",
    };
    if (this.cursor) {
      params.cursor = this.cursor;
    }

    const response = await this.client.makeRequest<DirectInboxResponseDto>({
      url: `/api/v1/direct_v2/spam_inbox/`,
      method: "GET",
      params,
    });
    this.cursor = response.inbox.oldest_cursor;
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
