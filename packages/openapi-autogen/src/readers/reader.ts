import { type EventEmitter } from "events";

import { type AutogenFlow } from "~/flow";

export type AutogenReaderEventMap = {
  read: [flow: AutogenFlow];
  error: [error: Error];
  complete: [];
};

export type AutogenReader = EventEmitter<AutogenReaderEventMap>;
