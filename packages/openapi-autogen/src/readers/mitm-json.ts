import EventEmitter from "events";
import fs from "fs";
import readline from "readline";
import { promisify } from "util";
import { gunzip, inflate, zstdDecompress } from "zlib";
import { z } from "zod";

import {
  type AutogenFlow,
  type AutogenFlowMethod,
  type AutogenFlowResponse,
} from "~/flow";

import { type AutogenReader, type AutogenReaderEventMap } from "./reader";
import { readNthLines } from "./utils";

const gunzipAsync = promisify(gunzip);
const zstdDecompressAsync = promisify(zstdDecompress);
const inflateAsync = promisify(inflate);

const mitmFlowJsonSchema = z.object({
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
type MitmFlow = z.infer<typeof mitmFlowJsonSchema>;

function mitmMethodToAutogenMethod(method: string): AutogenFlowMethod {
  switch (method) {
    case "GET":
      return "get";
    case "PUT":
      return "put";
    case "POST":
      return "post";
    case "DELETE":
      return "delete";
    case "PATCH":
      return "patch";
    case "HEAD":
      return "head";
    case "OPTIONS":
      return "options";
    case "TRACE":
      return "trace";
    default:
      throw new Error(`Unsupported request method: ${method}`);
  }
}

type Encoding = "zstd" | "gzip" | "deflate";

function isEncoding(encoding: string): encoding is Encoding {
  return encoding === "zstd" || encoding === "gzip" || encoding === "deflate";
}

async function decodeBody(content: string, encoding: Encoding) {
  const contentBuffer = Buffer.from(content, "base64");
  switch (encoding) {
    case "zstd":
      return await zstdDecompressAsync(contentBuffer).then((buffer) =>
        buffer.toString(),
      );
    case "gzip":
      return await gunzipAsync(contentBuffer).then((buffer) =>
        buffer.toString(),
      );
    case "deflate":
      return await inflateAsync(contentBuffer).then((buffer) =>
        buffer.toString(),
      );
    default:
      throw new Error(`Unsupported encoding: ${encoding}`);
  }
}

async function mitmFlowToAutogenFlow(flow: MitmFlow): Promise<AutogenFlow> {
  let requestBody = flow.request.content;
  const requestBodyEncoding = flow.request.headers["content-encoding"];
  if (requestBody && requestBodyEncoding && isEncoding(requestBodyEncoding)) {
    requestBody = await decodeBody(requestBody, requestBodyEncoding);
  }

  let response: AutogenFlowResponse | null = null;
  if (flow.response) {
    let responseBody = flow.response.content;
    const responseBodyEncoding = flow.response.headers["content-encoding"];
    if (
      responseBody &&
      responseBodyEncoding &&
      isEncoding(responseBodyEncoding)
    ) {
      responseBody = await decodeBody(responseBody, responseBodyEncoding);
    }

    response = {
      headers: flow.response.headers,
      content: responseBody,
      statusCode: flow.response.status_code,
    };
  }

  return {
    type: flow.type,
    request: {
      headers: flow.request.headers,
      content: flow.request.content,
      host: flow.request.host,
      method: mitmMethodToAutogenMethod(flow.request.method),
      path: flow.request.path,
      scheme: flow.request.scheme,
    },
    response,
  };
}

async function processReadlineStream(
  rl: readline.Interface,
  eventEmitter: EventEmitter<AutogenReaderEventMap>,
) {
  let linesRead = 0;

  for await (const line of rl) {
    linesRead++;

    let parsedJson;
    try {
      parsedJson = JSON.parse(line);
    } catch (err) {
      eventEmitter.emit(
        "error",
        new Error(`Failed to parse MiTM flow JSON at line ${linesRead}`, {
          cause: err as Error,
        }),
      );
      continue;
    }

    const parsedFlowResult = mitmFlowJsonSchema.safeParse(parsedJson);
    if (!parsedFlowResult.success) {
      eventEmitter.emit(
        "error",
        new Error(`Failed to parse MiTM flow JSON at line ${linesRead}`, {
          cause: parsedFlowResult.error,
        }),
      );
      continue;
    }

    let autogenFlow;
    try {
      autogenFlow = await mitmFlowToAutogenFlow(parsedFlowResult.data);
    } catch (err) {
      eventEmitter.emit(
        "error",
        new Error(`Failed to parse MiTM flow at line ${linesRead}`, {
          cause: err as Error,
        }),
      );
      continue;
    }

    eventEmitter.emit("read", autogenFlow);
  }
}

export function createMitmJsonReader(filePath: string): AutogenReader {
  const eventEmitter = new EventEmitter<AutogenReaderEventMap>();

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream });

  processReadlineStream(rl, eventEmitter)
    .catch((err) => {
      eventEmitter.emit("error", err);
    })
    .then(() => {
      eventEmitter.emit("complete");
    });

  return eventEmitter;
}

export async function isProbablyMitmJsonFile(filePath: string) {
  const [firstLine] = await readNthLines(filePath, 1);
  if (!firstLine) {
    return false;
  }

  let parsedJson;
  try {
    parsedJson = JSON.parse(firstLine);
  } catch {
    return false;
  }

  return mitmFlowJsonSchema.safeParse(parsedJson).success;
}
