import type { ResultAsync as UseResultAsync } from "neverthrow";

import type { Clock } from "../domain/aggregate/clock.js";
import type { EventIdGenerator } from "../domain/aggregate/eventIdGenerator.js";
import { Segment } from "../domain/segment/index.js";
import type {
  SegmentByIdResolver,
  SegmentDeletedStore,
  SegmentId,
  SegmentInUseStoreError,
} from "../domain/segment/index.js";
import type { UserId } from "../domain/user/userId.js";
import type { UserByIdResolver } from "../domain/user/userResolver.js";
import { ensureCanManageOperations } from "./authorization.js";
import {
  ensureSegmentFound,
  ensureUserFound,
  type IdentityGenerationFailed,
  type SegmentNotFound,
  type UnauthorizedError,
} from "./errors.js";
import { createEvent, createEventContext } from "./eventContext.js";

export type UseCaseInput = Readonly<{ actorUserId: UserId; segmentId: SegmentId }>;
export type UseCaseOk = Readonly<{ segmentId: SegmentId }>;
export type UseCaseError =
  | UnauthorizedError
  | SegmentNotFound
  | SegmentInUseStoreError
  | IdentityGenerationFailed;
export type UseCaseOutput = UseResultAsync<UseCaseOk, UseCaseError>;
export type Dependencies = Readonly<{
  userResolver: UserByIdResolver;
  segmentResolver: SegmentByIdResolver;
  segmentDeletedStore: SegmentDeletedStore;
  clock: Clock;
  eventIdGenerator: EventIdGenerator;
}>;
export type DeleteSegmentUseCase = Readonly<{
  run: (input: UseCaseInput) => UseCaseOutput;
}>;

/** 遮断中、または進行中の作業許可がある区間は保存側が SegmentInUse で拒否する */
const run =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): UseCaseOutput =>
    dependencies.userResolver
      .resolveById(input.actorUserId)
      .andThen(ensureUserFound(input.actorUserId))
      .andThen(ensureCanManageOperations)
      .andThen(() => dependencies.segmentResolver.resolveById(input.segmentId))
      .andThen(ensureSegmentFound(input.segmentId))
      .andThen((segment) =>
        createEvent(() =>
          Segment.delete(createEventContext(dependencies, input.actorUserId))(segment),
        ),
      )
      .andThrough((event) => dependencies.segmentDeletedStore.store(event))
      .map((event) => ({ segmentId: event.aggregateId }));

export const DeleteSegmentUseCase = {
  create: (dependencies: Dependencies): DeleteSegmentUseCase => ({
    run: run(dependencies),
  }),
} as const;
