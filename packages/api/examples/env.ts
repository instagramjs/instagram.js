import { createEnv } from "@t3-oss/env-core";
import dotenv from "dotenv";
import path from "path";
import { z } from "zod";

dotenv.config({
  path: path.join(import.meta.dirname, ".env"),
});
export const env = createEnv({
  server: {
    USERNAME: z.string(),
    PASSWORD: z.string(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
