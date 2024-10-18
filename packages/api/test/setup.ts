import fs from "fs/promises";
import path from "path";

import { type ApiClient } from "~/index";

const STATE_FILE = path.join(import.meta.dirname, "state.json");

export async function setupPersistentState(client: ApiClient) {
  let stateData;
  try {
    await fs.stat(STATE_FILE);
    stateData = await fs.readFile(STATE_FILE, "utf-8");
  } catch {
    void 0;
  }

  client.on("response", () => {
    const state = client.exportState();
    void fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
  });

  if (stateData) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      client.importState(JSON.parse(stateData));
    } catch {
      void 0;
    }
  }
}
