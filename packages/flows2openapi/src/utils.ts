import assert from "assert";
import {
  type HeaderObject,
  type ParameterObject,
  type ReferenceObject,
  type SchemaObject,
} from "openapi-typescript";
import { promisify } from "util";
import { gunzip, inflate, zstdDecompress } from "zlib";

import {
  filterExample,
  filterHeader,
  type Flow2OpenAPIConfig,
  type RequestFilterContext,
} from "./config";

const gunzipAsync = promisify(gunzip);
const zstdDecompressAsync = promisify(zstdDecompress);
const inflateAsync = promisify(inflate);

export function isNotRef<T extends object | undefined>(
  value: T,
): value is Exclude<T, ReferenceObject> {
  return value !== undefined && !("$ref" in value!);
}

export function isSchemaObject(value: unknown): value is SchemaObject {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  );
}

export type PathParameter = {
  name: string;
  value: string;
};

export function parameterizePath(path: string): [string, PathParameter[]] {
  const segments = path.split("/").filter(Boolean);
  const parameters: PathParameter[] = [];
  let paramIndex = 1;

  const parameterizedSegments = segments.map((segment) => {
    if (/^\d+$/.test(segment) || /^[\d_]+$/.test(segment)) {
      parameters.push({
        name: String(paramIndex),
        value: String(segment),
      });
      return `{${paramIndex++}}`;
    }
    return segment;
  });

  let parameterizedPath = parameterizedSegments.join("/");
  if (path.startsWith("/")) {
    parameterizedPath = "/" + parameterizedPath;
  }
  if (path.endsWith("/")) {
    parameterizedPath = parameterizedPath + "/";
  }

  return [parameterizedPath, parameters];
}

export function parametersFromPathParameters(
  config: Flow2OpenAPIConfig,
  filterContext: RequestFilterContext,
  pathParameters: PathParameter[],
): ParameterObject[] {
  return pathParameters.map(({ name, value }) => {
    const parameter: ParameterObject = {
      name,
      in: "path",
      required: true,
      schema: { type: "string" },
    };
    if (
      filterExample(config, {
        ...filterContext,
        key: name,
        value: value,
      })
    ) {
      parameter.example = value;
    }
    return parameter;
  });
}

export function parametersFromHeaders(
  config: Flow2OpenAPIConfig,
  filterContext: RequestFilterContext,
  headers: Record<string, string>,
): ParameterObject[] {
  return Object.entries(headers)
    .filter(([key, value]) =>
      filterHeader(config, { ...filterContext, name: key, value }),
    )
    .map(([key, value]) => {
      const parameter: ParameterObject = {
        name: key,
        in: "header",
        required: true,
        schema: { type: "string" },
      };
      if (
        filterExample(config, {
          ...filterContext,
          key: key,
          value: value,
        })
      ) {
        parameter.example = value;
      }
      return parameter;
    });
}

export function parametersFromSearchParams(
  config: Flow2OpenAPIConfig,
  filterContext: RequestFilterContext,
  searchParams: URLSearchParams,
): ParameterObject[] {
  return Array.from(searchParams.entries()).map(([key, value]) => {
    const parameter: ParameterObject = {
      name: key,
      in: "query",
      required: true,
      schema: { type: "string" },
    };
    if (
      filterExample(config, {
        ...filterContext,
        key: key,
        value: value,
      })
    ) {
      parameter.example = value;
    }
    return parameter;
  });
}

export function schemaFromSearchParams(
  config: Flow2OpenAPIConfig,
  filterContext: RequestFilterContext,
  searchParams: URLSearchParams,
): SchemaObject {
  const schema: SchemaObject = {
    type: "object",
    required: [],
    properties: {},
  };

  searchParams.forEach((value, key) => {
    schema.properties![key] = {
      type: "string",
    };
    if (
      filterExample(config, {
        ...filterContext,
        key: key,
        value: value,
      })
    ) {
      schema.properties![key].example = value;
    }
    schema.required!.push(key);
  });

  return schema;
}

function objectIsRecord(
  value: object,
): value is Record<string | number, unknown> {
  const values = Object.values(value);
  if (values.length === 0) {
    return false;
  }

  const allValuesAreSameType = values.every(
    (value) => typeof value === typeof values[0],
  );
  if (!allValuesAreSameType) {
    return false;
  }

  const allKeysIncludeNumbers = Object.keys(value).every((k) =>
    /^\d+$/.test(String(k)),
  );
  if (!allKeysIncludeNumbers) {
    return false;
  }

  return true;
}

