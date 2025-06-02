export type AutogenFlow = {
  request: {
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
  response: {
    headers: Record<string, string>;
    content: string | null;
    statusCode: number;
  } | null;
  type: string;
};
