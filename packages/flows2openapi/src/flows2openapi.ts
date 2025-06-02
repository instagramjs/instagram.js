import assert from "assert";
import {
  type OpenAPI3,
  type OperationObject,
  type ParameterObject,
  type PathItemObject,
  type SchemaObject,
} from "openapi-typescript";
import { z } from "zod";

import {
  filterExample,
  filterRequest,
  filterResponse,
  type Flow2OpenAPIConfig,
  type RequestFilterContext,
} from "./config";
import {
  decodeRawContent,
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

const flowDumpSchema = z.object({
  id: z.string(),
  request: z.object({
    headers: z.record(z.string(), z.string()),
    content: z.string().nullable(),
    host: z.string(),
    method: z.enum([
      "GET",
      "PUT",
      "POST",
      "DELETE",
      "PATCH",
      "HEAD",
      "OPTIONS",
    ]),
    path: z.string(),
    scheme: z.enum(["http", "https"]),
  }),
  response: z
    .object({
      headers: z.record(z.string(), z.string()),
      content: z.string().nullable(),
      status_code: z.number(),
    })
    .nullable(),
  type: z.enum(["http"]),
});
type FlowDump = z.infer<typeof flowDumpSchema>;

async function processDump(
  config: Flow2OpenAPIConfig,
  def: OpenAPI3,
  dump: FlowDump,
) {
  assert(def.paths, "Schema is missing paths");

  if (dump.type !== "http" || !dump.response) {
    return;
  }

  const prefixUrl = new URL(config.apiPrefix);
  const requestUrl = new URL(
    `${dump.request.scheme}://${dump.request.host}${dump.request.path}`,
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

  let requestBody: string | null = null;
  if (dump.request.content) {
    requestBody = await decodeRawContent(
      dump.request.content,
      dump.request.headers["content-encoding"],
    );
  }

  let responseBody: string | null = null;
  if (dump.response.content) {
    responseBody = await decodeRawContent(
      dump.response.content,
      dump.response.headers["content-encoding"],
    );
  }

  const filterContext: RequestFilterContext = {
    request: {
      method: dump.request.method,
      path: pathname,
      headers: dump.request.headers,
      body: requestBody,
    },
    response: {
      statusCode: dump.response.status_code,
      headers: dump.response.headers,
      content: responseBody,
    },
  };

  if (!filterRequest(config, filterContext)) {
    return;
  }

  let pathSchema;
  if (def.paths[parameterizedPath]) {
    pathSchema = def.paths[parameterizedPath];
  } else {
    pathSchema = {};
    def.paths[parameterizedPath] = pathSchema;
  }
  assert(!isRef(pathSchema), "Reference object not expected");

  const methodKey = dump.request.method.toLowerCase() as keyof PathItemObject;
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
      dump.request.headers,
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

  mergeParameters(def, methodSchema.parameters, newParameters);

  const requestBodyType = dump.request.headers["content-type"]?.split(";")[0];
  if (requestBody && requestBodyType) {
    let requestBodySchema;
    if (methodSchema.requestBody) {
      requestBodySchema = getObjectOrRef(
        def,
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
        jsonBody = JSON.parse(requestBody);
      } catch (e) {
        throw new Error(`Error parsing JSON request body: ${requestBody}`, {
          cause: e,
        });
      }

      const jsonSchema = schemaFromValue(
        def,
        config,
        filterContext,
        "request.body",
        jsonBody,
      );
      if (mediaTypeSchema.schema) {
        mergeSchemas(
          def,
          getObjectOrRef(def, "schema", mediaTypeSchema.schema),
          jsonSchema,
        );
      } else {
        mediaTypeSchema.schema = jsonSchema;
      }
    }

    if (requestBodyType.startsWith("application/x-www-form-urlencoded")) {
      let parsedFormData;
      try {
        parsedFormData = new URLSearchParams(requestBody);
      } catch (e) {
        throw new Error(
          `Error parsing form data request body: ${requestBody}`,
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

  if (!filterResponse(config, filterContext)) {
    return;
  }

  const statusCodeKey = dump.response.status_code.toString();
  let responseSchema;
  if (methodSchema.responses[statusCodeKey]) {
    responseSchema = getObjectOrRef(
      def,
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
    dump.response.headers,
  );
  mergeHeaderMaps(responseSchema.headers, newHeaders);

  const responseBodyType = dump.response.headers["content-type"]?.split(";")[0];
  if (responseBody && responseBodyType) {
    let responseBodySchema;
    if (responseSchema.content[responseBodyType]) {
      responseBodySchema = responseSchema.content[responseBodyType];
    } else {
      responseBodySchema = {};
      responseSchema.content[responseBodyType] = responseBodySchema;
    }

    let schema: SchemaObject = { type: "string" };
    if (
      filterExample(config, {
        ...filterContext,
        path: "response.body",
        value: responseBody,
      })
    ) {
      schema.example = responseBody;
    }

    if (responseBodyType.startsWith("application/octet-stream")) {
      schema = { type: "string", format: "binary" };
    }

    if (responseBodyType.startsWith("application/json")) {
      try {
        const jsonBody = JSON.parse(responseBody);
        schema = schemaFromValue(
          def,
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
        def,
        getObjectOrRef(def, "schema", responseBodySchema.schema),
        schema,
      );
    } else {
      responseBodySchema.schema = schema;
    }
  }
}

export async function flows2OpenAPI(
  jsonDump: string,
  def: OpenAPI3 | null,
  config: Flow2OpenAPIConfig,
): Promise<OpenAPI3> {
  const { apiPrefix, name } = config;

  if (def === null) {
    def = {
      openapi: "3.1.0",
      info: {
        title: name,
        version: "1.0.0",
      },
      servers: [
        {
          url: apiPrefix,
          description: "Primary Server",
          variables: {},
        },
      ],
      paths: {},
    };
  }
  assert(def.paths !== undefined, "Expected paths to be present");

  const dumps = jsonDump.split("\n").filter(Boolean);
  for (const line of dumps) {
    const parsedDump = flowDumpSchema.parse(JSON.parse(line));
    await processDump(config, def, parsedDump);
  }

  def.paths = Object.fromEntries(
    Object.entries(def.paths).sort(([a], [b]) => a.localeCompare(b)),
  );

  return def;
}
