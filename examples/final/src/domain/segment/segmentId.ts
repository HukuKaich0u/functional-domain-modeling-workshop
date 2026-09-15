import { z } from "zod";

import { schemaResult } from "../shared/schemaResult.js";

/** 系統区間。母線からパネル区画までの給電単位。作業区画と同じ書式で書く */
const SegmentIdSchema = z.string().regex(/^PV-\d{2}$/).brand<"SegmentId">();

export type SegmentId = z.infer<typeof SegmentIdSchema>;

export const SegmentId = {
  schema: SegmentIdSchema,
  parse: schemaResult(SegmentIdSchema),
} as const;
