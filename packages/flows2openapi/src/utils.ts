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

  const parameterizedSegments: string[] = [];
  for (const segment of segments) {
    if (/^\d+$/.test(segment) || /^[\d_]+$/.test(segment)) {
      parameters.push({
        name: String(paramIndex),
        value: String(segment),
      });
      parameterizedSegments.push(`{${paramIndex++}}`);
    } else {
      parameterizedSegments.push(segment);
    }
  }

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
  const parameters: ParameterObject[] = [];
  for (const {
    name: pathParameterName,
    value: pathParameterValue,
  } of pathParameters) {
    const parameter: ParameterObject = {
      name: pathParameterName,
      in: "path",
      required: true,
      schema: { type: "string" },
    };
    if (
      filterExample(config, {
        ...filterContext,
        key: pathParameterName,
        value: pathParameterValue,
      })
    ) {
      parameter.example = pathParameterValue;
    }
    parameters.push(parameter);
  }

  return parameters;
}

export function parametersFromHeaders(
  config: Flow2OpenAPIConfig,
  filterContext: RequestFilterContext,
  headers: Record<string, string>,
): ParameterObject[] {
  const filteredHeaders = Object.entries(headers).filter(([key, value]) =>
    filterHeader(config, { ...filterContext, name: key, value }),
  );

  const parameters: ParameterObject[] = [];
  for (const [headerName, headerValue] of filteredHeaders) {
    const parameter: ParameterObject = {
      name: headerName,
      in: "header",
      required: true,
      schema: { type: "string" },
    };
    if (
      filterExample(config, {
        ...filterContext,
        key: headerName,
        value: headerValue,
      })
    ) {
      parameter.example = headerValue;
    }
    parameters.push(parameter);
  }

  return parameters;
}

export function parametersFromSearchParams(
  config: Flow2OpenAPIConfig,
  filterContext: RequestFilterContext,
  searchParams: URLSearchParams,
): ParameterObject[] {
  const parameters: ParameterObject[] = [];
  for (const [key, value] of searchParams.entries()) {
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
    parameters.push(parameter);
  }

  return parameters;
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
  assert(schema.required, "Expected required to be present");
  assert(schema.properties, "Expected properties to be present");

  for (const [searchParamName, searchParamValue] of searchParams.entries()) {
    const schemaProperty: SchemaObject = {
      type: "string",
    };
    if (
      filterExample(config, {
        ...filterContext,
        key: searchParamName,
        value: searchParamValue,
      })
    ) {
      schemaProperty.example = searchParamValue;
    }
    schema.properties[searchParamName] = schemaProperty;
    schema.required.push(searchParamName);
  }

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
    return schema;
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
    const [firstItem, ...restItems] = value;
    if (firstItem === undefined) {
      return { type: "array", items: { type: "null" } };
    }

    const baseSchema = schemaFromValue(config, filterContext, 0, firstItem);
    for (const [itemIndex, itemValue] of restItems.entries()) {
      mergeSchemas(
        baseSchema,
        schemaFromValue(config, filterContext, itemIndex + 1, itemValue),
      );
    }

    return {
      type: "array",
      items: baseSchema,
    };
  }

  if (typeof value === "object" && value !== null) {
    if (objectIsRecord(value)) {
      const [firstEntry, ...restEntries] = Object.entries(value);
      assert(firstEntry, "Expected first entry to be present");

      const valueSchema = schemaFromValue(
        config,
        filterContext,
        firstEntry[0],
        firstEntry[1],
      );
      for (const [restEntryKey, restEntryValue] of restEntries) {
        mergeSchemas(
          valueSchema,
          schemaFromValue(config, filterContext, restEntryKey, restEntryValue),
        );
      }

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
    assert(schema.required, "Expected required to be present");
    assert(schema.properties, "Expected properties to be present");

    for (const [key, objectValue] of Object.entries(value)) {
      schema.properties[key] = schemaFromValue(
        config,
        filterContext,
        key,
        objectValue,
      );
      schema.required.push(key);
    }

    return schema;
  }

  throw new Error(`Unexpected value type: ${value} (${typeof value})`);
}

function mergeSchemaIntoOneOf(
  oneOfList: Required<SchemaObject>["oneOf"],
  newSchema: SchemaObject,
): void {
  assert(isNotRef(newSchema), "Reference object not expected");

  const existingOneOf = oneOfList.find(
    (schema) => isNotRef(schema) && schema.type === newSchema.type,
  );
  assert(isNotRef(existingOneOf), "Reference object not expected");

  if (existingOneOf) {
    mergeSchemas(existingOneOf, newSchema);
  } else {
    oneOfList.push(newSchema);
  }
}

