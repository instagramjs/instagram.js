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

export type Flow2OpenAPIConfig = {
  name: string;
  apiPrefix: string;

  filterRequest?: (context: RequestFilterContext) => boolean;
  filterResponse?: (context: RequestFilterContext) => boolean;
  filterParameter?: (context: PathFilterContext) => boolean;
  filterExample?: (context: PathFilterContext) => boolean;
  filterSchema?: (context: PathFilterContext) => boolean;
};

export function filterRequest(
  config: Flow2OpenAPIConfig,
  context: RequestFilterContext,
) {
  return config.filterRequest?.(context) ?? true;
}

export function filterResponse(
  config: Flow2OpenAPIConfig,
  context: RequestFilterContext,
) {
  return config.filterResponse?.(context) ?? true;
}

export function filterParameter(
  config: Flow2OpenAPIConfig,
  context: PathFilterContext,
) {
  return config.filterParameter?.(context) ?? true;
}

export function filterExample(
  config: Flow2OpenAPIConfig,
  context: PathFilterContext,
) {
  return config.filterExample?.(context) ?? true;
}

export function filterSchema(
  config: Flow2OpenAPIConfig,
  context: PathFilterContext,
) {
  return config.filterSchema?.(context) ?? true;
}
