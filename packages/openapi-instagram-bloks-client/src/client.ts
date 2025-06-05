import createClient, { type ClientOptions } from "openapi-fetch";

import { axiosFetch } from "~/axios-fetch";

import { INSTAGRAM_BLOKS_API_BASE_URL } from "./const";
import { type paths } from "./schema";

export function createInstagramBloksFetchClient(options?: ClientOptions) {
  return createClient<paths>({
    baseUrl: INSTAGRAM_BLOKS_API_BASE_URL,
    fetch: axiosFetch,
    ...options,
  });
}

export type InstagramBloksFetchClient = ReturnType<
  typeof createInstagramBloksFetchClient
>;
