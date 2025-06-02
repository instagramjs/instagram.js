import { cac } from "cac";
import fs from "fs";
import { type OpenAPI3 } from "openapi-typescript";
import yaml from "yaml";
import { gray, green, white } from "yoctocolors";
import { z } from "zod";

import { version } from "../package.json";
import { createOpenAPIAutogen } from "./autogen";
import { createHarReader, isProbablyHarFile } from "./readers/har";
import {
  createMitmJsonReader,
  isProbablyMitmJsonFile,
} from "./readers/mitm-json";
import { type AutogenReader } from "./readers/reader";

function log(
  level: "info" | "warn" | "error",
  prefix: string,
  message: string,
) {
  console[level](`${prefix} ${message}`);
}

function failAndExit(message: string) {
  log("error", "❌", message);
  process.exit(1);
}

function formatDurationMs(duration: number): string {
  if (duration < 1000) {
    return `${duration}ms`;
  }
  return `${(duration / 1000).toFixed(2)}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1000) {
    return `${bytes}B`;
  }
  if (bytes < 1000 * 1000) {
    return `${(bytes / 1000).toFixed(2)}KB`;
  }
  return `${(bytes / 1000 / 1000).toFixed(2)}MB`;
}

type SpecFormat = "yaml" | "json";
type InputFormat = "har" | "mitm-json";

function specFormatFromFilename(filename: string): SpecFormat | undefined {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "yaml":
    case "yml":
      return "yaml";
    case "json":
      return "json";
  }
}

async function guessInputFormat(
  filePath: string,
): Promise<InputFormat | undefined> {
  if (await isProbablyHarFile(filePath)) {
    return "har";
  }
  if (await isProbablyMitmJsonFile(filePath)) {
    return "mitm-json";
  }

  return undefined;
}

function deserializeSpec(data: string, format: SpecFormat): OpenAPI3 {
  switch (format) {
    case "yaml":
      return yaml.parse(data);
    case "json":
      return JSON.parse(data);
  }
}

function serializeSpec(spec: OpenAPI3, format: SpecFormat): string {
  switch (format) {
    case "yaml":
      return yaml.stringify(spec);
    case "json":
      return JSON.stringify(spec, null, 2);
  }
}

const argsSchema = z.object({
  name: z.string({ message: "Invalid API name" }),
  apiPrefix: z.string({ message: "Invalid API prefix" }).url({
    message: "API prefix must be a valid URL",
  }),
  input: z.string({ message: "Invalid input file" }),
  inputFormat: z
    .enum(["mitm-json", "har"], {
      message: "Invalid input format",
    })
    .optional(),
  spec: z.string({
    message: "Invalid OpenAPI spec file",
  }),
  specFormat: z
    .enum(["yaml", "json"], { message: "Invalid OpenAPI spec format" })
    .optional(),
});

async function run(rawArgs: unknown) {
  log("info", "✨", `${white("openapi-autogen")} ${gray(`v${version}`)}`);

  const startedAt = Date.now();

  const parseArgsResult = argsSchema.safeParse(rawArgs);
  if (!parseArgsResult.success) {
    return failAndExit(parseArgsResult.error.message);
  }
  const args = parseArgsResult.data;

  log("info", "✨", `Input: ${args.input}`);

  let inputFormat;
  if (args.inputFormat) {
    inputFormat = args.inputFormat;
  } else {
    inputFormat = await guessInputFormat(args.input);
    if (!inputFormat) {
      return failAndExit(
        `Unable to infer format of ${args.input}, please provide a format with --input-format`,
      );
    }
  }

  log("info", "✨", `Input format: ${inputFormat}`);

  log("info", "✨", `Spec: ${args.spec}`);

  let specFormat;
  if (args.specFormat) {
    specFormat = args.specFormat;
  } else {
    specFormat = specFormatFromFilename(args.spec);
    if (!specFormat) {
      return failAndExit(
        `Unable to infer format of ${args.spec}, please provide a format with --spec-format`,
      );
    }
  }

  log("info", "✨", `Spec format: ${specFormat}`);

  try {
    await fs.promises.access(args.input, fs.constants.F_OK);
  } catch {
    return failAndExit(`Input file ${args.input} does not exist`);
  }

  let existingDefData: string | null = null;
  try {
    existingDefData = await fs.promises.readFile(args.spec, "utf-8");
  } catch {
    // ignore
  }

  let existingDef: OpenAPI3 | null = null;
  if (existingDefData) {
    try {
      existingDef = deserializeSpec(existingDefData, specFormat);
    } catch (err) {
      return failAndExit(
        `Failed to parse ${args.spec} as ${specFormat}: ${err}`,
      );
    }
  }

  let reader: AutogenReader;
  switch (inputFormat) {
    case "mitm-json":
      reader = createMitmJsonReader(args.input);
      break;
    case "har":
      reader = createHarReader(args.input);
      break;
  }

  const autogenStartedAt = Date.now();

  const autogen = createOpenAPIAutogen(
    {
      name: args.name,
      apiPrefix: args.apiPrefix,
    },
    existingDef,
  );

  let spec;
  try {
    spec = await new Promise<OpenAPI3>((resolve, reject) => {
      reader.on("read", (flow) => autogen.processFlow(flow));
      reader.on("error", (err) => reject(err));
      reader.on("complete", () => resolve(autogen.complete()));
    });
  } catch (err) {
    return failAndExit(`Error reading input file: ${err}`);
  }

  const autogenDuration = Date.now() - autogenStartedAt;
  log(
    "info",
    "⌛",
    `${white(existingDef ? "Updated" : "Generated")} ${green(formatDurationMs(autogenDuration))}`,
  );

  const serializedSpec = serializeSpec(spec, specFormat);
  try {
    await fs.promises.writeFile(args.spec, serializedSpec);
  } catch (err) {
    return failAndExit(`Error writing schema file: ${err}`);
  }

  log(
    "info",
    "⌛",
    `${white(args.spec)} ${green(
      formatBytes(Buffer.byteLength(serializedSpec, "utf-8")),
    )}`,
  );

  const totalDuration = Date.now() - startedAt;
  log("info", "⚡️", `Success in ${formatDurationMs(totalDuration)}`);
}

async function main() {
  const cli = cac("openapi-autogen");

  cli
    .command("", "Auto-generate an OpenAPI spec from a request dump file")
    .option("-n, --name <name>", "The API name to include in the spec.")
    .option(
      "-p, --api-prefix <api-prefix>",
      "The API prefix. Only requests prefixed with this URL will be included in the spec.",
    )
    .option(
      "-i, --input <input-file>",
      "The location of the dump file to read from.",
    )
    .option(
      "-f, --input-format [mitm-json|har]",
      "The format of the dump file. If not specified, it will be inferred.",
    )
    .option(
      "-s, --spec <spec-file>",
      "The location of the OpenAPI spec to read/write from",
      {
        default: "openapi.yaml",
      },
    )
    .option(
      "-o, --spec-format [yaml|json]",
      "The format of the OpenAPI spec. If not specified, it will be inferred.",
    )
    .action(run);

  cli.help();
  cli.version(version);

  cli.parse(process.argv, { run: false });
  try {
    await cli.runMatchedCommand();
  } catch (err) {
    return failAndExit((err as Error).message);
  }
}

main();
