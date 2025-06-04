import assert from "assert";
import {
  type ComponentsObject,
  type ExampleObject,
  type HeaderObject,
  type OpenAPI3,
  type ParameterObject,
  type ReferenceObject,
  type RequestBodyObject,
  type ResponseObject,
  type SchemaObject,
} from "openapi-typescript";
import qs from "qs";

import { type AutogenConfigFinal, type RequestFilterContext } from "./config";
import { ALWAYS_IGNORED_HEADERS, ALWAYS_OPTIONAL_HEADERS } from "./const";

export function isRef<T extends object | undefined>(
  value: T,
): value is T & ReferenceObject {
  return value !== undefined && "$ref" in value;
}

type ObjectRefType =
  | "schema"
  | "parameter"
  | "response"
  | "example"
  | "requestBody";
type ObjectRefTypeToObjectType = {
  schema: SchemaObject;
  parameter: ParameterObject;
  response: ResponseObject;
  example: ExampleObject;
  requestBody: RequestBodyObject;
};
const objectRefTypeToComponentsKey: Record<
  ObjectRefType,
  keyof ComponentsObject
> = {
  schema: "schemas",
  parameter: "parameters",
  response: "responses",
  example: "examples",
  requestBody: "requestBodies",
};

export function getObjectOrRef<
  T extends ObjectRefTypeToObjectType[K],
  K extends ObjectRefType,
>(spec: OpenAPI3, type: K, obj: T | ReferenceObject): T {
  if (isRef(obj)) {
    const refKey = obj.$ref.split("/").pop();
    if (!refKey) {
      throw new Error(`Invalid reference: ${obj.$ref}`);
    }
    const refObj =
      spec.components?.[objectRefTypeToComponentsKey[type]]?.[refKey] ?? null;
    if (!refObj) {
      throw new Error(`Unknown reference: ${obj.$ref}`);
    }

    return refObj;
  }

  return obj;
}

