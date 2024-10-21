import { z } from "zod";

export const apiStateSchema = z.object({
  wwwClaim: z.string().nullable(),
  mid: z.string().nullable(),
  directRegionHint: z.string().nullable(),
  shbid: z.string().nullable(),
  shbts: z.string().nullable(),
  rur: z.string().nullable(),
  auth: z
    .object({
      token: z.string(),
      userId: z.string(),
      sessionId: z.string(),
      shouldUserHeaderOverCookie: z.string().optional(),
    })
    .nullable(),
  passwordEncryptionPubKey: z.string().nullable(),
  passwordEncryptionKeyId: z.string().nullable(),
});
export type ApiState = z.infer<typeof apiStateSchema>;

export const exportedApiStateSchema = apiStateSchema.extend({
  cookieJar: z.record(z.string(), z.any()).optional(),
});
export type ExportedApiState = z.infer<typeof exportedApiStateSchema>;
