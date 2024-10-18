import { type ExportedApiState } from "@igjs/api";
import fs from "fs/promises";

import { type StateAdapter } from "./adapter";

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
    ) as ExportedApiState;
  }

  saveState(state: ExportedApiState) {
    return fs.writeFile(this.filePath, JSON.stringify(state, null, 2));
  }
}