export function isSchemaObjectOrRef(
  value: unknown,
): value is SchemaObject | ReferenceObject {
  return (
    typeof value === "object" &&
    value !== null &&
    ("type" in value || "$ref" in value)
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

export function normalizedPath(path: string): string {
  if (path.startsWith("/")) {
    return path;
  }
  return "/" + path;
}

export function parseQsWithConfig(
  _config: AutogenConfigFinal,
  searchParams: URLSearchParams,
): Record<string, unknown> {
  return qs.parse(searchParams.toString(), {
    allowEmptyArrays: true,
  });
}

export function parametersFromPathParameters(
  config: AutogenConfigFinal,
  filterContext: RequestFilterContext,
  filterPath: string,
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
      config.filterExample({
        ...filterContext,
        path: `${filterPath}.path.${pathParameterName}`,
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
  config: AutogenConfigFinal,
  filterContext: RequestFilterContext,
  filterPath: string,
  headers: Record<string, string>,
): ParameterObject[] {
  const filteredHeaders = Object.entries(headers).filter(
    ([key, value]) =>
      !ALWAYS_IGNORED_HEADERS.includes(key) &&
      config.filterParameter({
        ...filterContext,
        path: `${filterPath}.headers.${key}`,
        value,
      }),
  );

  const parameters: ParameterObject[] = [];
  for (const [headerName, headerValue] of filteredHeaders) {
    const parameter: ParameterObject = {
      name: headerName,
      in: "header",
      required: !ALWAYS_OPTIONAL_HEADERS.includes(headerName),
      schema: { type: "string" },
    };
    if (
      config.filterExample({
        ...filterContext,
        path: `${filterPath}.headers.${headerName}`,
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
  def: OpenAPI3,
  config: AutogenConfigFinal,
  filterContext: RequestFilterContext,
  filterPath: string,
  searchParams: URLSearchParams,
): ParameterObject[] {
  const parsedQs = parseQsWithConfig(config, searchParams);

  const parameters: ParameterObject[] = [];
  for (const [key, value] of Object.entries(parsedQs)) {
    const parameter: ParameterObject = {
      name: key,
      in: "query",
      required: true,
      schema: schemaFromValue(
        def,
        config,
        filterContext,
        `${filterPath}.query.${key}`,
        value,
      ),
    };
    if (
      config.filterExample({
        ...filterContext,
        path: `${filterPath}.query.${key}`,
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
  spec: OpenAPI3,
  config: AutogenConfigFinal,
  filterContext: RequestFilterContext,
  filterPath: string,
  searchParams: URLSearchParams,
): SchemaObject {
  if (
    !config.filterSchema({
      ...filterContext,
      path: filterPath,
      value: searchParams,
    })
  ) {
    return { type: "null" };
  }

  const parsedQs = parseQsWithConfig(config, searchParams);

  return schemaFromValue(spec, config, filterContext, filterPath, parsedQs);
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
  spec: OpenAPI3,
  config: AutogenConfigFinal,
  filterContext: RequestFilterContext,
  filterPath: string,
  value: unknown,
): SchemaObject {
  if (value === undefined || value === null) {
    return { type: "null" };
  }

  if (
    !config.filterSchema({
      ...filterContext,
      path: filterPath,
      value: value,
    })
  ) {
    return { type: "null" };
  }

  if (typeof value === "string") {
    const schema: SchemaObject = { type: "string" };
    if (
      config.filterExample({
        ...filterContext,
        path: filterPath,
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
      config.filterExample({
        ...filterContext,
        path: filterPath,
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
      config.filterExample({
        ...filterContext,
        path: filterPath,
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

    const baseSchema = schemaFromValue(
      spec,
      config,
      filterContext,
      filterPath,
      firstItem,
    );
    for (const [itemIndex, itemValue] of restItems.entries()) {
      mergeSchemas(
        spec,
        baseSchema,
        schemaFromValue(
          spec,
          config,
          filterContext,
          `${filterPath}.${itemIndex}`,
          itemValue,
        ),
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
      assert(firstEntry !== undefined, "Expected first entry to be present");
      const [firstEntryKey, firstEntryValue] = firstEntry;

      const valueSchema = schemaFromValue(
        spec,
        config,
        filterContext,
        `${filterPath}.${firstEntryKey}`,
        firstEntryValue,
      );
      for (const [restEntryKey, restEntryValue] of restEntries) {
        mergeSchemas(
          spec,
          valueSchema,
          schemaFromValue(
            spec,
            config,
            filterContext,
            `${filterPath}.${restEntryKey}`,
            restEntryValue,
          ),
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
    assert(schema.required !== undefined, "Expected required to be present");
    assert(
      schema.properties !== undefined,
      "Expected properties to be present",
    );

    for (const [key, objectValue] of Object.entries(value)) {
      schema.properties[key] = schemaFromValue(
        spec,
        config,
        filterContext,
        `${filterPath}.${key}`,
        objectValue,
      );
      schema.required.push(key);
    }

    return schema;
  }

  throw new Error(`Unexpected value type: ${value} (${typeof value})`);
}

function mergeSchemaIntoOneOf(
  spec: OpenAPI3,
  oneOfList: Required<SchemaObject>["oneOf"],
  newSchema: SchemaObject,
): void {
  const existingOneOf = oneOfList.find(
    (schema) => getObjectOrRef(spec, "schema", schema).type === newSchema.type,
  );

  if (existingOneOf) {
    mergeSchemas(
      spec,
      getObjectOrRef(spec, "schema", existingOneOf),
      newSchema,
    );
  } else {
    oneOfList.push(newSchema);
  }
}

export function mergeSchemas(
  spec: OpenAPI3,
  existingSchema: SchemaObject,
  newSchema: SchemaObject,
): void {
  if (existingSchema.oneOf && newSchema.oneOf) {
    for (const newOneOf of newSchema.oneOf) {
      mergeSchemaIntoOneOf(
        spec,
        existingSchema.oneOf,
        getObjectOrRef(spec, "schema", newOneOf),
      );
    }
    return;
  }
  if (existingSchema.oneOf && newSchema.type) {
    mergeSchemaIntoOneOf(spec, existingSchema.oneOf, newSchema);
    return;
  }
  if (existingSchema.type && newSchema.oneOf) {
    mergeSchemaIntoOneOf(spec, newSchema.oneOf, existingSchema);
    existingSchema.oneOf = newSchema.oneOf;
    return;
  }

  if (!existingSchema.type && !newSchema.type) {
    throw new Error("Both schemas are missing a type");
  }

  if (existingSchema.type === "null" && newSchema.type !== "null") {
    existingSchema.nullable = true;
    for (const [key, value] of Object.entries(newSchema)) {
      existingSchema[key as keyof typeof existingSchema] = value;
    }
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
          mergeSchemas(
            spec,
            getObjectOrRef(spec, "schema", existingSchema.properties[newKey]),
            getObjectOrRef(spec, "schema", newValue),
          );
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
        isSchemaObjectOrRef(existingSchema.additionalProperties),
        "Expected existing additionalProperties to be a schema",
      );
      assert(
        isSchemaObjectOrRef(newSchema.additionalProperties),
        "Expected new additionalProperties to be a schema",
      );

      mergeSchemas(
        spec,
        getObjectOrRef(spec, "schema", existingSchema.additionalProperties),
        getObjectOrRef(spec, "schema", newSchema.additionalProperties),
      );
    }

    return;
  }

  if (existingSchema.type === "array" && newSchema.type === "array") {
    assert(
      existingSchema.items !== undefined,
      "Expected items in existing schema",
    );
    assert(
      !Array.isArray(existingSchema.items),
      "Expected existing schema items to not be an array",
    );
    assert(newSchema.items !== undefined, "Expected items in new schema");
    assert(
      !Array.isArray(newSchema.items),
      "Expected new schema items to not be an array",
    );

    const existingItemsSchema = getObjectOrRef(
      spec,
      "schema",
      existingSchema.items,
    );
    const newItemsSchema = getObjectOrRef(spec, "schema", newSchema.items);

    mergeSchemas(spec, existingItemsSchema, newItemsSchema);

    if (
      existingItemsSchema.type !== "null" &&
      existingItemsSchema.nullable === true
    ) {
      delete existingItemsSchema.nullable;
    }
    if (newItemsSchema.type !== "null" && newItemsSchema.nullable === true) {
      delete newItemsSchema.nullable;
    }

    return;
  }

  if (existingSchema.type === newSchema.type) {
    Object.assign(existingSchema, newSchema);
    return;
  }
}

export function mergeParameters(
  spec: OpenAPI3,
  maybeExistingParameters: (ParameterObject | ReferenceObject)[],
  maybeNewParameters: (ParameterObject | ReferenceObject)[],
): void {
  const existingByNameAndIn = new Map<
    string,
    ParameterObject | ReferenceObject
  >(
    maybeExistingParameters.map((param) => {
      const obj = getObjectOrRef(spec, "parameter", param);
      return [`${obj.name}:${obj.in}`, obj];
    }),
  );
  const newByNameAndIn = new Map<string, ParameterObject | ReferenceObject>(
    maybeNewParameters.map((param) => {
      const obj = getObjectOrRef(spec, "parameter", param);
      return [`${obj.name}:${obj.in}`, obj];
    }),
  );

  for (const newParam of maybeNewParameters) {
    const newParamObj = getObjectOrRef(spec, "parameter", newParam);
    const existingParam = existingByNameAndIn.get(
      `${newParamObj.name}:${newParamObj.in}`,
    );

    if (existingParam) {
      const existingParamObj = getObjectOrRef(spec, "parameter", existingParam);
      mergeParameterObjs(spec, existingParamObj, newParamObj);
    } else {
      maybeExistingParameters.push(newParam);
    }
  }

  for (const existingParam of maybeExistingParameters) {
    const existingParamObj = getObjectOrRef(spec, "parameter", existingParam);
    const newParam = newByNameAndIn.get(
      `${existingParamObj.name}:${existingParamObj.in}`,
    );

    if (!newParam) {
      existingParamObj.required = false;
    }
  }
}

export function mergeParameterObjs(
  spec: OpenAPI3,
  existingParam: ParameterObject,
  newParam: ParameterObject,
): void {
  if (existingParam.schema && newParam.schema) {
    mergeSchemas(spec, existingParam.schema, newParam.schema);
  }
  mergeExamples(existingParam, newParam);
  if (newParam.required === false) {
    existingParam.required = false;
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
  config: AutogenConfigFinal,
  filterContext: RequestFilterContext,
  filterPath: string,
  headers: Record<string, string>,
): Record<string, HeaderObject> {
  const filteredHeaders = Object.entries(headers).filter(
    ([key, value]) =>
      !ALWAYS_IGNORED_HEADERS.includes(key) &&
      config.filterParameter({
        ...filterContext,
        path: `${filterPath}.headers.${key}`,
        value,
      }),
  );

  const headerMap: Record<string, HeaderObject> = {};
  for (const [key, value] of filteredHeaders) {
    headerMap[key] = {
      schema: { type: "string" },
      required: !ALWAYS_OPTIONAL_HEADERS.includes(key),
    };
    if (
      config.filterExample({
        ...filterContext,
        path: `${filterPath}.headers.${key}`,
        value: value,
      })
    ) {
      headerMap[key].example = value;
    }
  }

  return headerMap;
}

export function mergeHeaderMaps(
  spec: OpenAPI3,
  existingHeaders: Record<string, HeaderObject>,
  newHeaders: Record<string, HeaderObject>,
) {
  for (const [key, value] of Object.entries(newHeaders)) {
    if (existingHeaders[key]) {
      mergeHeaderObjs(spec, existingHeaders[key], value);
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

export function mergeHeaderObjs(
  spec: OpenAPI3,
  existingHeader: HeaderObject,
  newHeader: HeaderObject,
): void {
  if (existingHeader.schema && newHeader.schema) {
    mergeSchemas(spec, existingHeader.schema, newHeader.schema);
  }
  mergeExamples(existingHeader, newHeader);
  if (newHeader.required === false) {
    existingHeader.required = false;
  }
}
