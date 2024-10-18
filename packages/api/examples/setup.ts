import fs from "fs/promises";

import { type ApiClient } from "../src";

export async function setupPersistentState(
  client: ApiClient,
  stateFile: string,
) {
  let stateData;
  try {
    await fs.stat(stateFile);
    stateData = await fs.readFile(stateFile, "utf-8");
  } catch {
    void 0;
  }

  client.on("response", () => {
    const state = client.exportState();
    void fs.writeFile(stateFile, JSON.stringify(state, null, 2));
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
