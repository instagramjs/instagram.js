import { cac } from "cac";
import fs from "fs";
import { type OpenAPI3 } from "openapi-typescript";
import yaml from "yaml";
import { z } from "zod";

import { version } from "../package.json";
import { createOpenAPIAutogen } from "./autogen";
import { createHarReader } from "./readers/har";
import { createMitmJsonReader } from "./readers/mitm-json";
import { type AutogenReader } from "./readers/reader";

const argsSchema = z.object({
  name: z.string(),
  apiPrefix: z.string(),
  input: z.string(),
  inputFormat: z.enum(["mitm-json", "har"]),
  schema: z.string(),
  schemaFormat: z.enum(["yaml", "json"]),
});
type Args = z.infer<typeof argsSchema>;

function deserializeSpec(data: string, format: "yaml" | "json"): OpenAPI3 {
  switch (format) {
    case "yaml":
      return yaml.parse(data);
    case "json":
      return JSON.parse(data);
  }
}

function serializeSpec(spec: OpenAPI3, format: "yaml" | "json"): string {
  switch (format) {
    case "yaml":
      return yaml.stringify(spec);
    case "json":
      return JSON.stringify(spec, null, 2);
  }
}

async function main() {
  const cli = cac("openapi-autogen");

  const run = async (args: Args) => {
    try {
      await fs.promises.access(args.input, fs.constants.F_OK);
    } catch {
      console.error(`Input file ${args.input} does not exist`);
      process.exit(1);
    }

    let existingDefData: string | null = null;
    try {
      existingDefData = await fs.promises.readFile(args.schema, "utf-8");
    } catch {
      // ignore
    }

    let existingDef: OpenAPI3 | null = null;
    if (existingDefData) {
      try {
        existingDef = deserializeSpec(existingDefData, args.schemaFormat);
      } catch (err) {
        console.error(`Failed to parse schema file ${args.schema}:`, err);
        process.exit(1);
      }
    }

    let reader: AutogenReader;
    switch (args.inputFormat) {
      case "mitm-json":
        reader = createMitmJsonReader({ filepath: args.input });
        break;
      case "har":
        reader = createHarReader({ filepath: args.input });
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
      await fs.promises.writeFile(
        args.schema,
        serializeSpec(spec, args.schemaFormat),
      );
    } catch (err) {
      console.error(`Error writing schema file:`, err);
      process.exit(1);
    }
  };

  cli
    .command("", "Auto-generate an OpenAPI spec from a request dump file")
    .option("-n, --name <name>", "The name of the API")
    .option("-p, --api-prefix <api-prefix>", "The API prefix")
    .option("-i, --input <input-file>", "The request dump file to read from")
    .option(
      "-f, --input-format <mitm-json|har>",
      "The format of the input file",
    )
    .option("-s, --schema <schema-file>", "The schema file to read/write from")
    .option(
      "-o, --schema-format [yaml|json]",
      "The format of the schema file",
      {
        default: "yaml",
      },
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
