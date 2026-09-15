import { err, ok, type Result, type ResultAsync as UseResultAsync } from "neverthrow";

import type { Clock } from "../domain/aggregate/clock.js";
import type { EventIdGenerator } from "../domain/aggregate/eventIdGenerator.js";
import type { PermitByIdResolver, PermitId, Requested } from "../domain/permit/index.js";
import { Segment } from "../domain/segment/index.js";
import type {
  EnergizedSegment,
  LockedOutSegment,
  LockoutTaggedStore,
  Segment as SegmentState,
  SegmentByIdResolver,
  SegmentConflict,
  SegmentId,
} from "../domain/segment/index.js";
import type { UserId } from "../domain/user/userId.js";
import type { UserByIdResolver } from "../domain/user/userResolver.js";
import { ensureCanManageLockout } from "./authorization.js";
import {
  ensurePermitFound,
  ensureRequested,
  ensureSegmentFound,
  ensureUserFound,
  type IdentityGenerationFailed,
  type InvalidPermitState,
  type PermitNotFound,
  type SegmentNotFound,
  type UnauthorizedError,
} from "./errors.js";
import { createEvent, createEventContext } from "./eventContext.js";

export type UseCaseInput = Readonly<{
  actorUserId: UserId;
  segmentId: SegmentId;
  permitId: PermitId;
}>;
export type UseCaseOk = Readonly<{ segment: LockedOutSegment }>;
export type SegmentAlreadyLockedOut = Readonly<{
  kind: "SegmentAlreadyLockedOut";
  segmentId: SegmentId;
  permitId: PermitId;
}>;
/** 作業区画 PV-07 の許可に、別の系統区間の札を掛けようとした（事故報告 第3号） */
export type ZoneSegmentMismatch = Readonly<{
  kind: "ZoneSegmentMismatch";
  permitId: PermitId;
  zoneId: string;
  segmentId: SegmentId;
}>;
export type UseCaseError =
  | UnauthorizedError
  | SegmentNotFound
  | SegmentAlreadyLockedOut
  | PermitNotFound
  | InvalidPermitState<"Requested">
  | ZoneSegmentMismatch
  | SegmentConflict
  | IdentityGenerationFailed;
export type UseCaseOutput = UseResultAsync<UseCaseOk, UseCaseError>;
export type Dependencies = Readonly<{
  userResolver: UserByIdResolver;
  segmentResolver: SegmentByIdResolver;
  permitResolver: PermitByIdResolver;
  lockoutTaggedStore: LockoutTaggedStore;
  clock: Clock;
  eventIdGenerator: EventIdGenerator;
}>;
export type LockOutSegmentUseCase = Readonly<{
  run: (input: UseCaseInput) => UseCaseOutput;
}>;

const ensureEnergized = (segment: SegmentState): Result<EnergizedSegment, SegmentAlreadyLockedOut> =>
  Segment.isEnergized(segment)
    ? ok(segment)
    : err({
        kind: "SegmentAlreadyLockedOut",
        segmentId: segment.segmentId,
        permitId: segment.lockout.kind === "LockedOut" ? segment.lockout.permitId : ("" as PermitId),
      });
const ensureZoneMatches =
  (segment: EnergizedSegment) =>
  (permit: Requested): Result<Requested, ZoneSegmentMismatch> =>
    (permit.zoneId as string) === (segment.segmentId as string)
      ? ok(permit)
      : err({
          kind: "ZoneSegmentMismatch",
          permitId: permit.permitId,
          zoneId: permit.zoneId,
          segmentId: segment.segmentId,
        });

const run =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): UseCaseOutput =>
    dependencies.userResolver
      .resolveById(input.actorUserId)
      .andThen(ensureUserFound(input.actorUserId))
      .andThen(ensureCanManageLockout)
      .andThen(() => dependencies.segmentResolver.resolveById(input.segmentId))
      .andThen(ensureSegmentFound(input.segmentId))
      .andThen(ensureEnergized)
      .andThen((segment) =>
        dependencies.permitResolver
          .resolveById(input.permitId)
          .andThen(ensurePermitFound(input.permitId))
          .andThen(ensureRequested)
          .andThen(ensureZoneMatches(segment))
          .map(() => segment),
      )
      .andThen((segment) =>
        createEvent(() =>
          Segment.tagLockout(createEventContext(dependencies, input.actorUserId))(
            segment,
            input.permitId,
          ),
        ),
      )
      .andThrough((event) => dependencies.lockoutTaggedStore.store(event))
      .map((event) => ({ segment: event.aggregateState }));

export const LockOutSegmentUseCase = {
  create: (dependencies: Dependencies): LockOutSegmentUseCase => ({
    run: run(dependencies),
  }),
} as const;
