import { err, ok, type Result } from "neverthrow";

import { EventId } from "../domain/aggregate/eventId.js";
import type { SegmentId } from "../domain/lockout/index.js";
import type {
  Approved,
  Approver,
  EquipmentChecks,
  EvaApproved,
  PermitId,
} from "../domain/permit/index.js";
import { approve } from "../domain/permit/index.js";
import type { Dependencies, EffectsDependencies } from "./dependencies.js";
import {
  ensureDaytime,
  ensureDoseWithinLimit,
  ensureNoFlareAlert,
  ensureOxygen,
  ensurePermitFound,
  ensureRequested,
  type ApproveEvaError,
  type ApproveEvaWithEffectsError,
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
  (input: ApproveEvaInput): Result<Approved, ApproveEvaError> =>
    ensurePermitFound(deps.resolver.resolveById(input.permitId), input.permitId)
      .andThen(ensureRequested)
      .andThen((permit) => ensureDaytime(permit, input.lunarDay))
      .andThen((permit) =>
        ensureNoFlareAlert(permit, deps.spaceWeather.currentAlert()),
      )
      .andThen((permit) => ensureOxygen(permit, input.equipmentChecks))
      .andThen((permit) => ensureDoseWithinLimit(permit, deps.doses))
      .map((permit) =>
        approve(
          permit,
          {
            segmentId: input.segmentId,
            equipmentChecks: input.equipmentChecks,
            approvedBy: input.approvedBy,
          },
          input.approvedAt,
        ),
      )
      .map((approved) => {
        deps.store.save(approved);
        return approved;
      });

export type ApproveEvaWithEffectsInput = Omit<
  ApproveEvaInput,
  "approvedAt" | "lunarDay"
>;

export const approveEvaWithEffects =
  (deps: EffectsDependencies) =>
  async (
    input: ApproveEvaWithEffectsInput,
  ): Promise<Result<void, ApproveEvaWithEffectsError>> => {
    const occurredAt = new Date().toISOString();
    // 旧システムは月面日を記録しておらず、承認判定では暫定的に第1日として扱う。
    const lunarDay = 1;
    const result = approveEva({
      resolver: deps.resolver,
      doses: deps.doses,
      spaceWeather: deps.spaceWeather,
      store: { save: () => undefined },
    })({ ...input, approvedAt: occurredAt, lunarDay });

    if (result.isErr()) {
      return err(result.error);
    }

    const event = {
      kind: "EvaApproved",
      eventId: EventId.parse(crypto.randomUUID()),
      occurredAt,
      lunarDay,
      permitId: result.value.permitId,
      aggregateState: result.value,
    } as const satisfies EvaApproved;

    await deps.stateStore.save(event.aggregateState);
    await deps.workLog.append(event);
    return ok(undefined);
  };
