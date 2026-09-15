import type { ResultAsync as UseResultAsync } from "neverthrow";

import type { Clock } from "../domain/aggregate/clock.js";
import type { EventIdGenerator } from "../domain/aggregate/eventIdGenerator.js";
import { EvaPermit } from "../domain/permit/index.js";
import type {
  CrewEgressedStore,
  Outside,
  PermitByIdResolver,
  PermitConflict,
  PermitId,
} from "../domain/permit/index.js";
import type { UserId } from "../domain/user/userId.js";
import type { UserByIdResolver } from "../domain/user/userResolver.js";
import { ensureCanApproveEva } from "./authorization.js";
import {
  ensureApproved,
  ensurePermitFound,
  ensureUserFound,
  type IdentityGenerationFailed,
  type InvalidPermitState,
  type PermitNotFound,
  type UnauthorizedError,
} from "./errors.js";
import { createEvent, createEventContext } from "./eventContext.js";

export type UseCaseInput = Readonly<{ actorUserId: UserId; permitId: PermitId }>;
export type UseCaseOk = Readonly<{ permit: Outside }>;
export type UseCaseError =
  | UnauthorizedError
  | PermitNotFound
  | InvalidPermitState<"Approved">
  | PermitConflict
  | IdentityGenerationFailed;
export type UseCaseOutput = UseResultAsync<UseCaseOk, UseCaseError>;
export type Dependencies = Readonly<{
  userResolver: UserByIdResolver;
  permitResolver: PermitByIdResolver;
  crewEgressedStore: CrewEgressedStore;
  clock: Clock;
  eventIdGenerator: EventIdGenerator;
}>;
export type RecordEgressUseCase = Readonly<{
  run: (input: UseCaseInput) => UseCaseOutput;
}>;

/** エアロック出発の記録（規程第7条）。承認済の許可だけを作業中にする */
const run =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): UseCaseOutput =>
    dependencies.userResolver
      .resolveById(input.actorUserId)
      .andThen(ensureUserFound(input.actorUserId))
      .andThen(ensureCanApproveEva)
      .andThen(() => dependencies.permitResolver.resolveById(input.permitId))
      .andThen(ensurePermitFound(input.permitId))
      .andThen(ensureApproved)
      .andThen((permit) =>
        createEvent(() =>
          EvaPermit.egress(createEventContext(dependencies, input.actorUserId))(permit),
        ),
      )
      .andThrough((event) => dependencies.crewEgressedStore.store(event))
      .map((event) => ({ permit: event.aggregateState }));

export const RecordEgressUseCase = {
  create: (dependencies: Dependencies): RecordEgressUseCase => ({
    run: run(dependencies),
  }),
} as const;
