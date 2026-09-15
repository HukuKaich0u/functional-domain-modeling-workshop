import type { ResultAsync as UseResultAsync } from "neverthrow";

import type { Clock } from "../domain/aggregate/clock.js";
import type { EventIdGenerator } from "../domain/aggregate/eventIdGenerator.js";
import { EvaPermit } from "../domain/permit/index.js";
import type {
  CrewReturnedStore,
  PermitByIdResolver,
  PermitConflict,
  PermitId,
  Returned,
  ReturnRecord,
} from "../domain/permit/index.js";
import type { UserId } from "../domain/user/userId.js";
import type { UserByIdResolver } from "../domain/user/userResolver.js";
import { ensureCanApproveEva } from "./authorization.js";
import {
  ensureOutside,
  ensurePermitFound,
  ensureUserFound,
  type IdentityGenerationFailed,
  type InvalidPermitState,
  type PermitNotFound,
  type UnauthorizedError,
} from "./errors.js";
import { createEvent, createEventContext } from "./eventContext.js";

export type UseCaseInput = Readonly<{
  actorUserId: UserId;
  permitId: PermitId;
  returnRecord: ReturnRecord;
}>;
export type UseCaseOk = Readonly<{ permit: Returned }>;
export type UseCaseError =
  | UnauthorizedError
  | PermitNotFound
  | InvalidPermitState<"Outside">
  | PermitConflict
  | IdentityGenerationFailed;
export type UseCaseOutput = UseResultAsync<UseCaseOk, UseCaseError>;
export type Dependencies = Readonly<{
  userResolver: UserByIdResolver;
  permitResolver: PermitByIdResolver;
  crewReturnedStore: CrewReturnedStore;
  clock: Clock;
  eventIdGenerator: EventIdGenerator;
}>;
export type RecordReturnUseCase = Readonly<{
  run: (input: UseCaseInput) => UseCaseOutput;
}>;

/** エアロック帰還の記録。緊急帰還は理由を ReturnRecord で受け取る（規程第6条） */
const run =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): UseCaseOutput =>
    dependencies.userResolver
      .resolveById(input.actorUserId)
      .andThen(ensureUserFound(input.actorUserId))
      .andThen(ensureCanApproveEva)
      .andThen(() => dependencies.permitResolver.resolveById(input.permitId))
      .andThen(ensurePermitFound(input.permitId))
      .andThen(ensureOutside)
      .andThen((permit) =>
        createEvent(() =>
          EvaPermit.returnToBase(createEventContext(dependencies, input.actorUserId))(
            permit,
            input.returnRecord,
          ),
        ),
      )
      .andThrough((event) => dependencies.crewReturnedStore.store(event))
      .map((event) => ({ permit: event.aggregateState }));

export const RecordReturnUseCase = {
  create: (dependencies: Dependencies): RecordReturnUseCase => ({
    run: run(dependencies),
  }),
} as const;