export function mergeSchemas(
  existingSchema: SchemaObject,
  newSchema: SchemaObject,
): void {
  if (existingSchema.oneOf && newSchema.oneOf) {
    for (const newOneOf of newSchema.oneOf) {
      assert(isNotRef(newOneOf), "Reference object not expected");
      mergeSchemaIntoOneOf(existingSchema.oneOf, newOneOf);
    }
    return;
  }
  if (existingSchema.oneOf && newSchema.type) {
    mergeSchemaIntoOneOf(existingSchema.oneOf, newSchema);
    return;
  }
  if (existingSchema.type && newSchema.oneOf) {
    mergeSchemaIntoOneOf(newSchema.oneOf, existingSchema);
    existingSchema.oneOf = newSchema.oneOf;
    return;
  }

  if (!existingSchema.type && !newSchema.type) {
    throw new Error("Both schemas are missing a type");
  }

  if (existingSchema.type === "null" && newSchema.type !== "null") {
    existingSchema.nullable = true;
    return;
  }
  if (existingSchema.type !== "null" && newSchema.type === "null") {
    existingSchema.nullable = true;
    return;
  }

  if (
    existingSchema.type &&
    newSchema.type &&
    existingSchema.type !== newSchema.type
  ) {
    const existingClone = structuredClone(existingSchema);
    for (const key of Object.keys(existingSchema)) {
      delete existingSchema[key as keyof typeof existingSchema];
    }
    existingSchema.oneOf = [existingClone, newSchema];
    return;
  }

  if (existingSchema.type === "object" && newSchema.type === "object") {
    if (existingSchema.properties && newSchema.properties) {
      for (const [newKey, newValue] of Object.entries(newSchema.properties)) {
        if (existingSchema.properties[newKey]) {
          assert(
            isNotRef(existingSchema.properties[newKey]),
            "Reference object not expected",
          );
          assert(isNotRef(newValue), "Reference object not expected");

          mergeSchemas(existingSchema.properties[newKey], newValue);
        } else {
          existingSchema.properties[newKey] = newValue;
        }
      }

      if (existingSchema.required) {
        const newKeysSet = new Set(Object.keys(newSchema.properties));
        const missingKeys = Object.keys(existingSchema.properties).filter(
          (existingKey) => !newKeysSet.has(existingKey),
        );

        for (const missingKey of missingKeys) {
          const requiredIndex = existingSchema.required.indexOf(missingKey);
          if (requiredIndex !== -1 && requiredIndex !== undefined) {
            existingSchema.required.splice(requiredIndex, 1);
          }
        }
      }
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

  if (existingSchema.type === newSchema.type) {
    for (const [key, value] of Object.entries(newSchema)) {
      existingSchema[key as keyof typeof existingSchema] = value;
    }
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

  for (const newParam of newParameters) {
    const existingParam = existingByNameAndIn.get(
      `${newParam.name}:${newParam.in}`,
    );

    if (existingParam) {
      mergeExamples(existingParam, newParam);
    } else {
      existingParameters.push(newParam);
    }
  }

  for (const existingParam of existingParameters) {
    const newParam = newByNameAndIn.get(
      `${existingParam.name}:${existingParam.in}`,
    );

    if (!newParam) {
      existingParam.required = false;
    }
  }
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
  const filteredHeaders = Object.entries(headers).filter(([key, value]) =>
    filterHeader(config, { ...filterContext, name: key, value }),
  );

  const headerMap: Record<string, HeaderObject> = {};
  for (const [key, value] of filteredHeaders) {
    headerMap[key] = {
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
      headerMap[key].example = value;
    }
  }

  return headerMap;
}

export function mergeHeaderMaps(
  existingHeaders: Record<string, HeaderObject>,
  newHeaders: Record<string, HeaderObject>,
) {
  for (const [key, value] of Object.entries(newHeaders)) {
    if (existingHeaders[key]) {
      mergeExamples(existingHeaders[key], value);
    } else {
      existingHeaders[key] = value;
    }
  }

  for (const [key, value] of Object.entries(existingHeaders)) {
    if (!newHeaders[key]) {
      value.required = false;
    }
  }
}

export async function decodeRawContent(
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
