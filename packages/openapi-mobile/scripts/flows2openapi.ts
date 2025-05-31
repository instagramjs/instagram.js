import { flows2OpenAPI } from "@instagramjs/flows2openapi";
import fs from "fs";
import yaml from "yaml";

const JSON_DUMP_FILE = "jsondump.out";
const OPENAPI_FILE = "schema.yaml";
const API_PREFIX = "https://i.instagram.com/api";

async function main() {
  try {
    await fs.promises.access(JSON_DUMP_FILE, fs.constants.F_OK);
  } catch {
    console.error(`File ${JSON_DUMP_FILE} does not exist`);
    process.exit(1);
  }
  const jsonDump = await fs.promises.readFile(JSON_DUMP_FILE, "utf-8");

  const schema = await flows2OpenAPI(jsonDump, {
    apiPrefix: API_PREFIX,

    filterExample: () => false,
  });

  await fs.promises.writeFile(OPENAPI_FILE, yaml.stringify(schema));
}

main();
