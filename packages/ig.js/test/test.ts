import path from "path";

import { Client } from "~/index";
import { FileStorageAdapater } from "~/storage";

import { env } from "./env";

const client = new Client({
  storageAdapter: new FileStorageAdapater(
    path.join(import.meta.dirname, "storage"),
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
