import { exportedApiStateSchema } from "@igjs/api";
import { z } from "zod";

export const exportedClientStateSchema = exportedApiStateSchema.extend({
  irisData: z
    .object({
      seq_id: z.number(),
      snapshot_at_ms: z.number(),
    })
    .optional(),
});
export type ExportedClientState = z.infer<typeof exportedClientStateSchema>;
