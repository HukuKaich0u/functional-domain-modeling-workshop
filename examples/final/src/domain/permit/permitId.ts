import { z } from "zod";

import { schemaResult } from "../shared/schemaResult.js";

/** 作業許可番号。`EVA-0412` の形 */
const PermitIdSchema = z.string().regex(/^EVA-\d{4}$/).brand<"PermitId">();

export type PermitId = z.infer<typeof PermitIdSchema>;

export const PermitId = {
  schema: PermitIdSchema,
  parse: schemaResult(PermitIdSchema),
} as const;
