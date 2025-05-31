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

export type HeaderFilterContext = RequestFilterContext & {
  name: string;
  value: string;
};

export type ExampleFilterContext = RequestFilterContext & {
  key: string | number;
  value: unknown;
};

export type Flow2OpenAPIConfig = {
  apiPrefix: string;

  filterRequest?: (context: RequestFilterContext) => boolean;
  filterRequestBody?: (context: RequestFilterContext) => boolean;
  filterResponse?: (context: RequestFilterContext) => boolean;
  filterHeader?: (context: HeaderFilterContext) => boolean;
  filterExample?: (context: ExampleFilterContext) => boolean;
};

export function filterRequest(
  config: Flow2OpenAPIConfig,
  context: RequestFilterContext,
) {
  return config.filterRequest?.(context) ?? true;
}

export function filterRequestBody(
  config: Flow2OpenAPIConfig,
  context: RequestFilterContext,
) {
  return config.filterRequestBody?.(context) ?? true;
}

export function filterResponse(
  config: Flow2OpenAPIConfig,
  context: RequestFilterContext,
) {
  return config.filterResponse?.(context) ?? true;
}

export function filterHeader(
  config: Flow2OpenAPIConfig,
  context: HeaderFilterContext,
) {
  return config.filterHeader?.(context) ?? true;
}

export function filterExample(
  config: Flow2OpenAPIConfig,
  context: ExampleFilterContext,
) {
  return config.filterExample?.(context) ?? true;
}
