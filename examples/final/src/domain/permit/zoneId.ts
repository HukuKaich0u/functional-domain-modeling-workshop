import { z } from "zod";

import { schemaResult } from "../shared/schemaResult.js";

/** 作業区画。系統区間と同じ書式だが用途で区別する */
const ZoneIdSchema = z.string().regex(/^PV-\d{2}$/).brand<"ZoneId">();

export type ZoneId = z.infer<typeof ZoneIdSchema>;

export const ZoneId = {
  schema: ZoneIdSchema,
  parse: schemaResult(ZoneIdSchema),
} as const;
