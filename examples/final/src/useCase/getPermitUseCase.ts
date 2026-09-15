import { ok, safeTry, type ResultAsync } from "neverthrow";

import type { Timestamp } from "../domain/aggregate/timestamp.js";
import type {
  EquipmentCheck,
  EquipmentCheckByPermitIdResolver,
  EquipmentCheckId,
  OxygenMinutes,
} from "../domain/equipmentCheck/index.js";
import type { EvaPermit, PermitByIdResolver, PermitId } from "../domain/permit/index.js";
import type { Segment, SegmentByIdResolver, SegmentId } from "../domain/segment/index.js";
import type { UserId } from "../domain/user/userId.js";
import type { UserByIdResolver } from "../domain/user/userResolver.js";
import type { WorkerId } from "../domain/worker/index.js";
import {
  ensurePermitFound,
  ensureUserFound,
  type PermitNotFound,
  type UnauthorizedError,
} from "./errors.js";
import { toPermitView, type PermitView } from "./permitView.js";
import { toSegmentView, type SegmentView } from "./segmentView.js";

/** 点検所見は載せない。承認条件の確認に必要な値だけ */
export type EquipmentCheckView = Readonly<{
  checkId: EquipmentCheckId;
  workerId: WorkerId;
  checkedAt: Timestamp;
  oxygenMinutes: OxygenMinutes;
  needsMaintenance: boolean;
}>;
export type UseCaseInput = Readonly<{ actorUserId: UserId; permitId: PermitId }>;
export type UseCaseOk = Readonly<{
  permit: PermitView;
  equipmentChecks: readonly EquipmentCheckView[];
  /** 作業区画に対応する系統区間。未登録なら undefined */
  segment: SegmentView | undefined;
}>;
export type UseCaseError = UnauthorizedError | PermitNotFound;
export type UseCaseOutput = ResultAsync<UseCaseOk, UseCaseError>;
export type Dependencies = Readonly<{
  userResolver: UserByIdResolver;
  permitResolver: PermitByIdResolver;
  equipmentCheckResolver: EquipmentCheckByPermitIdResolver;
  segmentResolver: SegmentByIdResolver;
}>;
export type GetPermitUseCase = Readonly<{
  run: (input: UseCaseInput) => UseCaseOutput;
}>;

type Sources = Readonly<{
  permit: EvaPermit;
  checks: readonly EquipmentCheck[];
  segment: Segment | undefined;
}>;

/** 教材の簡略化。作業区画 PV-07 へ給電する系統区間は PV-07 */
export const segmentIdForZone = (permit: EvaPermit): SegmentId =>
  permit.kind === "Requested" || permit.kind === "Aborted"
    ? (permit.zoneId as string as SegmentId)
    : permit.segmentId;

export const toEquipmentCheckView = (check: EquipmentCheck): EquipmentCheckView => ({
  checkId: check.checkId,
  workerId: check.workerId,
  checkedAt: check.checkedAt,
  oxygenMinutes: check.oxygenMinutes,
  needsMaintenance: check.needsMaintenance,
});

const loadSources =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): ResultAsync<Sources, UseCaseError> =>
    safeTry<Sources, UseCaseError>(async function* () {
      const actor = yield* dependencies.userResolver.resolveById(input.actorUserId);
      yield* ensureUserFound(input.actorUserId)(actor);
      const resolved = yield* dependencies.permitResolver.resolveById(input.permitId);
      const permit = yield* ensurePermitFound(input.permitId)(resolved);
      const checks = yield* dependencies.equipmentCheckResolver.resolveByPermitId(permit.permitId);
      const segment = yield* dependencies.segmentResolver.resolveById(segmentIdForZone(permit));
      return ok({ permit, checks, segment });
    });

const run =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): UseCaseOutput =>
    loadSources(dependencies)(input).map(({ permit, checks, segment }) => ({
      permit: toPermitView(permit),
      equipmentChecks: checks.map(toEquipmentCheckView),
      segment: segment === undefined ? undefined : toSegmentView(segment),
    }));

export const GetPermitUseCase = {
  create: (dependencies: Dependencies): GetPermitUseCase => ({
    run: run(dependencies),
  }),
} as const;
