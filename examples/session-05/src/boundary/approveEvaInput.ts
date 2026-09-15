import type { SegmentId } from "../domain/lockout/index.js";
import type {
  Approver,
  EquipmentChecks,
  PermitId,
} from "../domain/permit/index.js";
import { ok, type Result } from "../shared/schemaResult.js";

export type ApproveEvaInput = Readonly<{
  permitId: PermitId;
  segmentId: SegmentId;
  equipmentChecks: EquipmentChecks;
  approvedBy: Approver;
}>;

export const ApproveEvaInput = {
  parse: (raw: any): Result<ApproveEvaInput> =>
    ok({
      permitId: raw.permitId,
      segmentId: raw.segmentId,
      equipmentChecks: raw.equipmentChecks,
      approvedBy: raw.approvedBy,
    }),
} as const;
