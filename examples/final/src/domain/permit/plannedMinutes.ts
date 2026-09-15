import { z } from "zod";

import { schemaResult } from "../shared/schemaResult.js";

/** 予定作業時間（分）。スーツの酸素の都合で8時間を上限にする */
const PlannedMinutesSchema = z.number().int().min(1).max(480).brand<"PlannedMinutes">();

export type PlannedMinutes = z.infer<typeof PlannedMinutesSchema>;

export const PlannedMinutes = {
  schema: PlannedMinutesSchema,
  parse: schemaResult(PlannedMinutesSchema),
} as const;
