import type { SegmentId } from "../domain/lockout/index.js";
import type {
  Approved,
  Approver,
  EquipmentChecks,
  PermitId,
} from "../domain/permit/index.js";
import { approve } from "../domain/permit/index.js";
import type { Dependencies } from "./dependencies.js";
import {
  ensureDaytime,
  ensureDoseWithinLimit,
  ensureNoFlareAlert,
  ensureOxygen,
  ensurePermitFound,
  ensureRequested,
} from "./errors.js";

export type ApproveEvaInput = Readonly<{
  permitId: PermitId;
  segmentId: SegmentId;
  equipmentChecks: EquipmentChecks;
  approvedBy: Approver;
  approvedAt: string;
  lunarDay: number;
}>;

export const approveEva =
  (deps: Dependencies) =>
  (input: ApproveEvaInput): Approved => {
    const permit = ensurePermitFound(
      deps.resolver.resolveById(input.permitId),
      input.permitId,
    );
    const requested = ensureRequested(permit);

    const daytime = ensureDaytime(requested, input.lunarDay);
    if (daytime.isErr()) {
      throw new Error(`Approval blocked: night on lunar day ${daytime.error.lunarDay}`);
    }
    const clear = ensureNoFlareAlert(requested, deps.spaceWeather.currentAlert());
    if (clear.isErr()) {
      throw new Error("Approval blocked: flare alert is active");
    }
    const oxygen = ensureOxygen(requested, input.equipmentChecks);
    if (oxygen.isErr()) {
      throw new Error(`Approval blocked: oxygen too low for ${oxygen.error.workerId}`);
    }
    const dose = ensureDoseWithinLimit(requested, deps.doses);
    if (dose.isErr()) {
      throw new Error(`Approval blocked: dose limit exceeded for ${dose.error.workerId}`);
    }

    const next = approve(
      requested,
      {
        segmentId: input.segmentId,
        equipmentChecks: input.equipmentChecks,
        approvedBy: input.approvedBy,
      },
      input.approvedAt,
    );

    deps.store.save(next);
    return next;
  };
