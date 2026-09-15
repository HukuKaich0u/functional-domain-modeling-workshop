import { z } from "zod";

import { schemaResult } from "../shared/schemaResult.js";

const EquipmentCheckIdBrand = Symbol();
const EquipmentCheckIdSchema = z.string().uuid().brand<typeof EquipmentCheckIdBrand>();

export type EquipmentCheckId = z.infer<typeof EquipmentCheckIdSchema>;

export const EquipmentCheckId = {
  schema: EquipmentCheckIdSchema,
  parse: schemaResult(EquipmentCheckIdSchema),
} as const;
