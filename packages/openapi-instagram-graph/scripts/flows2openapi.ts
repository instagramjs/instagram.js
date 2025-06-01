import { flows2OpenAPI } from "@instagramjs/flows2openapi";
import fs from "fs";
import { type OpenAPI3 } from "openapi-typescript";
import yaml from "yaml";

const JSON_DUMP_FILE = "jsondump.out";
const OPENAPI_FILE = "schema.yaml";
const API_PREFIX = "https://graph.instagram.com";

async function main() {
  try {
    await fs.promises.access(JSON_DUMP_FILE, fs.constants.F_OK);
  } catch {
    console.error(`File ${JSON_DUMP_FILE} does not exist`);
    process.exit(1);
  }
  const jsonDump = await fs.promises.readFile(JSON_DUMP_FILE, "utf-8");

  let existingDef: OpenAPI3 | null = null;
  try {
    existingDef = yaml.parse(await fs.promises.readFile(OPENAPI_FILE, "utf-8"));
  } catch {
    // ignore
  }

  const schema = await flows2OpenAPI(jsonDump, existingDef, {
    apiPrefix: API_PREFIX,

    filterExample: ({ request }) => request.path.includes("login"),
    filterResponse: ({ request }) => !request.path.includes("bloks"),
  });

  await fs.promises.writeFile(OPENAPI_FILE, yaml.stringify(schema));
}

main();
