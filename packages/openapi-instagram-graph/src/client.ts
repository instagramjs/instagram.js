import createClient from "openapi-fetch";

import { type paths } from "./schema";

export function createInstagramGraphOpenAPIClient() {
  return createClient<paths>({
    baseUrl: "https://graph.instagram.com",
  });
}
