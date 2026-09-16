import { ResultAsync, type Result } from "neverthrow";

import type { EventContext } from "../domain/aggregate/eventContext.js";
import type { SegmentId } from "../domain/lockout/index.js";
import type {
  Approved,
  Approver,
  EquipmentChecks,
  EvaPermit as EvaPermitState,
  PermitId,
} from "../domain/permit/index.js";
import { approve, EvaPermit } from "../domain/permit/index.js";
import type {
  Dependencies,
  EffectsDependencies,
  EventContextDependencies,
} from "./dependencies.js";
import {
  ensureDaytime,
  ensureExposureWithinLimit,
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

export type ApproveEvaWithEffectsInput = Omit<
  ApproveEvaInput,
  "approvedAt" | "lunarDay"
>;

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
      .andThen((permit) => ensureExposureWithinLimit(permit, deps.exposures))
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

export const createEventContext = (
  deps: EventContextDependencies,
): EventContext => ({
  eventId: deps.eventIdGenerator.generate(),
  occurredAt: deps.clock.now(),
  lunarDay: deps.clock.lunarDay(),
});

export const approveEvaWithEffects =
  (deps: EffectsDependencies) =>
  (
    input: ApproveEvaWithEffectsInput,
  ): ResultAsync<Approved, ApproveEvaWithEffectsError> => {
    // 時刻と記録IDは1回の実行で一度だけ生成し、判定と記録の両方に同じ値を使う。
    const context = createEventContext(deps);

    return ResultAsync.fromSafePromise<EvaPermitState | undefined>(
      Promise.resolve().then(() => deps.resolver.resolveById(input.permitId)),
    )
      .andThen((permit) => ensurePermitFound(permit, input.permitId))
      .andThen(ensureRequested)
      .andThen((permit) => ensureDaytime(permit, context.lunarDay))
      .andThen((permit) =>
        ensureNoFlareAlert(permit, deps.spaceWeather.currentAlert()),
      )
      .andThen((permit) => ensureOxygen(permit, input.equipmentChecks))
      .andThen((permit) => ensureExposureWithinLimit(permit, deps.exposures))
      .map((permit) =>
        EvaPermit.approve(context)(permit, {
          segmentId: input.segmentId,
          equipmentChecks: input.equipmentChecks,
          approvedBy: input.approvedBy,
        }),
      )
      .andThrough((event) => deps.store.store(event))
      .map((event) => event.aggregateState);
  };
