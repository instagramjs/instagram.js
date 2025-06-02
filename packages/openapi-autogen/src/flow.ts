export type AutogenFlowMethod =
  | "get"
  | "post"
  | "put"
  | "delete"
  | "patch"
  | "head"
  | "options"
  | "trace";

export type AutogenFlowRequest = {
  headers: Record<string, string>;
  content: string | null;
  host: string;
  method:
    | "get"
    | "post"
    | "put"
    | "delete"
    | "patch"
    | "head"
    | "options"
    | "trace";
  path: string;
  scheme: "http" | "https";
};

export type AutogenFlowResponse = {
  headers: Record<string, string>;
  content: string | null;
  statusCode: number;
};

export type AutogenFlow = {
  request: AutogenFlowRequest;
  response: AutogenFlowResponse | null;
  type: string;
};
