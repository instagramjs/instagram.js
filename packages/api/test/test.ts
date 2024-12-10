import { ApiClient } from "~/index";

import { env } from "./env";
import { setupPersistentState } from "./setup";

const client = new ApiClient();

async function main() {
  await setupPersistentState(client);
  if (!client.isAuthenticated()) {
    await client.qe.syncLoginExperiments();
    await client.account.login(env.USERNAME, env.PASSWORD);
  }

  const user = await client.user.getUser("39691585368");
  console.log(JSON.stringify(user, null, 2));
}

void main();
