import {
  type components as FacebookGraphOpenAPIComponents,
  type paths as FacebookGraphOpenAPIPaths,
} from "./facebook-graph/schema";
import {
  type components as InstagramOpenAPIComponents,
  type paths as InstagramOpenAPIPaths,
} from "./instagram/schema";
import {
  type components as InstagramGraphOpenAPIComponents,
  type paths as InstagramGraphOpenAPIPaths,
} from "./instagram-graph/schema";

export type {
  FacebookGraphOpenAPIComponents,
  FacebookGraphOpenAPIPaths,
  InstagramGraphOpenAPIComponents,
  InstagramGraphOpenAPIPaths,
  InstagramOpenAPIComponents,
  InstagramOpenAPIPaths,
};
export * from "./facebook-graph/client";
export * from "./instagram/client";
export * from "./instagram-graph/client";
