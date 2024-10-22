import path from "path";
import pino from "pino";

import {
  Client,
  FileStateAdapter,
  generateDeviceConfig,
  type Message,
} from "~/index";

import { env } from "./env";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const client = new Client({
  logger: pino({
    name: "test-client",
  }),
  stateAdapter: new FileStateAdapter(
    path.join(import.meta.dirname, "state.json"),
  ),
  api: {
    device: generateDeviceConfig(env.USERNAME),
  },
});

async function handleMessage(message: Message) {
  if (message.text?.startsWith(`@${env.USERNAME}`)) {
    await message.markSeen();
    await message.reply("hello");
  }
}

client.on("ready", async () => {
  client.logger.info("ready");

  for (const [, thread] of client.threads.filter((t) => t.isPending)) {
    await thread.fetch();
    await thread.approve();
    client.logger.info(`approved ${thread.id}`);

    for (const message of thread.messages.values()) {
      await handleMessage(message);
      client.logger.info(`handled ${message.id}`);
      await wait(2_000);
    }

    await wait(2_000);
  }
});

client.on("messageCreate", async (message) => {
  await handleMessage(message);
});

async function main() {
  await client.login(env.USERNAME, env.PASSWORD);
}

void main();