export function schemaFromValue(
  config: Flow2OpenAPIConfig,
  filterContext: RequestFilterContext,
  key: string | number,
  value: unknown,
): SchemaObject {
  if (value === undefined || value === null) {
    return { type: "null" };
  }

  if (typeof value === "string") {
    const schema: SchemaObject = { type: "string" };
    if (
      filterExample(config, {
        ...filterContext,
        key,
        value: value,
      })
    ) {
      schema.example = value;
    }
  }

  if (typeof value === "number") {
    const schema: SchemaObject = { type: "number" };
    if (
      filterExample(config, {
        ...filterContext,
        key,
        value: value,
      })
    ) {
      schema.example = value;
    }
    return schema;
  }

  if (typeof value === "boolean") {
    const schema: SchemaObject = { type: "boolean" };
    if (
      filterExample(config, {
        ...filterContext,
        key,
        value: value,
      })
    ) {
      schema.example = value;
    }
    return schema;
  }

  if (Array.isArray(value)) {
    const firstItem = value[0];
    if (firstItem === undefined) {
      return { type: "array", items: { type: "null" } };
    }
    return {
      type: "array",
      items: schemaFromValue(config, filterContext, 0, firstItem),
    };
  }

  if (typeof value === "object" && value !== null) {
    if (objectIsRecord(value)) {
      const [firstValue, ...restValues] = Object.values(value);
      const valueSchema = schemaFromValue(config, filterContext, 0, firstValue);
      restValues.forEach((v) =>
        mergeSchemas(valueSchema, schemaFromValue(config, filterContext, 0, v)),
      );

      const schema: SchemaObject = {
        type: "object",
        additionalProperties: valueSchema,
      };

      return schema;
    }

    const schema: SchemaObject = {
      type: "object",
      properties: {},
      required: [],
    };

    Object.entries(value).forEach(([key, value]) => {
      schema.properties![key] = schemaFromValue(
        config,
        filterContext,
        key,
        value,
      );
      schema.required!.push(key);
    });

    return schema;
  }

  return { type: "null" };
}

export function mergeSchemas(
  existingSchema: SchemaObject,
  newSchema: SchemaObject,
): void {
  assert(
    existingSchema.type || newSchema.type,
    "Both schemas are missing a type",
  );

  if (existingSchema.type === newSchema.type) {
    Object.assign(existingSchema, newSchema);
    return;
  }

  if (existingSchema.oneOf && newSchema.type) {
    const existingOneOf = existingSchema.oneOf.find(
      (schema) => isNotRef(schema) && schema.type === newSchema.type,
    );
    assert(isNotRef(existingOneOf), "Reference object not expected");
    if (existingOneOf) {
      mergeSchemas(existingOneOf, newSchema);
    } else {
      existingSchema.oneOf.push(newSchema);
    }
    return;
  }

  if (
    existingSchema.type &&
    newSchema.type &&
    existingSchema.type !== newSchema.type
  ) {
    const existingClone = structuredClone(existingSchema);
    Object.keys(existingSchema).forEach(
      (key) => delete existingSchema[key as keyof SchemaObject],
    );
    existingSchema.oneOf = [existingClone, newSchema];
    return;
  }

  if (existingSchema.type === "object" && newSchema.type === "object") {
    if (existingSchema.properties && newSchema.properties) {
      Object.entries(newSchema.properties).forEach(([key, value]) => {
        assert(existingSchema.properties, "Expected properties to be present");
        if (existingSchema.properties[key]) {
          assert(
            isNotRef(existingSchema.properties[key]),
            "Reference object not expected",
          );
          assert(isNotRef(value), "Reference object not expected");
          mergeSchemas(existingSchema.properties[key], value);
        } else {
          existingSchema.properties[key] = value;
        }
      });
    }

    if (existingSchema.required && newSchema.required) {
      Object.entries(newSchema.required!).forEach(([key]) => {
        if (!existingSchema.required!.includes(key)) {
          existingSchema.required!.push(key);
        }
      });
    }

    if (existingSchema.additionalProperties && newSchema.additionalProperties) {
      assert(
        isSchemaObject(existingSchema.additionalProperties),
        "Expected existing additionalProperties to be a schema",
      );
      assert(
        isSchemaObject(newSchema.additionalProperties),
        "Expected new additionalProperties to be a schema",
      );

      mergeSchemas(
        existingSchema.additionalProperties,
        newSchema.additionalProperties,
      );
    }

    return;
  }

  if (existingSchema.type === "array" && newSchema.type === "array") {
    assert(existingSchema.items, "Expected items in existing schema");
    assert(
      !Array.isArray(existingSchema.items),
      "Expected existing schema items to be array",
    );
    assert(isNotRef(existingSchema.items), "Reference object not expected");
    assert(newSchema.items, "Expected items in new schema");
    assert(
      !Array.isArray(newSchema.items),
      "Expected new schema items to be array",
    );
    assert(isNotRef(newSchema.items), "Reference object not expected");

    mergeSchemas(existingSchema.items, newSchema.items);

    return;
  }

  if (existingSchema.type === "null" && newSchema.type !== "null") {
    Object.assign(existingSchema, newSchema);
    existingSchema.nullable = true;
    return;
  }

  if (existingSchema.type !== "null" && newSchema.type === "null") {
    existingSchema.nullable = true;
    return;
  }
}

