import createClient, { type ClientOptions } from "openapi-fetch";

import { axiosFetch } from "~/axios-fetch";

import { INSTAGRAM_B_API_BASE_URL } from "./const";
import { type paths } from "./schema";

export function createInstagramBFetchClient(options?: ClientOptions) {
  return createClient<paths>({
    baseUrl: INSTAGRAM_B_API_BASE_URL,
    fetch: axiosFetch,
    ...options,
  });
}

export type InstagramBFetchClient = ReturnType<
  typeof createInstagramBFetchClient
>;
