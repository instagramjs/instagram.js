import { OpenApiAxios } from "@instagramjs/openapi-axios";
import axios, { type CreateAxiosDefaults } from "axios";

import { INSTAGRAM_API_BASE_URL } from "./const";
import { type paths } from "./schema";

export function createInstagramOpenAPIAxiosClient(
  options?: CreateAxiosDefaults,
) {
  return new OpenApiAxios<paths, "fetch">(
    axios.create({
      baseURL: INSTAGRAM_API_BASE_URL,
      ...options,
    }),
    { validStatus: "fetch" },
  );
}
