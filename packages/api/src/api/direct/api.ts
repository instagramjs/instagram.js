import {
  type DirectAddUserResponseDto,
  type DirectSendResponseDto,
  type DirectUpdateTitleResponseDto,
} from "@igjs/api-types";
import { Chance } from "chance";
import { type ParsedUrlQueryInput } from "querystring";

import { type ApiClient } from "~/client";
import { type XOR } from "~/util";

import { DirectInboxPaginator } from "./inbox-paginator";
import { DirectPendingPaginator } from "./pending-paginator";
import { DirectThreadPaginator } from "./thread-paginator";

export type DirectSendRecipientOpts = XOR<
  { threadIds: string[] },
  { userIds: string[] }
>;
export type DirectSendOpts = {
  item: string;
  form?: Record<string, unknown>;
  signForm?: boolean;
  params?: Record<string, string>;
} & DirectSendRecipientOpts;

export type DirectSendTextOpts = {
  text: string;
} & DirectSendRecipientOpts;
export type DirectSendStoryOpts = {
  mediaId: string;
  reelId?: string;
  text?: string;
  mediaType?: "photo" | "video";
} & DirectSendRecipientOpts;
export type DirectSendProfileShareOpts = {
  userId: string;
} & DirectSendRecipientOpts;
export type DirectSendLinkOpts = {
  text: string;
  urls: string[];
} & DirectSendRecipientOpts;
export type DirectSendPostOpts = {
  mediaId: string;
} & DirectSendRecipientOpts;
export type GetDirectInboxOpts = {
  cursor: string;
  sequenceId: number;
};

export class DirectApi {
  constructor(public client: ApiClient) {}

