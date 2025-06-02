import EventEmitter from "events";
import fs from "fs";
import readline from "readline";
import { promisify } from "util";
import { gunzip, inflate, zstdDecompress } from "zlib";
import { z } from "zod";

import { type AutogenFlow } from "~/flow";

import { type AutogenReader, type AutogenReaderEventMap } from "./reader";

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

function mitmMethodToAutogenMethod(
  method: string,
): AutogenFlow["request"]["method"] {
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
  switch (encoding) {
    case "zstd":
      return await zstdDecompressAsync(content).then((buffer) =>
        buffer.toString(),
      );
    case "gzip":
      return await gunzipAsync(content).then((buffer) => buffer.toString());
    case "deflate":
      return await inflateAsync(content).then((buffer) => buffer.toString());
    default:
      throw new Error(`Unsupported encoding: ${encoding}`);
  }
}

async function mitmFlowToAutogenFlow(
  flow: z.infer<typeof mitmFlowJsonSchema>,
): Promise<AutogenFlow> {
  let requestBody = flow.request.content;
  const requestBodyEncoding = flow.request.headers["content-encoding"];
  if (requestBody && requestBodyEncoding && isEncoding(requestBodyEncoding)) {
    requestBody = await decodeBody(requestBody, requestBodyEncoding);
  }

  let response: AutogenFlow["response"] = null;
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

export type MitmFlowsJsonReaderOptions = {
  filepath: string;
};

export function createMitmFlowsJsonReader(
  options: MitmFlowsJsonReaderOptions,
): AutogenReader {
  const eventEmitter = new EventEmitter<AutogenReaderEventMap>();

  const fileStream = fs.createReadStream(options.filepath);
  const rl = readline.createInterface({ input: fileStream });

  let lineCount = 0;

  rl.on("line", async (line) => {
    lineCount++;

    let parsedJson;
    try {
      parsedJson = mitmFlowJsonSchema.parse(JSON.parse(line));
    } catch (err) {
      eventEmitter.emit(
        "error",
        new Error(`Failed to parse MiTM flow JSON at line ${lineCount}`, {
          cause: err as Error,
        }),
      );
      return;
    }

    let autogenFlow;
    try {
      autogenFlow = await mitmFlowToAutogenFlow(parsedJson);
    } catch (err) {
      eventEmitter.emit(
        "error",
        new Error(`Failed to parse MiTM flow at line ${lineCount}`, {
          cause: err as Error,
        }),
      );
      return;
    }

    eventEmitter.emit("read", autogenFlow);
  });
  rl.on("close", () => {
    eventEmitter.emit("complete");
  });
  rl.on("error", (err) => {
    eventEmitter.emit("error", err);
  });

  return eventEmitter;
}
