import { z } from "zod";

import { WorkerId } from "./workerId.js";

const schema = z
  .object({
    workerId: WorkerId.schema,
    oxygenMinutes: z.number().int().nonnegative(),
    checkedAt: z.string().min(1),
  })
  .readonly();

export type EquipmentCheck = z.infer<typeof schema>;
export const EquipmentCheck = { schema, parse: schema.parse } as const;

export const OXYGEN_RESERVE_MINUTES = 60;

export const hasEnoughOxygen = (
  check: EquipmentCheck,
  plannedMinutes: number,
): boolean => check.oxygenMinutes >= plannedMinutes + OXYGEN_RESERVE_MINUTES;
