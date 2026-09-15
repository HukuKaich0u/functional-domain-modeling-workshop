import { z } from "zod";

import { schemaResult } from "../shared/schemaResult.js";

/** 隊員番号。`W-03` の形。個人名は持たない */
const WorkerIdSchema = z.string().regex(/^W-\d{2}$/).brand<"WorkerId">();

export type WorkerId = z.infer<typeof WorkerIdSchema>;

export const WorkerId = {
  schema: WorkerIdSchema,
  parse: schemaResult(WorkerIdSchema),
} as const;
