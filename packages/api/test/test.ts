import { ApiClient } from "../src";
import { env } from "./env";
import { setupPersistentState } from "./setup";

const client = new ApiClient();

async function main() {
  await setupPersistentState(client);
  if (!client.authState) {
    client.generateDevice(env.USERNAME);
    await client.qe.syncLoginExperiments();
    await client.account.login(env.USERNAME, env.PASSWORD);
  }

  const threads = await client.direct.getInbox().items();
  console.log(JSON.stringify(threads[0]?.last_permanent_item, null, 2));
}

void main();
