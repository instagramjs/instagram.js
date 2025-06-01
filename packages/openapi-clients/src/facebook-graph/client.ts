import createClient from "openapi-fetch";

import { type paths } from "./schema";

export function createFacebookGraphOpenAPIClient() {
  return createClient<paths>({
    baseUrl: "https://graph.facebook.com",
  });
}
