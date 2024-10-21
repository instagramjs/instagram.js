import { z } from "zod";

export const apiStateSchema = z.object({
  wwwClaim: z.string().nullable(),
  mid: z.string().nullable(),
  directRegionalHint: z.string().nullable(),
  auth: z
    .object({
      token: z.string(),
      userId: z.string(),
      sessionId: z.string(),
      shouldUserHeaderOverCookie: z.string().optional(),
    })
    .nullable(),
  passwordEncryption: z
    .object({
      pubKey: z.string(),
      keyId: z.string(),
    })
    .nullable(),
  device: z.object({
    deviceString: z.string(),
    uuid: z.string(),
    phoneId: z.string(),
    adId: z.string(),
    build: z.string(),
    deviceId: z.string(),
  }),
});
export type ApiState = z.infer<typeof apiStateSchema>;

export const exportedApiStateSchema = apiStateSchema.extend({
  cookieJar: z.record(z.string(), z.any()).optional(),
});
export type ExportedApiState = z.infer<typeof exportedApiStateSchema>;
