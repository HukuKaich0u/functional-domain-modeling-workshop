import { z } from "zod";

import { schemaResult } from "../shared/schemaResult.js";
import { Sensitive } from "../shared/sensitive.js";

/** 中止理由。規程第6条により必須 */
const AbortReasonBrand = Symbol();
const AbortReasonSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .brand<typeof AbortReasonBrand>()
  .transform(Sensitive.of);

export type AbortReason = z.infer<typeof AbortReasonSchema>;

export const AbortReason = {
  schema: AbortReasonSchema,
  parse: schemaResult(AbortReasonSchema),
} as const;
