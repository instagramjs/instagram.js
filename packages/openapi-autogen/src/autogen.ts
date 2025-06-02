import assert from "assert";
import {
  type OpenAPI3,
  type OperationObject,
  type ParameterObject,
  type PathItemObject,
  type SchemaObject,
} from "openapi-typescript";

import {
  type AutogenConfig,
  type AutogenConfigFinal,
  type RequestFilterContext,
} from "./config";
import { type AutogenFlow } from "./flow";
import {
  getObjectOrRef,
  headerMapFromHeaders,
  isRef,
  mergeHeaderMaps,
  mergeParameters,
  mergeSchemas,
  normalizedPath,
  parameterizePath,
  parametersFromHeaders,
  parametersFromPathParameters,
  parametersFromSearchParams,
  schemaFromSearchParams,
  schemaFromValue,
} from "./utils";

function processFlow(
  config: AutogenConfigFinal,
  spec: OpenAPI3,
  flow: AutogenFlow,
) {
  assert(spec.paths, "Schema is missing paths");

  if (flow.type !== "http" || !flow.response) {
    return;
  }

  const prefixUrl = new URL(config.apiPrefix);
  const requestUrl = new URL(
    `${flow.request.scheme}://${flow.request.host}${flow.request.path}`,
  );
  if (
    requestUrl.hostname !== prefixUrl.hostname ||
    !requestUrl.pathname.startsWith(prefixUrl.pathname)
  ) {
    return;
  }
  const pathname = normalizedPath(
    requestUrl.pathname.slice(prefixUrl.pathname.length),
  );
  const [parameterizedPath, pathParameters] = parameterizePath(pathname);

  const filterContext: RequestFilterContext = {
    request: {
      method: flow.request.method,
      path: pathname,
      headers: flow.request.headers,
      body: flow.request.content,
    },
    response: {
      statusCode: flow.response.statusCode,
      headers: flow.response.headers,
      content: flow.response.content,
    },
  };

  if (!config.filterRequest(filterContext)) {
    return;
  }

  let pathSchema;
  if (spec.paths[parameterizedPath]) {
    pathSchema = spec.paths[parameterizedPath];
  } else {
    pathSchema = {};
    spec.paths[parameterizedPath] = pathSchema;
  }
  assert(!isRef(pathSchema), "Reference object not expected");

  const methodKey = flow.request.method.toLowerCase() as keyof PathItemObject;
  let methodSchema = pathSchema[methodKey] as OperationObject | undefined;
  if (!methodSchema) {
    methodSchema = {
      responses: {},
      parameters: [],
    };
    pathSchema[methodKey] = methodSchema;
  }
  assert(
    methodSchema.responses !== undefined,
    "Missing responses in method schema",
  );
  assert(
    methodSchema.parameters !== undefined,
    "Missing parameters in method schema",
  );

  const newParameters: ParameterObject[] = [
    ...parametersFromHeaders(
      config,
      filterContext,
      "request",
      flow.request.headers,
    ),
    ...parametersFromPathParameters(
      config,
      filterContext,
      "request",
      pathParameters,
    ),
  ];
  if (requestUrl.searchParams.size > 0) {
    newParameters.push(
      ...parametersFromSearchParams(
        config,
        filterContext,
        "request",
        requestUrl.searchParams,
      ),
    );
  }

  mergeParameters(spec, methodSchema.parameters, newParameters);

  const requestBodyType = flow.request.headers["content-type"]?.split(";")[0];
  if (flow.request.content && requestBodyType) {
    let requestBodySchema;
    if (methodSchema.requestBody) {
      requestBodySchema = getObjectOrRef(
        spec,
        "requestBody",
        methodSchema.requestBody,
      );
    } else {
      requestBodySchema = {
        required: true,
        content: {},
      };
      methodSchema.requestBody = requestBodySchema;
    }
    assert(
      requestBodySchema.required !== undefined,
      "Missing required in request body schema",
    );
    assert(
      requestBodySchema.content !== undefined,
      "Missing content in request body schema",
    );

    let mediaTypeSchema = requestBodySchema.content[requestBodyType];
    if (!mediaTypeSchema) {
      mediaTypeSchema = {};
      requestBodySchema.content[requestBodyType] = mediaTypeSchema;
    }
    assert(!isRef(mediaTypeSchema), "Reference object not expected");

    if (requestBodyType.startsWith("application/json")) {
      let jsonBody: unknown;
      try {
        jsonBody = JSON.parse(flow.request.content);
      } catch (e) {
        throw new Error(
          `Error parsing JSON request body: ${flow.request.content}`,
          {
            cause: e,
          },
        );
      }

      const jsonSchema = schemaFromValue(
        spec,
        config,
        filterContext,
        "request.body",
        jsonBody,
      );
      if (mediaTypeSchema.schema) {
        mergeSchemas(
          spec,
          getObjectOrRef(spec, "schema", mediaTypeSchema.schema),
          jsonSchema,
        );
      } else {
        mediaTypeSchema.schema = jsonSchema;
      }
    }

    if (requestBodyType.startsWith("application/x-www-form-urlencoded")) {
      let parsedFormData;
      try {
        parsedFormData = new URLSearchParams(flow.request.content);
      } catch (e) {
        throw new Error(
          `Error parsing form data request body: ${flow.request.content}`,
          {
            cause: e,
          },
        );
      }

      const formDataSchema = schemaFromSearchParams(
        config,
        filterContext,
        "request.body",
        parsedFormData,
      );
      mediaTypeSchema.schema = formDataSchema;
    }
  }

  if (!config.filterResponse(filterContext)) {
    return;
  }

  const statusCodeKey = flow.response.statusCode.toString();
  let responseSchema;
  if (methodSchema.responses[statusCodeKey]) {
    responseSchema = getObjectOrRef(
      spec,
      "response",
      methodSchema.responses[statusCodeKey],
    );
  } else {
    responseSchema = {
      description: "",
      headers: {},
      content: {},
    };
    methodSchema.responses[statusCodeKey] = responseSchema;
  }
  assert(
    responseSchema.description !== undefined,
    "Missing description in response schema",
  );
  assert(
    responseSchema.headers !== undefined,
    "Missing headers in response schema",
  );
  assert(
    responseSchema.content !== undefined,
    "Missing content in response schema",
  );

  const newHeaders = headerMapFromHeaders(
    config,
    filterContext,
    "response",
    flow.response.headers,
  );
  mergeHeaderMaps(responseSchema.headers, newHeaders);

  const responseBodyType = flow.response.headers["content-type"]?.split(";")[0];
  if (flow.response.content && responseBodyType) {
    let responseBodySchema;
    if (responseSchema.content[responseBodyType]) {
      responseBodySchema = responseSchema.content[responseBodyType];
    } else {
      responseBodySchema = {};
      responseSchema.content[responseBodyType] = responseBodySchema;
    }

    let schema: SchemaObject = { type: "string" };
    if (
      config.filterExample({
        ...filterContext,
        path: "response.body",
        value: flow.response.content,
      })
    ) {
      schema.example = flow.response.content;
    }

    if (responseBodyType.startsWith("application/octet-stream")) {
      schema = { type: "string", format: "binary" };
    }

    if (responseBodyType.startsWith("application/json")) {
      try {
        const jsonBody = JSON.parse(flow.response.content);
        schema = schemaFromValue(
          spec,
          config,
          filterContext,
          "response.body",
          jsonBody,
        );
      } catch {
        // ignore
      }
    }

    if (responseBodySchema.schema) {
      mergeSchemas(
        spec,
        getObjectOrRef(spec, "schema", responseBodySchema.schema),
        schema,
      );
    } else {
      responseBodySchema.schema = schema;
    }
  }
}

