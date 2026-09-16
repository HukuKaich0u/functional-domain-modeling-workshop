import { err, ok, safeTry, type Result, type ResultAsync } from "neverthrow";

import type { Clock } from "../domain/aggregate/clock.js";
import type { EventIdGenerator } from "../domain/aggregate/eventIdGenerator.js";
import { LunarDay } from "../domain/aggregate/lunarDay.js";
import { hasEnoughOxygen } from "../domain/equipmentCheck/index.js";
import type {
  EquipmentCheck,
  EquipmentCheckByPermitIdResolver,
} from "../domain/equipmentCheck/index.js";
import { EvaPermit } from "../domain/permit/index.js";
import type {
  Approved,
  EvaApproved,
  EvaApprovedStore,
  PermitByIdResolver,
  PermitConflict,
  PermitId,
  Requested,
} from "../domain/permit/index.js";
import { Segment } from "../domain/segment/index.js";
import type {
  LockedOutSegment,
  Segment as SegmentState,
  SegmentByIdResolver,
  SegmentId,
} from "../domain/segment/index.js";
import { toFlareAlert } from "../domain/spaceWeather/index.js";
import type {
  CurrentSpaceWeatherResolver,
  FlareAlertLevel,
  SpaceWeatherReport,
} from "../domain/spaceWeather/index.js";
import type { UserId } from "../domain/user/userId.js";
import type { UserByIdResolver } from "../domain/user/userResolver.js";
import { isExposureWithinLimit } from "../domain/worker/index.js";
import type { Worker, WorkerByIdResolver, WorkerId } from "../domain/worker/index.js";
import { ensureCanApproveEva } from "./authorization.js";
import {
  ensurePermitFound,
  ensureRequested,
  ensureSegmentFound,
  ensureUserFound,
  ensureWorkerFound,
  type IdentityGenerationFailed,
  type InvalidPermitState,
  type PermitNotFound,
  type SegmentNotFound,
  type UnauthorizedError,
  type WorkerNotFound,
} from "./errors.js";
import { createEvent, createEventContext } from "./eventContext.js";

export type UseCaseInput = Readonly<{
  actorUserId: UserId;
  permitId: PermitId;
}>;
export type UseCaseOk = Readonly<{ permit: Approved }>;

/** 規程第2条・第10条の7条件に対応する失敗 */
export type EquipmentCheckMissing = Readonly<{
  kind: "EquipmentCheckMissing";
  permitId: PermitId;
  workerId: WorkerId;
}>;
export type InsufficientOxygen = Readonly<{
  kind: "InsufficientOxygen";
  permitId: PermitId;
  workerId: WorkerId;
}>;
export type ExposureLimitExceeded = Readonly<{
  kind: "ExposureLimitExceeded";
  permitId: PermitId;
  workerId: WorkerId;
}>;
export type SpaceWeatherUnknown = Readonly<{ kind: "SpaceWeatherUnknown"; permitId: PermitId }>;
export type FlareAlertActive = Readonly<{
  kind: "FlareAlertActive";
  permitId: PermitId;
  level: Exclude<FlareAlertLevel, "none">;
}>;
export type BuddyMissing = Readonly<{ kind: "BuddyMissing"; permitId: PermitId; workerId: WorkerId }>;
export type SegmentNotLockedOut = Readonly<{
  kind: "SegmentNotLockedOut";
  permitId: PermitId;
  segmentId: SegmentId;
}>;
export type LockoutForAnotherPermit = Readonly<{
  kind: "LockoutForAnotherPermit";
  permitId: PermitId;
  segmentId: SegmentId;
  lockedOutPermitId: PermitId;
}>;
export type NightTime = Readonly<{ kind: "NightTime"; permitId: PermitId; lunarDay: LunarDay }>;

export type UseCaseError =
  | UnauthorizedError
  | PermitNotFound
  | InvalidPermitState<"Requested">
  | EquipmentCheckMissing
  | InsufficientOxygen
  | WorkerNotFound
  | ExposureLimitExceeded
  | SpaceWeatherUnknown
  | FlareAlertActive
  | BuddyMissing
  | SegmentNotFound
  | SegmentNotLockedOut
  | LockoutForAnotherPermit
  | NightTime
  | PermitConflict
  | IdentityGenerationFailed;
export type UseCaseOutput = ResultAsync<UseCaseOk, UseCaseError>;

export type Dependencies = Readonly<{
  userResolver: UserByIdResolver;
  permitResolver: PermitByIdResolver;
  equipmentCheckResolver: EquipmentCheckByPermitIdResolver;
  workerResolver: WorkerByIdResolver;
  spaceWeatherResolver: CurrentSpaceWeatherResolver;
  segmentResolver: SegmentByIdResolver;
  evaApprovedStore: EvaApprovedStore;
  clock: Clock;
  eventIdGenerator: EventIdGenerator;
  /** 規程第2条。基地長が船外にいる間だけ地上管制が開始承認を代行できる */
  baseCommanderIsOutside: () => boolean;
}>;

export type ApproveEvaUseCase = Readonly<{
  run: (input: UseCaseInput) => UseCaseOutput;
}>;

/** 1. 2名分の装備点検が記録済み */
const ensureEquipmentChecked =
  (permit: Requested, checks: readonly EquipmentCheck[]) =>
  (workerId: WorkerId): Result<EquipmentCheck, EquipmentCheckMissing> => {
    const check = checks.find((candidate) => candidate.workerId === workerId);
    return check === undefined
      ? err({ kind: "EquipmentCheckMissing", permitId: permit.permitId, workerId })
      : ok(check);
  };