  #getBaseFormData() {
    return {
      _uuid: this.client.device.uuid,
      _uid: this.client.getUserId(),
      _csrftoken: this.client.getCsrfToken() ?? undefined,
    };
  }

  async approve(threadId: string) {
    return this.client.makeRequest<{ status: string }>({
      url: `/api/v1/direct_v2/threads/${threadId}/approve/`,
      method: "POST",
      form: {
        ...this.#getBaseFormData(),
      },
    });
  }

  async approveMultiple(threadIds: string[]) {
    return this.client.makeRequest<{ status: string }>({
      url: `/api/v1/direct_v2/threads/approve_multiple/`,
      method: "POST",
      form: {
        ...this.#getBaseFormData(),
        thread_ids: JSON.stringify(threadIds),
      },
    });
  }

  async decline(threadId: string) {
    return this.client.makeRequest<{ status: string }>({
      url: `/api/v1/direct_v2/threads/${threadId}/decline/`,
      method: "POST",
      form: {
        ...this.#getBaseFormData(),
      },
    });
  }

  async declineMultiple(threadIds: string[]) {
    return this.client.makeRequest<{ status: string }>({
      url: `/api/v1/direct_v2/threads/decline_multiple/`,
      method: "POST",
      form: {
        ...this.#getBaseFormData(),
        thread_ids: JSON.stringify(threadIds),
      },
    });
  }

  async declineAll() {
    return this.client.makeRequest<{ status: string }>({
      url: `/api/v1/direct_v2/threads/decline_all/`,
      method: "POST",
      form: {
        ...this.#getBaseFormData(),
      },
    });
  }

  async approveParticipantRequests(threadId: string, userIds: string[]) {
    return this.client.makeRequest<{ status: string }>({
      url: `/api/v1/direct_v2/threads/${threadId}/approve_participant_requests/`,
      method: "POST",
      form: {
        ...this.#getBaseFormData(),
        user_ids: JSON.stringify(userIds),
        share_join_chat_story: true,
      },
    });
  }

  getById(threadId: string) {
    return new DirectThreadPaginator(this.client, threadId);
  }

  async getByParticipants(userIds: string[]) {
    return this.client.makeRequest<{ status: string }>({
      url: `/api/v1/direct_v2/threads/get_by_participants/`,
      method: "GET",
      params: {
        ...this.#getBaseFormData(),
        recipient_users: JSON.stringify(userIds),
      },
    });
  }

  async updateTitle(threadId: string, newTitle: string) {
    return this.client.makeRequest<DirectUpdateTitleResponseDto>({
      url: `/api/v1/direct_v2/threads/${threadId}/update_title/`,
      method: "POST",
      form: {
        ...this.#getBaseFormData(),
        title: newTitle,
      },
    });
  }

  async mute(threadId: string) {
    return this.client.makeRequest<{ status: string }>({
      url: `/api/v1/direct_v2/threads/${threadId}/mute/`,
      method: "POST",
      form: {
        ...this.#getBaseFormData(),
      },
    });
  }

  async unmute(threadId: string) {
    return this.client.makeRequest<{ status: string }>({
      url: `/api/v1/direct_v2/threads/${threadId}/unmute/`,
      method: "POST",
      form: {
        ...this.#getBaseFormData(),
      },
    });
  }

  async addUsers(threadId: string, userIds: string[]) {
    return this.client.makeRequest<DirectAddUserResponseDto>({
      url: `/api/v1/direct_v2/threads/${threadId}/add_user/`,
      method: "POST",
      form: {
        ...this.#getBaseFormData(),
        user_ids: JSON.stringify(userIds),
      },
    });
  }

  async leave(threadId: string) {
    return this.client.makeRequest<{ status: string }>({
      url: `/api/v1/direct_v2/threads/${threadId}/leave/`,
      method: "POST",
      form: {
        ...this.#getBaseFormData(),
      },
    });
  }

  async hide(threadId: string) {
    return this.client.makeRequest<{ status: string }>({
      url: `/api/v1/direct_v2/threads/${threadId}/hide/`,
      method: "POST",
      form: {
        ...this.#getBaseFormData(),
        use_unified_inbox: true,
      },
    });
  }

  async markItemSeen(threadId: string, itemId: string) {
    return this.client.makeRequest<{ status: string }>({
      url: `/api/v1/direct_v2/threads/${threadId}/items/${itemId}/seen/`,
      method: "POST",
      form: {
        ...this.#getBaseFormData(),
        use_unified_inbox: true,
        action: "mark_seen",
        thread_id: threadId,
        item_id: itemId,
      },
    });
  }

  async send(opts: DirectSendOpts) {
    const mutationToken = new Chance().guid();
    const recipientsType = opts.threadIds ? "thread_ids" : "recipient_users";

    const form: ParsedUrlQueryInput = {
      ...this.#getBaseFormData(),
      [recipientsType]: JSON.stringify(
        recipientsType === "thread_ids" ? opts.threadIds : [opts.userIds],
      ),
      action: "send_item",
      client_context: mutationToken,
      device_id: this.client.device.deviceId,
      ...opts.form,
    };
    return this.client.makeRequest<DirectSendResponseDto>({
      url: `/api/v1/direct_v2/threads/broadcast/${opts.item}/`,
      method: "POST",
      params: opts.params,
      form: opts.signForm ? this.client.signFormData(form) : form,
    });
  }

  async sendText(opts: DirectSendTextOpts) {
    return this.send({
      item: "text",
      form: { text: opts.text },
      ...opts,
    });
  }

  async sendStoryReply(opts: DirectSendStoryOpts) {
    return this.send({
      item: "reel_share",
      form: {
        media_id: opts.mediaId,
        reel_id: opts.reelId ?? opts.mediaId.split("_")[1],
        text: opts.text,
        entry: "reel",
      },
      params: {
        media_type: opts.mediaType ?? "photo",
      },
      ...opts,
    });
  }

  async sendStoryShare(opts: DirectSendStoryOpts) {
    return this.send({
      item: "story_share",
      form: {
        story_media_id: opts.mediaId,
        reel_id: opts.reelId ?? opts.mediaId.split("_")[1],
        text: opts.text,
      },
      params: {
        media_type: opts.mediaType ?? "photo",
      },
      ...opts,
    });
  }

  async sendProfileShare(opts: DirectSendProfileShareOpts) {
    return this.send({
      item: "profile",
      form: {
        profile_user_id: opts.userId,
      },
      ...opts,
    });
  }

  async sendLink(opts: DirectSendLinkOpts) {
    return this.send({
      item: "link",
      form: {
        link_urls: JSON.stringify(opts.urls),
        link_text: opts.text,
      },
      ...opts,
    });
  }

  async sendPost(opts: DirectSendPostOpts) {
    return this.send({
      item: "media_share",
      form: {
        media_id: opts.mediaId,
        carousel_share_child_media_id: opts.mediaId,
        send_attribution: "feed_contextual_profile",
        unified_broadcast_format: 1,
      },
      ...opts,
    });
  }

  getInbox() {
    return new DirectInboxPaginator(this.client);
  }

  getPendingInbox() {
    return new DirectPendingPaginator(this.client);
  }
}
