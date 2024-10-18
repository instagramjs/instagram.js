import { type ExportedApiState } from "@igjs/api";

export type StateAdapter = {
  loadState: () =>
    | Promise<ExportedApiState | undefined>
    | ExportedApiState
    | undefined;
  saveState: (state: ExportedApiState) => Promise<void> | void;
};
