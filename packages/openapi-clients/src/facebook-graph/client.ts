import createClient, { type ClientOptions } from "openapi-fetch";

import { axiosFetch } from "~/axios-fetch";

import { FACEBOOK_GRAPH_API_BASE_URL } from "./const";
import { type paths } from "./schema";

export function createFacebookGraphFetchClient(options?: ClientOptions) {
  return createClient<paths>({
    baseUrl: FACEBOOK_GRAPH_API_BASE_URL,
    fetch: axiosFetch,
    ...options,
  });
}

export type FacebookGraphFetchClient = ReturnType<
  typeof createFacebookGraphFetchClient
>;
