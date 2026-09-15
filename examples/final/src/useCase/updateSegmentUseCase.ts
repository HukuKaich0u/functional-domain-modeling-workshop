import type { ResultAsync as UseResultAsync } from "neverthrow";

import type { Clock } from "../domain/aggregate/clock.js";
import type { EventIdGenerator } from "../domain/aggregate/eventIdGenerator.js";
import { Segment } from "../domain/segment/index.js";
import type {
  SegmentByIdResolver,
  SegmentId,
  SegmentLabel,
  SegmentUpdatedStore,
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
import { toSegmentView, type SegmentView } from "./segmentView.js";

export type UseCaseInput = Readonly<{
  actorUserId: UserId;
  segmentId: SegmentId;
  label: SegmentLabel;
}>;
export type UseCaseOk = Readonly<{ segment: SegmentView }>;
export type UseCaseError = UnauthorizedError | SegmentNotFound | IdentityGenerationFailed;
export type UseCaseOutput = UseResultAsync<UseCaseOk, UseCaseError>;
export type Dependencies = Readonly<{
  userResolver: UserByIdResolver;
  segmentResolver: SegmentByIdResolver;
  segmentUpdatedStore: SegmentUpdatedStore;
  clock: Clock;
  eventIdGenerator: EventIdGenerator;
}>;
export type UpdateSegmentUseCase = Readonly<{
  run: (input: UseCaseInput) => UseCaseOutput;
}>;

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
          Segment.update(createEventContext(dependencies, input.actorUserId))(segment, {
            label: input.label,
          }),
        ),
      )
      .andThrough((event) => dependencies.segmentUpdatedStore.store(event))
      .map((event) => ({ segment: toSegmentView(event.aggregateState) }));

export const UpdateSegmentUseCase = {
  create: (dependencies: Dependencies): UpdateSegmentUseCase => ({
    run: run(dependencies),
  }),
} as const;
