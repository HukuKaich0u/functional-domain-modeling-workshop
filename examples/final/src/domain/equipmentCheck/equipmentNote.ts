import { z } from "zod";

import { schemaResult } from "../shared/schemaResult.js";
import { Sensitive } from "../shared/sensitive.js";

/** 点検所見。スーツの不具合など、共有ログには出さない自由記述 */
const EquipmentNoteBrand = Symbol();
const EquipmentNoteSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_000)
  .brand<typeof EquipmentNoteBrand>()
  .transform(Sensitive.of);

export type EquipmentNote = z.infer<typeof EquipmentNoteSchema>;

export const EquipmentNote = {
  schema: EquipmentNoteSchema,
  parse: schemaResult(EquipmentNoteSchema),
} as const;
