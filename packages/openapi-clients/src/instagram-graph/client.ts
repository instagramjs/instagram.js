import createClient, { type ClientOptions } from "openapi-fetch";

import { axiosFetch } from "~/axios-fetch";

import { INSTAGRAM_GRAPH_API_BASE_URL } from "./const";
import { type paths } from "./schema";

export function createInstagramGraphFetchClient(options?: ClientOptions) {
  return createClient<paths>({
    baseUrl: INSTAGRAM_GRAPH_API_BASE_URL,
    fetch: axiosFetch,
    ...options,
  });
}

export type InstagramGraphFetchClient = ReturnType<
  typeof createInstagramGraphFetchClient
>;
