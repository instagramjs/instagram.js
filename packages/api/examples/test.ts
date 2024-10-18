import { ApiClient } from "../src";
import { setupExampleClient } from "./setup";

const client = new ApiClient();

async function main() {
  await setupExampleClient(client);

  // const inboxResponse = await client.direct.getInbox().items();
  await client.qe.syncExperiments();
  // console.log(JSON.stringify(inboxResponse, null, 2));
}

void main();
