import { err, ok, safeTry, type Result, type ResultAsync } from "neverthrow";

import type { Clock } from "../domain/aggregate/clock.js";
import type { EventIdGenerator } from "../domain/aggregate/eventIdGenerator.js";
import { EvaPermit } from "../domain/permit/index.js";
import type {
  Closed,
  PermitByIdResolver,
  PermitClosed,
  PermitId,
  Returned,
} from "../domain/permit/index.js";
import { Segment } from "../domain/segment/index.js";
import type {
  LockedOutSegment,
  LockoutReleaseStore,
  LockoutReleaseStoreError,
  LockoutRemoved,
  Segment as SegmentState,
  SegmentByIdResolver,
  SegmentId,
} from "../domain/segment/index.js";
import type { UserId } from "../domain/user/userId.js";
import type { UserByIdResolver } from "../domain/user/userResolver.js";
import { ensureCanManageLockout } from "./authorization.js";
import {
  ensurePermitFound,
  ensureReturned,
  ensureSegmentFound,
  ensureUserFound,
  type IdentityGenerationFailed,
  type InvalidPermitState,
  type PermitNotFound,
  type SegmentNotFound,
  type UnauthorizedError,
} from "./errors.js";
import { createEvent, createEventContext } from "./eventContext.js";
import { ensureTaggedBy, type LockoutTaggedByAnotherUser } from "./releaseLockoutUseCase.js";

export type UseCaseInput = Readonly<{ actorUserId: UserId; permitId: PermitId }>;
export type UseCaseOk = Readonly<{ permit: Closed }>;
export type SegmentNotLockedOut = Readonly<{ kind: "SegmentNotLockedOut"; permitId: PermitId; segmentId: SegmentId }>;
export type LockoutForAnotherPermit = Readonly<{
  kind: "LockoutForAnotherPermit";
  permitId: PermitId;
  segmentId: SegmentId;
  lockedOutPermitId: PermitId;
}>;
export type UseCaseError =
  | UnauthorizedError
  | PermitNotFound
  | InvalidPermitState<"Returned">
  | SegmentNotFound
  | SegmentNotLockedOut
  | LockoutForAnotherPermit
  | LockoutTaggedByAnotherUser
  | LockoutReleaseStoreError
  | IdentityGenerationFailed;
export type UseCaseOutput = ResultAsync<UseCaseOk, UseCaseError>;
export type Dependencies = Readonly<{
  userResolver: UserByIdResolver;
  permitResolver: PermitByIdResolver;
  segmentResolver: SegmentByIdResolver;
  lockoutReleaseStore: LockoutReleaseStore;
  clock: Clock;
  eventIdGenerator: EventIdGenerator;
}>;
export type ClosePermitUseCase = Readonly<{
  run: (input: UseCaseInput) => UseCaseOutput;
}>;

type ReleaseEvents = Readonly<{ lockoutRemoved: LockoutRemoved; permitClosed: PermitClosed }>;

const ensureLockedOutForPermit =
  (permit: Returned) =>
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

/**
 * 完了。電気主任が遮断札を外し、作業記録を確認する。
 * 札の取り外しと作業許可の完了は2つのイベントで、1つの store が同じ transaction に保存する。
 */
const prepare =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): ResultAsync<ReleaseEvents, UseCaseError> =>
    safeTry<ReleaseEvents, UseCaseError>(async function* () {
      const resolvedActor = yield* dependencies.userResolver.resolveById(input.actorUserId);
      const actor = yield* ensureUserFound(input.actorUserId)(resolvedActor);
      yield* ensureCanManageLockout(actor);

      const resolvedPermit = yield* dependencies.permitResolver.resolveById(input.permitId);
      const found = yield* ensurePermitFound(input.permitId)(resolvedPermit);
      const permit = yield* ensureReturned(found);

      const resolvedSegment = yield* dependencies.segmentResolver.resolveById(permit.segmentId);
      const segment = yield* ensureSegmentFound(permit.segmentId)(resolvedSegment);
      const lockedOut = yield* ensureLockedOutForPermit(permit)(segment);
      yield* ensureTaggedBy(actor)(lockedOut);

      const events = yield* createEvent(() => {
        const lockoutRemoved = Segment.removeLockout(
          createEventContext(dependencies, input.actorUserId),
        )(lockedOut);
        const permitClosed = EvaPermit.close(
          createEventContext(dependencies, input.actorUserId),
        )(permit);
        return { lockoutRemoved, permitClosed } as const;
      });
      return ok(events);
    });

const run =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): UseCaseOutput =>
    prepare(dependencies)(input)
      .andThrough(({ lockoutRemoved, permitClosed }) =>
        dependencies.lockoutReleaseStore.store(lockoutRemoved, permitClosed),
      )
      .map(({ permitClosed }) => ({ permit: permitClosed.aggregateState }));

export const ClosePermitUseCase = {
  create: (dependencies: Dependencies): ClosePermitUseCase => ({
    run: run(dependencies),
  }),
} as const;
