import { z } from "zod";

import { schemaResult } from "../shared/schemaResult.js";

/** スーツの酸素で作業できる残り時間（分） */
const OxygenMinutesSchema = z.number().int().nonnegative().max(1_440).brand<"OxygenMinutes">();

export type OxygenMinutes = z.infer<typeof OxygenMinutesSchema>;

export const OxygenMinutes = {
  schema: OxygenMinutesSchema,
  parse: schemaResult(OxygenMinutesSchema),
} as const;
