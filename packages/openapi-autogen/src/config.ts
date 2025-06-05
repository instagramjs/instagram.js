import { type match, type MatchFunction } from "path-to-regexp";

export type RequestFilterContext = {
  request: {
    method: string;
    path: string;
    headers: Record<string, string>;
    body: string | null;
  };
  response: {
    statusCode: number;
    headers: Record<string, string>;
    content: string | null;
  };
};

export type PathFilterContext = RequestFilterContext & {
  path: string;
  value: unknown;
};

export type AutogenConfig = {
  name: string;
  apiPrefix: string;

  filterRequest?: (context: RequestFilterContext) => boolean;
  filterResponse?: (context: RequestFilterContext) => boolean;
  filterParameter?: (context: PathFilterContext) => boolean;
  filterExample?: (context: PathFilterContext) => boolean;
  filterSchema?: (context: PathFilterContext) => boolean;

  pathMatchers?: string[];
};

export type AutogenConfigFinal = Required<
  Omit<AutogenConfig, "pathMatchers">
> & {
  pathMatchers: ReturnType<typeof match>[];
};
