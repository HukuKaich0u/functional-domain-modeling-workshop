import { z } from "zod";

import { schemaResult } from "../shared/schemaResult.js";
import { Sensitive } from "../shared/sensitive.js";

/** 緊急帰還の理由。規程第6条により必須 */
const EmergencyReasonBrand = Symbol();
const EmergencyReasonSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .brand<typeof EmergencyReasonBrand>()
  .transform(Sensitive.of);

export type EmergencyReason = z.infer<typeof EmergencyReasonSchema>;

export const EmergencyReason = {
  schema: EmergencyReasonSchema,
  parse: schemaResult(EmergencyReasonSchema),
} as const;
