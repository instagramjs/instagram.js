import { cac } from "cac";
import fs from "fs";
import { type OpenAPI3 } from "openapi-typescript";
import yaml from "yaml";
import { z } from "zod";

import { version } from "../package.json";
import { createOpenAPIAutogen } from "./autogen";
import { createHarReader, isProbablyHarFile } from "./readers/har";
import {
  createMitmJsonReader,
  isProbablyMitmJsonFile,
} from "./readers/mitm-json";
import { type AutogenReader } from "./readers/reader";

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
type Args = z.infer<typeof argsSchema>;

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

async function run(args: Args) {
  let inputFormat;
  if (args.inputFormat) {
    inputFormat = args.inputFormat;
  } else {
    inputFormat = await guessInputFormat(args.input);
    if (!inputFormat) {
      console.error(
        `Unable to infer format of ${args.input}, please provide a format with --input-format`,
      );
      process.exit(1);
    }
  }

  let specFormat;
  if (args.specFormat) {
    specFormat = args.specFormat;
  } else {
    specFormat = specFormatFromFilename(args.spec);
    if (!specFormat) {
      console.error(
        `Unable to infer format of ${args.spec}, please provide a format with --spec-format`,
      );
      process.exit(1);
    }
  }

  try {
    await fs.promises.access(args.input, fs.constants.F_OK);
  } catch {
    console.error(`Input file ${args.input} does not exist`);
    process.exit(1);
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
      console.error(`Failed to parse schema file ${args.spec}:`, err);
      process.exit(1);
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

  const autogen = createOpenAPIAutogen(
    {
      name: args.name,
      apiPrefix: args.apiPrefix,
    },
    existingDef,
  );
  reader.on("read", (flow) => autogen.processFlow(flow));

  let spec;
  try {
    spec = await new Promise<OpenAPI3>((resolve, reject) => {
      reader.on("error", (err) => reject(err));
      reader.on("complete", () => resolve(autogen.complete()));
    });
  } catch (err) {
    console.error(`Error reading input file:`, err);
    process.exit(1);
  }

  try {
    await fs.promises.writeFile(args.spec, serializeSpec(spec, specFormat));
  } catch (err) {
    console.error(`Error writing schema file:`, err);
    process.exit(1);
  }
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
    .action(async (args) => {
      const parsedArgs = argsSchema.parse(args);
      await run(parsedArgs);
    });

  cli.help();
  cli.version(version);

  cli.parse(process.argv, { run: false });
  try {
    await cli.runMatchedCommand();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
