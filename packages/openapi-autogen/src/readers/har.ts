import { EventEmitter } from "events";
import fs from "fs";
import { z } from "zod";

import { type AutogenFlow } from "~/flow";

import { type AutogenReader, type AutogenReaderEventMap } from "./reader";

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
type HarEntry = z.infer<typeof harEntrySchema>;

const harDataSchema = z.object({
  log: z.object({
    entries: z.array(harEntrySchema),
  }),
});
type HarData = z.infer<typeof harDataSchema>;

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

export type HarReaderOptions = {
  filepath: string;
};

export function createHarReader(options: HarReaderOptions): AutogenReader {
  const eventEmitter = new EventEmitter<AutogenReaderEventMap>();

  const fileStream = fs.createReadStream(options.filepath, "utf-8");

  let data = "";
  fileStream.on("data", (chunk) => {
    data += chunk;
  });

  fileStream.on("end", () => {
    const parsedData = harDataSchema.parse(JSON.parse(data));

    for (const entry of parsedData.log.entries) {
      const flow = harEntryToAutogenFlow(entry);
      if (flow.response && !isValidStatusCode(flow.response.statusCode)) {
        continue;
      }

      eventEmitter.emit("read", flow);
    }

    eventEmitter.emit("complete");
  });

  return eventEmitter;
}
