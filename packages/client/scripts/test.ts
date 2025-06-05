import { createInstagramBFetchClient } from "@instagramjs/openapi-clients";

import { InstagramBAttestationApi } from "~/api/b/attestation";
import { InstagramBZrApi } from "~/api/b/zr";
import { generateDeviceConfig } from "~/device";
import { createClientState } from "~/state";

const USERNAME = "bradennss";

async function main() {
  const clientState = createClientState();
  const deviceConfig = generateDeviceConfig(USERNAME);
  const bFetchClient = createInstagramBFetchClient();

  const bZr = new InstagramBZrApi(clientState, deviceConfig, bFetchClient);
  const bAttestation = new InstagramBAttestationApi(
    clientState,
    deviceConfig,
    bFetchClient,
  );

  console.log("b.zr.createDualTokens()", await bZr.createDualTokens());
  console.log(
    "b.attestation.createAndroidKeystore()",
    await bAttestation.createAndroidKeystore(),
  );
}

main();