/** 2. 酸素残時間が予定作業時間と予備60分の合計以上 */
const ensureOxygen =
  (permit: Requested) =>
  (check: EquipmentCheck): Result<EquipmentCheck, InsufficientOxygen> =>
    hasEnoughOxygen(check, permit.plannedMinutes)
      ? ok(check)
      : err({ kind: "InsufficientOxygen", permitId: permit.permitId, workerId: check.workerId });
/** 3. 作業後の被ばく量が安全上限以内。医務の値はここでだけ unwrap される */
const ensureExposure =
  (permit: Requested) =>
  (worker: Worker): Result<Worker, ExposureLimitExceeded> =>
    isExposureWithinLimit(worker.radiationExposureMicroSv, permit.plannedMinutes)
      ? ok(worker)
      : err({ kind: "ExposureLimitExceeded", permitId: permit.permitId, workerId: worker.workerId });
/** 4. フレア警報が出ていない。報告がなければ承認しない */
const ensureNoFlareAlert =
  (permit: Requested) =>
  (weather: SpaceWeatherReport | undefined): Result<SpaceWeatherReport, SpaceWeatherUnknown | FlareAlertActive> => {
    if (weather === undefined) return err({ kind: "SpaceWeatherUnknown", permitId: permit.permitId });
    const alert = toFlareAlert(weather);
    return alert.kind === "Clear"
      ? ok(weather)
      : err({ kind: "FlareAlertActive", permitId: permit.permitId, level: alert.level });
  };
/** 5. 相方が同じ許可に登録されている */
const ensureBuddy = (permit: Requested): Result<Requested, BuddyMissing> =>
  permit.crew[0] === permit.crew[1]
    ? err({ kind: "BuddyMissing", permitId: permit.permitId, workerId: permit.crew[0] })
    : ok(permit);
/** 6. 作業区画に対応する系統区間に、この許可の遮断札が掛かっている */
const ensureLockedOutForPermit =
  (permit: Requested) =>
  (segment: SegmentState): Result<LockedOutSegment, SegmentNotLockedOut | LockoutForAnotherPermit> => {
    if (!Segment.isLockedOut(segment)) {
      return err({ kind: "SegmentNotLockedOut", permitId: permit.permitId, segmentId: segment.segmentId });
    }
    return segment.lockout.permitId === permit.permitId
      ? ok(segment)
      : err({
          kind: "LockoutForAnotherPermit",
          permitId: permit.permitId,
          segmentId: segment.segmentId,
          lockedOutPermitId: segment.lockout.permitId,
        });
  };
/** 7. 月面日が第14日以前 */
const ensureDaytime =
  (permit: Requested) =>
  (lunarDay: LunarDay): Result<LunarDay, NightTime> =>
    LunarDay.isDaytime(lunarDay)
      ? ok(lunarDay)
      : err({ kind: "NightTime", permitId: permit.permitId, lunarDay });

/** 教材の簡略化。作業区画 PV-07 へ給電する系統区間は PV-07 */
const segmentIdForZone = (permit: Requested): SegmentId => permit.zoneId as string as SegmentId;

const validateApproval =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): ResultAsync<EvaApproved, UseCaseError> =>
    safeTry<EvaApproved, UseCaseError>(async function* () {
      const resolvedActor = yield* dependencies.userResolver.resolveById(input.actorUserId);
      const actor = yield* ensureUserFound(input.actorUserId)(resolvedActor);
      yield* ensureCanApproveEva(actor, dependencies.baseCommanderIsOutside());

      const resolvedPermit = yield* dependencies.permitResolver.resolveById(input.permitId);
      const found = yield* ensurePermitFound(input.permitId)(resolvedPermit);
      const permit = yield* ensureRequested(found);
      yield* ensureBuddy(permit);

      const checks = yield* dependencies.equipmentCheckResolver.resolveByPermitId(permit.permitId);
      for (const workerId of permit.crew) {
        const check = yield* ensureEquipmentChecked(permit, checks)(workerId);
        yield* ensureOxygen(permit)(check);
        const resolvedWorker = yield* dependencies.workerResolver.resolveById(workerId);
        const worker = yield* ensureWorkerFound(workerId)(resolvedWorker);
        yield* ensureExposure(permit)(worker);
      }

      const weather = yield* dependencies.spaceWeatherResolver.resolveCurrent();
      yield* ensureNoFlareAlert(permit)(weather);

      const segmentId = segmentIdForZone(permit);
      const resolvedSegment = yield* dependencies.segmentResolver.resolveById(segmentId);
      const segment = yield* ensureSegmentFound(segmentId)(resolvedSegment);
      const lockedOut = yield* ensureLockedOutForPermit(permit)(segment);

      const lunarDay = dependencies.clock.lunarDay();
      yield* ensureDaytime(permit)(lunarDay);
      const event = yield* createEvent(() => {
        const context = createEventContext(dependencies, input.actorUserId, lunarDay);
        return EvaPermit.approve(context)(permit, { segmentId: lockedOut.segmentId });
      });
      return ok(event);
    });

/** 7条件を通った承認だけを保存し、保存の競合は PermitConflict として返す */
const run =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): UseCaseOutput =>
    validateApproval(dependencies)(input)
      .andThrough((event) => dependencies.evaApprovedStore.store(event))
      .map((event) => ({ permit: event.aggregateState }));

export const ApproveEvaUseCase = {
  create: (dependencies: Dependencies): ApproveEvaUseCase => ({
    run: run(dependencies),
  }),
} as const;
