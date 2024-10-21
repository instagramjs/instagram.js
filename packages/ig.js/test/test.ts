import path from "path";

import { Client, FileStateAdapter, type Message } from "~/index";

import { env } from "./env";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const client = new Client({
  stateAdapter: new FileStateAdapter(
    path.join(import.meta.dirname, "state.json"),
  ),
});

async function handleMessage(message: Message) {
  if (message.text?.toLowerCase() === "hi") {
    await message.markSeen();
    await message.thread.sendMessage("hello");
  }
}

client.on("ready", async () => {
  console.log("ready");

  for (const [, thread] of client.threads.filter((t) => t.isPending)) {
    await thread.fetch();
    await thread.approve();
    console.log(`approved ${thread.id}`);

    for (const message of thread.messages.values()) {
      await handleMessage(message);
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
