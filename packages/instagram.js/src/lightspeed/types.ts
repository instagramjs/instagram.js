/** A decoded Lightspeed value: primitives, bigint-as-string, or null. */
export type LsValue = string | number | boolean | null;

/** A decoded stored procedure call from bytecode. */
export type SpCall = {
  name: string;
  args: LsValue[];
};

/** Task labels used in `/ls_req` publishes. */
export const TASK_LABELS = {
  MARK_READ: 21,
  SEARCH_PRIMARY: 30,
  SEARCH_SECONDARY: 31,
  SEND_MESSAGE: 46,
  ADD_PARTICIPANT: 130,
  FETCH_REQUEST_QUEUE: 145,
  FETCH_CONTACT: 207,
  FETCH_THREAD: 209,
  FETCH_MESSAGE_RANGE: 228,
  ACS_SYNC: 351,
  ACS_SYNC_NONCE: 354,
  SEARCH_CONTACTS: 452,
  PIN_MESSAGE: 751,
  SET_E2EE_ELIGIBILITY: 60001,
} as const;

/** A single task in an `/ls_req` publish. */
export type LsTask = {
  label: string;
  payload: Record<string, unknown>;
  queue_name: string;
  task_id: number;
  failure_count: null;
};

/** The envelope for an `/ls_req` publish. */
export type LsRequest = {
  app_id: string;
  payload: string;
  request_id: number;
  type: number;
};

/** Parsed `/ls_resp` payload. */
export type LsResponse = {
  request_id: number | null;
  payload: {
    name: null;
    step: unknown[];
  };
  sp: string[];
  target: number;
};

/** Request type constants. */
export const LS_REQUEST_TYPE = {
  /** Sync/initial load. */
  SYNC: 1,
  /** Foreground state / typing. */
  FOREGROUND: 2,
  /** Task-based request. */
  TASK: 3,
} as const;

/** MQTT topics for Lightspeed. */
export const LS_TOPICS = {
  REQUEST: '/ls_req',
  RESPONSE: '/ls_resp',
  FOREGROUND_STATE: '/ls_foreground_state',
  APP_SETTINGS: '/ls_app_settings',
} as const;
