import {
  type DirectItemClipShareDto,
  type DirectItemDto,
  type DirectItemMediaShareDto,
  type DirectItemPlaceholderDto,
  type DirectItemStoryShareDto,
  type DirectItemXmaProfileShareDto,
} from "@igjs/api-types";

import { type Thread } from "./thread";

export type MessageAsJSON = Pick<
  Message,
  | "id"
  | "type"
  | "mid"
  | "authorId"
  | "clientContext"
  | "sendAttribution"
  | "clip"
  | "mediaShare"
  | "storyShare"
  | "xmaProfile"
  | "placeholder"
  | "text"
> & {
  createdAt: number;
};

export class Message {
  type = "text";
  mid: string | null = null;
  authorId = "";
  clientContext: string | null = null;
  sendAttribution: string | null = null;
  clip: DirectItemClipShareDto["clip"] | null = null;
  mediaShare: DirectItemMediaShareDto | null = null;
  storyShare: DirectItemStoryShareDto | null = null;
  xmaProfile: DirectItemXmaProfileShareDto | null = null;
  placeholder: DirectItemPlaceholderDto | null = null;
  text: string | null = null;

  createdAt = new Date();

  constructor(
    public thread: Thread,
    public id: string,
    data?: DirectItemDto,
  ) {
    if (data) {
      this.patch(data);
    }
  }

  patch(data: DirectItemDto) {
    if ("message_id" in data) {
      this.mid = data.message_id;
    }
    if ("item_type" in data) {
      this.type = data.item_type;
    }
    if ("user_id" in data) {
      this.authorId = data.user_id.toString();
    }
    if ("client_context" in data) {
      this.clientContext = data.client_context ?? null;
    }
    if ("send_attribution" in data) {
      this.sendAttribution = data.send_attribution ?? null;
    }
    if ("clip" in data) {
      this.clip = data.clip?.clip ?? null;
    }
    if ("media_share" in data) {
      this.mediaShare = data.media_share ?? null;
    }
    if ("story_share" in data) {
      this.storyShare = data.story_share ?? null;
    }
    if ("xma_profile" in data) {
      this.xmaProfile = data.xma_profile ?? null;
    }
    if ("placeholder" in data) {
      this.placeholder = data.placeholder ?? null;
    }
    if ("text" in data) {
      this.text = data.text ?? null;
    }
    this.createdAt = new Date(data.timestamp / 1000);
  }

  toJSON(): MessageAsJSON {
    return {
      id: this.id,
      type: this.type,
      mid: this.mid,
      authorId: this.authorId,
      clientContext: this.clientContext,
      sendAttribution: this.sendAttribution,
      clip: this.clip,
      mediaShare: this.mediaShare,
      storyShare: this.storyShare,
      xmaProfile: this.xmaProfile,
      placeholder: this.placeholder,
      text: this.text,
      createdAt: this.createdAt.getTime(),
    };
  }

  fromJSON(data: MessageAsJSON) {
    this.id = data.id;
    this.type = data.type;
    this.mid = data.mid;
    this.authorId = data.authorId;
    this.clientContext = data.clientContext;
    this.sendAttribution = data.sendAttribution;
    this.clip = data.clip;
    this.mediaShare = data.mediaShare;
    this.storyShare = data.storyShare;
    this.xmaProfile = data.xmaProfile;
    this.placeholder = data.placeholder;
    this.text = data.text;
    this.createdAt = new Date(data.createdAt);
  }

  static fromJSON(thread: Thread, data: MessageAsJSON) {
    const message = new Message(thread, data.id);
    message.fromJSON(data);
    return message;
  }
}
