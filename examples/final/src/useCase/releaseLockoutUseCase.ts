import { err, ok, type Result, type ResultAsync as UseResultAsync } from "neverthrow";

import type { Clock } from "../domain/aggregate/clock.js";
import type { EventIdGenerator } from "../domain/aggregate/eventIdGenerator.js";
import { EvaPermit } from "../domain/permit/index.js";
import type { EvaPermit as PermitState, PermitByIdResolver, PermitId } from "../domain/permit/index.js";
import { Segment } from "../domain/segment/index.js";
import type {
  EnergizedSegment,
  LockedOutSegment,
  LockoutRemovedStore,
  Segment as SegmentState,
  SegmentByIdResolver,
  SegmentConflict,
  SegmentId,
} from "../domain/segment/index.js";
import type { User } from "../domain/user/user.js";
import type { UserId } from "../domain/user/userId.js";
import type { UserByIdResolver } from "../domain/user/userResolver.js";
import { ensureCanManageLockout } from "./authorization.js";
import {
  ensurePermitFound,
  ensureSegmentFound,
  ensureUserFound,
  type IdentityGenerationFailed,
  type PermitNotFound,
  type SegmentNotFound,
  type UnauthorizedError,
} from "./errors.js";
import { createEvent, createEventContext } from "./eventContext.js";

export type UseCaseInput = Readonly<{ actorUserId: UserId; segmentId: SegmentId }>;
export type UseCaseOk = Readonly<{ segment: EnergizedSegment }>;
export type SegmentNotLockedOut = Readonly<{ kind: "SegmentNotLockedOut"; segmentId: SegmentId }>;
/** 遮断札は掛けた者のみが外す（規程第3条） */
export type LockoutTaggedByAnotherUser = Readonly<{
  kind: "LockoutTaggedByAnotherUser";
  segmentId: SegmentId;
  taggedBy: UserId;
}>;
/** 承認後は遮断を維持する。出発前なら中止、帰還後なら完了の手続きで外す */
export type PermitRequiresLockout = Readonly<{
  kind: "PermitRequiresLockout";
  segmentId: SegmentId;
  permitId: PermitId;
}>;
export type UseCaseError =
  | UnauthorizedError
  | SegmentNotFound
  | SegmentNotLockedOut
  | LockoutTaggedByAnotherUser
  | PermitNotFound
  | PermitRequiresLockout
  | SegmentConflict
  | IdentityGenerationFailed;
export type UseCaseOutput = UseResultAsync<UseCaseOk, UseCaseError>;
export type Dependencies = Readonly<{
  userResolver: UserByIdResolver;
  segmentResolver: SegmentByIdResolver;
  permitResolver: PermitByIdResolver;
  lockoutRemovedStore: LockoutRemovedStore;
  clock: Clock;
  eventIdGenerator: EventIdGenerator;
}>;
export type ReleaseLockoutUseCase = Readonly<{
  run: (input: UseCaseInput) => UseCaseOutput;
}>;

const ensureLockedOut = (segment: SegmentState): Result<LockedOutSegment, SegmentNotLockedOut> =>
  Segment.isLockedOut(segment)
    ? ok(segment)
    : err({ kind: "SegmentNotLockedOut", segmentId: segment.segmentId });
export const ensureTaggedBy =
  (actor: User) =>
  (segment: LockedOutSegment): Result<LockedOutSegment, LockoutTaggedByAnotherUser> =>
    segment.lockout.taggedBy === actor.userId
      ? ok(segment)
      : err({
          kind: "LockoutTaggedByAnotherUser",
          segmentId: segment.segmentId,
          taggedBy: segment.lockout.taggedBy,
        });
const ensureCanReleaseLockout =
  (segment: LockedOutSegment) =>
  (permit: PermitState): Result<PermitState, PermitRequiresLockout> =>
    EvaPermit.requiresLockout(permit)
      ? err({ kind: "PermitRequiresLockout", segmentId: segment.segmentId, permitId: permit.permitId })
      : ok(permit);

const run =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): UseCaseOutput =>
    dependencies.userResolver
      .resolveById(input.actorUserId)
      .andThen(ensureUserFound(input.actorUserId))
      .andThen(ensureCanManageLockout)
      .andThen((actor) =>
        dependencies.segmentResolver
          .resolveById(input.segmentId)
          .andThen(ensureSegmentFound(input.segmentId))
          .andThen(ensureLockedOut)
          .andThen(ensureTaggedBy(actor)),
      )
      .andThen((segment) =>
        dependencies.permitResolver
          .resolveById(segment.lockout.permitId)
          .andThen(ensurePermitFound(segment.lockout.permitId))
          .andThen(ensureCanReleaseLockout(segment))
          .map(() => segment),
      )
      .andThen((segment) =>
        createEvent(() =>
          Segment.removeLockout(createEventContext(dependencies, input.actorUserId))(segment),
        ),
      )
      .andThrough((event) => dependencies.lockoutRemovedStore.store(event))
      .map((event) => ({ segment: event.aggregateState }));

export const ReleaseLockoutUseCase = {
  create: (dependencies: Dependencies): ReleaseLockoutUseCase => ({
    run: run(dependencies),
  }),
} as const;
