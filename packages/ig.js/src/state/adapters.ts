import fs from "fs/promises";

import { type ExportedClientState } from "./exported";

export type StateAdapter = {
  loadState: () =>
    | Promise<ExportedClientState | undefined>
    | ExportedClientState
    | undefined;
  saveState: (state: ExportedClientState) => Promise<void> | void;
};

export class FileStateAdapter implements StateAdapter {
  constructor(public filePath: string) {}

  async loadState() {
    try {
      await fs.stat(this.filePath);
    } catch {
      return;
    }
    return JSON.parse(
      await fs.readFile(this.filePath, "utf-8"),
    ) as ExportedClientState;
  }

  saveState(state: ExportedClientState) {
    return fs.writeFile(this.filePath, JSON.stringify(state, null, 2));
  }
}
