import createClient, { type ClientOptions } from "openapi-fetch";

import { axiosFetch } from "~/axios-fetch";

import { INSTAGRAM_API_BASE_URL } from "./const";
import { type paths } from "./schema";

export function createInstagramFetchClient(options?: ClientOptions) {
  return createClient<paths>({
    baseUrl: INSTAGRAM_API_BASE_URL,
    fetch: axiosFetch,
    ...options,
  });
}

export type InstagramFetchClient = ReturnType<
  typeof createInstagramFetchClient
>;
