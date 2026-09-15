import { z } from "zod";

import { schemaResult } from "../shared/schemaResult.js";

/** 遮断盤に表示する区間の名前。`PV-07 給電区間` など */
const SegmentLabelSchema = z.string().trim().min(1).max(100).brand<"SegmentLabel">();

export type SegmentLabel = z.infer<typeof SegmentLabelSchema>;

export const SegmentLabel = {
  schema: SegmentLabelSchema,
  parse: schemaResult(SegmentLabelSchema),
} as const;
