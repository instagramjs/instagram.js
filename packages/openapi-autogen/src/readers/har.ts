import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import { z } from "zod";

import { type AutogenFlow } from "~/flow";

import { type AutogenReader, type AutogenReaderEventMap } from "./reader";
import { readNthLines } from "./utils";

const harEntrySchema = z.object({
  request: z.object({
    method: z.enum([
      "GET",
      "POST",
      "PUT",
      "DELETE",
      "PATCH",
      "HEAD",
      "OPTIONS",
      "TRACE",
    ]),
    url: z.string(),
    headers: z.array(
      z.object({
        name: z.string(),
        value: z.string(),
      }),
    ),
    postData: z
      .object({
        mimeType: z.string(),
        text: z.string(),
      })
      .optional(),
  }),
  response: z.object({
    status: z.number(),
    headers: z.array(
      z.object({
        name: z.string(),
        value: z.string(),
      }),
    ),
    content: z
      .object({
        size: z.number(),
        mimeType: z.string(),
        text: z.string().optional(),
      })
      .optional(),
  }),
});

const harDataSchema = z.object({
  log: z.object({
    entries: z.array(harEntrySchema),
  }),
});

function harMethodToAutogenMethod(
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

function harHeadersToAutogenHeaders(
  headers: { name: string; value: string }[],
): AutogenFlow["request"]["headers"] {
  const headerMap = new Map<string, string>(
    headers
      .filter((header) => !header.name.startsWith(":"))
      .map((header) => [header.name, header.value]),
  );
  return Object.fromEntries(headerMap);
}

function harEntryToAutogenFlow(
  entry: z.infer<typeof harEntrySchema>,
): AutogenFlow {
  const parsedUrl = new URL(entry.request.url);

  return {
    request: {
      headers: harHeadersToAutogenHeaders(entry.request.headers),
      content: entry.request.postData?.text ?? null,
      method: harMethodToAutogenMethod(entry.request.method),
      path: parsedUrl.pathname + parsedUrl.search,
      host: parsedUrl.host,
      scheme: parsedUrl.protocol.replace(":", "") as "http" | "https",
    },
    response: {
      headers: harHeadersToAutogenHeaders(entry.response.headers),
      content: entry.response.content?.text ?? null,
      statusCode: entry.response.status,
    },
    type: "http",
  };
}

const isValidStatusCode = (statusCode: number): boolean => {
  return statusCode >= 100 && statusCode < 600;
};

export function createHarReader(filePath: string): AutogenReader {
  const eventEmitter = new EventEmitter<AutogenReaderEventMap>();

  const fileStream = fs.createReadStream(filePath, "utf-8");

  const processStream = async () => {
    let data = "";
    for await (const chunk of fileStream) {
      data += chunk;
    }

    const parsedData = harDataSchema.parse(JSON.parse(data));

    for (const entry of parsedData.log.entries) {
      const flow = harEntryToAutogenFlow(entry);
      if (flow.response && !isValidStatusCode(flow.response.statusCode)) {
        continue;
      }

      eventEmitter.emit("read", flow);
    }

    eventEmitter.emit("complete");
  };

  processStream()
    .catch((err) => eventEmitter.emit("error", err))
    .finally(() => eventEmitter.emit("complete"));

  return eventEmitter;
}

export async function isProbablyHarFile(filePath: string) {
  const extension = path.extname(filePath);
  if (extension === ".har") {
    return true;
  }

  const [firstLine, secondLine] = await readNthLines(filePath, 2);
  if (!firstLine || !secondLine) {
    return false;
  }

  if (!firstLine.startsWith("{")) {
    return false;
  }
  if (!secondLine.includes(`"log": {`)) {
    return false;
  }

  return true;
}
