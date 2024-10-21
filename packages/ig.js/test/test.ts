import path from "path";

import { Client, FileStateAdapter } from "~/index";

import { env } from "./env";

const client = new Client({
  stateAdapter: new FileStateAdapter(
    path.join(import.meta.dirname, "state.json"),
  ),
});

client.on("ready", () => {
  console.log("ready");
});

client.on("messageCreate", async (message) => {
  console.log(message);
  if (message.text === "hi") {
    // await message.thread.send
  }
});

async function main() {
  await client.login(env.USERNAME, env.PASSWORD);
}

void main();