export function createOpenAPIAutogen(
  config: AutogenConfig,
  def: OpenAPI3 | null,
) {
  let isComplete = false;

  const finalConfig: AutogenConfigFinal = {
    ...config,
    filterRequest: config.filterRequest ?? (() => true),
    filterResponse: config.filterResponse ?? (() => true),
    filterParameter: config.filterParameter ?? (() => true),
    // Examples can contain sensitive data, so we don't want to include them by default
    filterExample: config.filterExample ?? (() => false),
    filterSchema: config.filterSchema ?? (() => true),
  };

  if (!def) {
    def = {
      openapi: "3.1.0",
      info: {
        title: config.name,
        version: "1.0.0",
      },
      servers: [
        {
          url: config.apiPrefix,
          description: "Primary Server",
          variables: {},
        },
      ],
      paths: {},
    };
  }
  assert(
    def.openapi !== undefined && def.openapi.startsWith("3.1"),
    `The OpenAPI specification must be at least version 3.1`,
  );
  assert(
    def.paths !== undefined,
    `The OpenAPI specification must have a "paths" property`,
  );

  const _processFlow = (flow: AutogenFlow) => {
    if (isComplete) {
      throw new Error(
        "Cannot process new flows after `isComplete()` is called",
      );
    }

    processFlow(finalConfig, def, flow);
  };

  const complete = () => {
    if (isComplete) {
      throw new Error("Already completed");
    }

    isComplete = true;
    return def;
  };

  return {
    processFlow: _processFlow,
    complete,
  };
}

export type OpenAPIAutogen = ReturnType<typeof createOpenAPIAutogen>;
