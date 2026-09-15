import type { ResultAsync as UseResultAsync } from "neverthrow";

import type { Clock } from "../domain/aggregate/clock.js";
import type { EventIdGenerator } from "../domain/aggregate/eventIdGenerator.js";
import { Segment } from "../domain/segment/index.js";
import type {
  SegmentAlreadyExists,
  SegmentId,
  SegmentLabel,
  SegmentRegisteredStore,
} from "../domain/segment/index.js";
import type { UserId } from "../domain/user/userId.js";
import type { UserByIdResolver } from "../domain/user/userResolver.js";
import { ensureCanManageOperations } from "./authorization.js";
import {
  ensureUserFound,
  type IdentityGenerationFailed,
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
export type UseCaseError = UnauthorizedError | SegmentAlreadyExists | IdentityGenerationFailed;
export type UseCaseOutput = UseResultAsync<UseCaseOk, UseCaseError>;
export type Dependencies = Readonly<{
  userResolver: UserByIdResolver;
  segmentRegisteredStore: SegmentRegisteredStore;
  clock: Clock;
  eventIdGenerator: EventIdGenerator;
}>;
export type RegisterSegmentUseCase = Readonly<{
  run: (input: UseCaseInput) => UseCaseOutput;
}>;

/** 系統区間は識別子を地上管制が決める。重複は保存側が SegmentAlreadyExists で返す */
const run =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): UseCaseOutput =>
    dependencies.userResolver
      .resolveById(input.actorUserId)
      .andThen(ensureUserFound(input.actorUserId))
      .andThen(ensureCanManageOperations)
      .andThen(() =>
        createEvent(() =>
          Segment.register(createEventContext(dependencies, input.actorUserId))({
            segmentId: input.segmentId,
            label: input.label,
            lockout: { kind: "Energized" },
          }),
        ),
      )
      .andThrough((event) => dependencies.segmentRegisteredStore.store(event))
      .map((event) => ({ segment: toSegmentView(event.aggregateState) }));

export const RegisterSegmentUseCase = {
  create: (dependencies: Dependencies): RegisterSegmentUseCase => ({
    run: run(dependencies),
  }),
} as const;
