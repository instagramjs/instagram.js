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
  filterRequestBody,
  filterResponse,
  type Flow2OpenAPIConfig,
  type RequestFilterContext,
} from "./config";
import {
  decodeContent,
  headerMapFromHeaders,
  isNotRef,
  mergeHeaderMaps,
  mergeParameters,
  mergeSchemas,
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
  schema: OpenAPI3,
  dump: FlowDump,
) {
  assert(schema.paths, "Schema is missing paths");

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
  const pathname = requestUrl.pathname.slice(prefixUrl.pathname.length);
  const [parameterizedPath, pathParameters] = parameterizePath(pathname);

  const rawRequestBody = dump.request.content;
  const requestBodyEncoding = dump.request.headers["content-encoding"];
  let requestBody: string | null = null;
  if (rawRequestBody) {
    requestBody = await decodeContent(rawRequestBody, requestBodyEncoding);
  }

  const rawResponseBody = dump.response.content;
  const responseBodyEncoding = dump.response.headers["content-encoding"];
  let responseBody: string | null = null;
  if (rawResponseBody) {
    responseBody = await decodeContent(rawResponseBody, responseBodyEncoding);
  }

  const filterContext: RequestFilterContext = {
    request: {
      method: dump.request.method,
      path: dump.request.path,
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

  let pathSchema = schema.paths[parameterizedPath];
  if (!pathSchema) {
    pathSchema = {};
    schema.paths![parameterizedPath] = pathSchema;
  }
  assert(isNotRef(pathSchema), "Reference object not expected");

  const methodKey = dump.request.method.toLowerCase() as keyof PathItemObject;
  let methodSchema = pathSchema[methodKey] as OperationObject | undefined;
  if (!methodSchema) {
    methodSchema = {
      responses: {},
      parameters: [],
    };
    pathSchema[methodKey] = methodSchema;
  }

  const newParameters: ParameterObject[] = [
    ...parametersFromHeaders(config, filterContext, dump.request.headers),
    ...parametersFromPathParameters(config, filterContext, pathParameters),
  ];
  if (requestUrl.searchParams.size > 0) {
    newParameters.push(
      ...parametersFromSearchParams(
        config,
        filterContext,
        requestUrl.searchParams,
      ),
    );
  }

  assert(methodSchema.parameters, "Missing parameters in method schema");
  assert(
    methodSchema.parameters.every(isNotRef),
    "Reference objects not expected",
  );

  mergeParameters(methodSchema.parameters, newParameters);

  const requestBodyType = dump.request.headers["content-type"]?.split(";")[0];
  if (
    requestBody &&
    requestBodyType &&
    filterRequestBody(config, filterContext)
  ) {
    let requestBodySchema = methodSchema.requestBody;
    if (!requestBodySchema) {
      requestBodySchema = {
        required: true,
        content: {},
      };
      methodSchema.requestBody = requestBodySchema;
    }
    assert(isNotRef(requestBodySchema), "Reference object not expected");

    let mediaTypeSchema = requestBodySchema.content[requestBodyType];
    if (!mediaTypeSchema) {
      mediaTypeSchema = {};
      requestBodySchema.content[requestBodyType] = mediaTypeSchema;
    }
    assert(isNotRef(mediaTypeSchema), "Reference object not expected");

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
        config,
        filterContext,
        "_root",
        jsonBody,
      );
      if (mediaTypeSchema.schema && isNotRef(mediaTypeSchema.schema)) {
        mergeSchemas(mediaTypeSchema.schema, jsonSchema);
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
        parsedFormData,
      );
      mediaTypeSchema.schema = formDataSchema;
    }
  }

  if (!filterResponse(config, filterContext)) {
    return;
  }

  const statusCodeKey = dump.response.status_code.toString();
  let responseSchema = methodSchema.responses![statusCodeKey];
  if (!responseSchema) {
    responseSchema = {
      description: "",
      headers: {},
      content: {},
    };
    methodSchema.responses![statusCodeKey] = responseSchema;
  }
  assert(isNotRef(responseSchema), "Reference object not expected");
  assert(responseSchema.headers, "Missing headers in response schema");

  const newHeaders = headerMapFromHeaders(
    config,
    filterContext,
    dump.response.headers,
  );
  mergeHeaderMaps(responseSchema.headers, newHeaders);

  const responseBodyType = dump.response.headers["content-type"]?.split(";")[0];
  if (responseBody && responseBodyType) {
    let responseBodySchema = responseSchema.content![responseBodyType];
    if (!responseBodySchema) {
      responseBodySchema = {};
      responseSchema.content![responseBodyType] = responseBodySchema;
    }
    assert(isNotRef(responseBodySchema), "Reference object not expected");

    let schema: SchemaObject | null = null;

    if (responseBodyType.startsWith("application/json")) {
      try {
        const jsonBody = JSON.parse(responseBody);
        schema = schemaFromValue(config, filterContext, "_root", jsonBody);
      } catch {
        schema = { type: "string" };
        if (
          filterExample(config, {
            ...filterContext,
            key: "_root",
            value: responseBody,
          })
        ) {
          schema.example = responseBody;
        }
      }
    }

    if (schema) {
      if (responseBodySchema.schema && isNotRef(responseBodySchema.schema)) {
        mergeSchemas(responseBodySchema.schema, schema);
      } else {
        responseBodySchema.schema = schema;
      }
    }
  }
}

export async function flows2OpenAPI(
  jsonDump: string,
  config: Flow2OpenAPIConfig,
): Promise<OpenAPI3> {
  const { apiPrefix } = config;

  const schema: OpenAPI3 = {
    openapi: "3.0.0",
    info: {
      title: "MiTM Autogenerated API",
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

  const dumps = jsonDump.split("\n").filter(Boolean);
  await Promise.all(
    dumps.map((dump) => {
      const flowDump = flowDumpSchema.parse(JSON.parse(dump));
      return processDump(config, schema, flowDump);
    }),
  );

  return schema;
}