export function mergeParameters(
  existingParameters: ParameterObject[],
  newParameters: ParameterObject[],
): void {
  const existingByNameAndIn = new Map<string, ParameterObject>(
    existingParameters.map((param) => [`${param.name}:${param.in}`, param]),
  );
  const newByNameAndIn = new Map<string, ParameterObject>(
    newParameters.map((param) => [`${param.name}:${param.in}`, param]),
  );

  newParameters.forEach((newParam) => {
    const existingParam = existingByNameAndIn.get(
      `${newParam.name}:${newParam.in}`,
    );
    if (existingParam) {
      mergeExamples(existingParam, newParam);
    } else {
      existingParameters.push(newParam);
    }
  });

  existingParameters.forEach((existingParam) => {
    const newParam = newByNameAndIn.get(
      `${existingParam.name}:${existingParam.in}`,
    );
    if (!newParam) {
      existingParam.required = false;
    }
  });
}

export function mergeExamples(
  oldObj: ParameterObject | HeaderObject,
  newObj: ParameterObject | HeaderObject,
): void {
  if (oldObj.example && oldObj.example !== newObj.example) {
    const newExamples = oldObj.examples ?? {};
    if (!oldObj.example) {
      newExamples["0"] = {
        value: newObj.example,
      };
    }
    const exampleCount = Object.keys(newExamples).length;
    newExamples[exampleCount.toString()] = {
      value: newObj.example,
    };
    delete oldObj.example;
  }
}

export function headerMapFromHeaders(
  config: Flow2OpenAPIConfig,
  filterContext: RequestFilterContext,
  headers: Record<string, string>,
): Record<string, HeaderObject> {
  return Object.entries(headers)
    .filter(([key, value]) =>
      filterHeader(config, { ...filterContext, name: key, value }),
    )
    .reduce(
      (acc, [key, value]) => {
        acc[key] = {
          schema: { type: "string" },
          required: true,
        };
        if (
          filterExample(config, {
            ...filterContext,
            key: key,
            value: value,
          })
        ) {
          acc[key].example = value;
        }
        return acc;
      },
      {} as Record<string, HeaderObject>,
    );
}

export function mergeHeaderMaps(
  existingHeaders: Record<string, HeaderObject>,
  newHeaders: Record<string, HeaderObject>,
) {
  Object.entries(newHeaders).forEach(([key, value]) => {
    if (existingHeaders[key]) {
      mergeExamples(existingHeaders[key], value);
    } else {
      existingHeaders[key] = value;
    }
  });

  Object.entries(existingHeaders).forEach(([key, value]) => {
    if (!newHeaders[key]) {
      value.required = false;
    }
  });
}

export async function decodeContent(
  content: string,
  encoding?: string,
): Promise<string> {
  const buffer = Buffer.from(content, "base64");
  switch (encoding) {
    case "zstd":
      return zstdDecompressAsync(buffer).then((decoded) => decoded.toString());
    case "deflate":
      return inflateAsync(buffer).then((decoded) => decoded.toString());
    case "gzip":
      return gunzipAsync(buffer).then((decoded) => decoded.toString());
    default:
      return buffer.toString();
  }
}
