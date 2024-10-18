import path from "path";

import { FileStateAdapter, IgClient } from "~/index";

import { env } from "./env";

const client = new IgClient({
  stateAdapter: new FileStateAdapter(
    path.join(import.meta.dirname, "state.json"),
  ),
});

client.on("ready", () => {
  console.log("ready");
});

async function main() {
  await client.login(env.USERNAME, env.PASSWORD);
}

void main();
