import createClient from "openapi-fetch";

import { type paths } from "./schema";

export function createMobileApiClient() {
  return createClient<paths>({
    baseUrl: "https://api.instagram.com/v1",
  });
}
