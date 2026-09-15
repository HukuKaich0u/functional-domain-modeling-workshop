import { z } from "zod";

import { SegmentId } from "../domain/lockout/index.js";
import { PermitId } from "../domain/permit/index.js";
import { EquipmentCheck } from "../domain/worker/index.js";
import { schemaResult } from "../shared/schemaResult.js";

const schema = z
  .object({
    permitId: PermitId.schema,
    segmentId: SegmentId.schema,
    equipmentChecks: z
      .tuple([EquipmentCheck.schema, EquipmentCheck.schema])
      .readonly(),
    approvedBy: z.enum(["base-commander", "ground-control"]),
  })
  .readonly();

export type ApproveEvaInput = z.infer<typeof schema>;

export const ApproveEvaInput = {
  schema,
  parse: schemaResult(schema),
} as const;
