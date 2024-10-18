import { createEnv } from "@t3-oss/env-core";
import dotenv from "dotenv";
import fs from "fs/promises";
import { z } from "zod";

dotenv.config();
const env = createEnv({
  server: {
    STATE_FILE: z.string(),
    USERNAME: z.string(),
    PASSWORD: z.string(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

import { type ApiClient } from "../src";
export type LoadStateOrLoginOpts = {
  stateFile: string;
  username: string;
  password: string;
};

export async function setupExampleClient(client: ApiClient) {
  let stateData;
  try {
    await fs.stat(env.STATE_FILE);
    stateData = await fs.readFile(env.STATE_FILE, "utf-8");
  } catch {
    void 0;
  }

  client.on("response", () => {
    const state = client.exportState();
    void fs.writeFile(env.STATE_FILE, JSON.stringify(state, null, 2));
  });

  let loginRequired = false;
  if (stateData) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      client.importState(JSON.parse(stateData));
      loginRequired = !client.authState;
    } catch {
      void 0;
    }
  }
  if (loginRequired) {
    client.generateDevice(env.USERNAME);
    await client.qe.syncLoginExperiments();
    await client.account.login(env.USERNAME, env.PASSWORD);
  }
}
