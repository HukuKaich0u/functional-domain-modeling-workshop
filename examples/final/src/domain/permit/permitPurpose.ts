import { z } from "zod";

import { schemaResult } from "../shared/schemaResult.js";
import { Sensitive } from "../shared/sensitive.js";

/** 作業内容。共有ログには出さない自由記述 */
const PermitPurposeBrand = Symbol();
const PermitPurposeSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .brand<typeof PermitPurposeBrand>()
  .transform(Sensitive.of);

export type PermitPurpose = z.infer<typeof PermitPurposeSchema>;

export const PermitPurpose = {
  schema: PermitPurposeSchema,
  parse: schemaResult(PermitPurposeSchema),
} as const;
