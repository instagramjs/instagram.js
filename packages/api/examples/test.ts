import fs from "fs/promises";
import path from "path";

import { API_URL, ApiClient } from "../src";

const STATE_FILE = path.join(import.meta.dirname, "state.json");
const USERNAME = process.env.USERNAME ?? "";
const PASSWORD = process.env.PASSWORD ?? "";

const client = new ApiClient();

async function main() {
  let stateData;
  try {
    await fs.stat(STATE_FILE);
    stateData = await fs.readFile(STATE_FILE, "utf-8");
  } catch {
    void 0;
  }

  client.on("requestEnd", () => {
    const state = client.exportState();
    void fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
  });

  if (stateData) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    client.importState(JSON.parse(stateData));
  } else {
    client.generateDevice(USERNAME);
    await client.qe.syncLoginExperiments();
    await client.account.login(USERNAME, PASSWORD);
  }

  const inboxResponse = await client.direct.getInbox().items();
  console.log(JSON.stringify(inboxResponse, null, 2));

  // console.log(
  //   JSON.stringify(
  //     client.cookieJar.getCookiesSync(API_URL).map((c) => c.toJSON()),
  //     null,
  //     2,
  //   ),
  // );
}

void main();
