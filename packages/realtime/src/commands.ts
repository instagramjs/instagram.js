import { deflateAsync } from "@instagramjs/mqttot";
import { randomUUID } from "crypto";

import { type RealtimeClient } from "./client";
import { RealtimeTopicId } from "./topics";

export type IndicateActivityOpts = {
  threadId: string;
  isActive: boolean;
  clientContext?: string;
};

export class RealtimeCommands {
  constructor(public realtime: RealtimeClient) {}

  async #sendCommand(opts: {
    threadId: string;
    action: string;
    data: Record<string, unknown>;
    clientContext?: string;
  }) {
    const data = {
      ...opts.data,
      thread_id: opts.threadId,
      action: opts.action,
      client_context: opts.clientContext ?? randomUUID(),
    };
    return this.realtime.publishToTopic(
      RealtimeTopicId.SEND_MESSAGE,
      await deflateAsync(JSON.stringify(data)),
      1,
    );
  }

  async indicateActivity(opts: IndicateActivityOpts) {
    return this.#sendCommand({
      threadId: opts.threadId,
      action: "indicate_activity",
      data: {
        activity_status: opts.isActive ? "1" : "0",
      },
    });
  }
}
