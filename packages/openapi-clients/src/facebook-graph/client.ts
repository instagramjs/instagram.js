import { OpenApiAxios } from "@instagramjs/openapi-axios";
import axios, { type CreateAxiosDefaults } from "axios";

import { FACEBOOK_GRAPH_API_BASE_URL } from "./const";
import { type paths } from "./schema";

export function createFacebookGraphOpenAPIAxiosClient(
  options: CreateAxiosDefaults,
) {
  return new OpenApiAxios<paths, "fetch">(
    axios.create({
      baseURL: FACEBOOK_GRAPH_API_BASE_URL,
      ...options,
    }),
    { validStatus: "fetch" },
  );
}
