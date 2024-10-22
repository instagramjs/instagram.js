import {
  type DirectAddUserResponseDto,
  type DirectSendResponseDto,
  type DirectThreadResponseDto,
  type DirectUpdateTitleResponseDto,
} from "@igjs/api-types";
import { type ParsedUrlQuery } from "querystring";

import { type ApiClient } from "~/client";
import { type XOR } from "~/util";

import { DirectInboxPaginator } from "./inbox-paginator";
import { DirectPendingPaginator } from "./pending-paginator";
import { DirectThreadItemsPaginator } from "./thread-item-paginator";

export type DirectSendOpts = {
  text: string;
  sendAttribution?: string;
  replyTo?: {
    itemId: string;
    clientContext?: string;
  };
} & XOR<{ threadIds: string[] }, { userIds: string[] }>;

export class DirectApi {
  constructor(public client: ApiClient) {}

  async approve(threadId: string) {
    return this.client.makeRequest<{ status: string }>({
      url: `/api/v1/direct_v2/threads/${threadId}/approve/`,
      method: "POST",
    });
  }

  async approveMultiple(threadIds: string[]) {
    return this.client.makeRequest<{ status: string }>({
      url: `/api/v1/direct_v2/threads/approve_multiple/`,
      method: "POST",
      form: {
        thread_ids: JSON.stringify(threadIds),
      },
      signForm: false,
    });
  }

  async decline(threadId: string) {
    return this.client.makeRequest<{ status: string }>({
      url: `/api/v1/direct_v2/threads/${threadId}/decline/`,
      method: "POST",
    });
  }

  async declineMultiple(threadIds: string[]) {
    return this.client.makeRequest<{ status: string }>({
      url: `/api/v1/direct_v2/threads/decline_multiple/`,
      method: "POST",
      form: {
        thread_ids: JSON.stringify(threadIds),
      },
      signForm: false,
    });
  }

  async declineAll() {
    return this.client.makeRequest<{ status: string }>({
      url: `/api/v1/direct_v2/threads/decline_all/`,
      method: "POST",
    });
  }

  async approveParticipantRequests(threadId: string, userIds: string[]) {
    return this.client.makeRequest<{ status: string }>({
      url: `/api/v1/direct_v2/threads/${threadId}/approve_participant_requests/`,
      method: "POST",
      form: {
        user_ids: JSON.stringify(userIds),
        share_join_chat_story: true,
      },
      signForm: false,
    });
  }

  async getById(threadId: string) {
    const response = await this.client.makeRequest<DirectThreadResponseDto>({
      url: `/api/v1/direct_v2/threads/${threadId}/`,
      method: "GET",
      params: {
        visual_message_return_type: "unseen",
        direction: "older",
      },
    });
    return response.thread;
  }

  async getByParticipants(userIds: string[]) {
    return this.client.makeRequest<{ status: string }>({
      url: `/api/v1/direct_v2/threads/get_by_participants/`,
      method: "GET",
      params: {
        recipient_users: JSON.stringify(userIds),
      },
      signForm: false,
    });
  }

  async updateTitle(threadId: string, newTitle: string) {
    return this.client.makeRequest<DirectUpdateTitleResponseDto>({
      url: `/api/v1/direct_v2/threads/${threadId}/update_title/`,
      method: "POST",
      form: {
        title: newTitle,
      },
      signForm: false,
    });
  }

  async mute(threadId: string) {
    return this.client.makeRequest<{ status: string }>({
      url: `/api/v1/direct_v2/threads/${threadId}/mute/`,
      method: "POST",
    });
  }

  async unmute(threadId: string) {
    return this.client.makeRequest<{ status: string }>({
      url: `/api/v1/direct_v2/threads/${threadId}/unmute/`,
      method: "POST",
    });
  }

  async addUsers(threadId: string, userIds: string[]) {
    return this.client.makeRequest<DirectAddUserResponseDto>({
      url: `/api/v1/direct_v2/threads/${threadId}/add_user/`,
      method: "POST",
      form: {
        user_ids: JSON.stringify(userIds),
      },
      signForm: false,
    });
  }

  async leave(threadId: string) {
    return this.client.makeRequest<{ status: string }>({
      url: `/api/v1/direct_v2/threads/${threadId}/leave/`,
      method: "POST",
    });
  }

  async hide(threadId: string) {
    return this.client.makeRequest<{ status: string }>({
      url: `/api/v1/direct_v2/threads/${threadId}/hide/`,
      method: "POST",
      form: {
        use_unified_inbox: true,
      },
      signForm: false,
    });
  }

  async markItemSeen(threadId: string, itemId: string) {
    const { device } = this.client;
    const mutationToken = this.client.generateMutationToken();

    return this.client.makeRequest<{ status: string }>({
      url: `/api/v1/direct_v2/threads/${threadId}/items/${itemId}/seen/`,
      method: "POST",
      form: {
        action: "mark_seen",
        thread_id: threadId,
        _uuid: device.uuid,
        client_context: mutationToken,
        offline_threading_id: mutationToken,
      },
      signForm: false,
    });
  }

  async send(opts: DirectSendOpts) {
    const { device } = this.client;
    const mutationToken = this.client.generateMutationToken();

    const form: ParsedUrlQuery = {
      action: "send_item",
      is_x_transport_forward: "false",
      send_silenty: "false",
      is_shh_mode: "0",
      send_attribution: opts.sendAttribution ?? "message_button",
      client_context: mutationToken,
      device_id: device.deviceId,
      mutation_token: mutationToken,
      _uuid: device.uuid,
      btt_dual_send: "false",
      nav_chain:
        "1qT:feed_timeline:1,1qT:feed_timeline:2,1qT:feed_timeline:3," +
        "7Az:direct_inbox:4,7Az:direct_inbox:5,5rG:direct_thread:7",
      is_ae_dual_send: "false",
      offline_threading_id: mutationToken,
    };

    let method;
    if (opts.text?.includes("http")) {
      method = "link";
      form.link_text = opts.text;
      form.link_urls = JSON.stringify(extractUrls(opts.text));
    } else {
      method = "text";
      form.text = opts.text;
    }

    if (opts.threadIds) {
      form.thread_ids = JSON.stringify(opts.threadIds);
    } else {
      form.recipient_users = JSON.stringify(opts.userIds);
    }

    if (opts.replyTo) {
      form.replied_to_action_source = "swipe";
      form.replied_to_item_id = opts.replyTo.itemId;
      form.replied_to_client_context = opts.replyTo.clientContext;
    }

    return this.client.makeRequest<DirectSendResponseDto>({
      url: `/api/v1/direct_v2/threads/broadcast/${method}/`,
      method: "POST",
      form,
      signForm: false,
    });
  }

  getInbox() {
    return new DirectInboxPaginator(this.client);
  }

  getPendingInbox() {
    return new DirectPendingPaginator(this.client);
  }

  getItems(threadId: string) {
    return new DirectThreadItemsPaginator(this.client, threadId);
  }
}

function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = text.match(urlRegex);
  return urls ? urls : [];
}
