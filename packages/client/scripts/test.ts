import { createInstagramBFetchClient } from "@instagramjs/openapi-clients";

import zr from "~/api/zr";
import { generateDeviceConfig } from "~/device";

const USERNAME = "bradennss";

async function main() {
  const deviceConfig = generateDeviceConfig(USERNAME);

  const bFetchClient = createInstagramBFetchClient();

  const dualTokens = await zr.getDualTokens(deviceConfig, bFetchClient);

  console.log(dualTokens);
}

main();
