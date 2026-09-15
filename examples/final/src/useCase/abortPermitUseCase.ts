import type { ResultAsync as UseResultAsync } from "neverthrow";

import type { Clock } from "../domain/aggregate/clock.js";
import type { EventIdGenerator } from "../domain/aggregate/eventIdGenerator.js";
import { EvaPermit } from "../domain/permit/index.js";
import type {
  Aborted,
  AbortReason,
  PermitAbortedStore,
  PermitByIdResolver,
  PermitConflict,
  PermitId,
} from "../domain/permit/index.js";
import type { UserId } from "../domain/user/userId.js";
import type { UserByIdResolver } from "../domain/user/userResolver.js";
import { ensureCanAbortEva } from "./authorization.js";
import {
  ensureAbortable,
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
  reason: AbortReason;
}>;
export type UseCaseOk = Readonly<{ permit: Aborted }>;
export type UseCaseError =
  | UnauthorizedError
  | PermitNotFound
  | InvalidPermitState<"RequestedOrApproved">
  | PermitConflict
  | IdentityGenerationFailed;
export type UseCaseOutput = UseResultAsync<UseCaseOk, UseCaseError>;
export type Dependencies = Readonly<{
  userResolver: UserByIdResolver;
  permitResolver: PermitByIdResolver;
  permitAbortedStore: PermitAbortedStore;
  clock: Clock;
  eventIdGenerator: EventIdGenerator;
}>;
export type AbortPermitUseCase = Readonly<{
  run: (input: UseCaseInput) => UseCaseOutput;
}>;

/** 地上管制または基地長が、出発前の作業許可だけを、理由を残して中止する（S2 の条件） */
const run =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): UseCaseOutput =>
    dependencies.userResolver
      .resolveById(input.actorUserId)
      .andThen(ensureUserFound(input.actorUserId))
      .andThen(ensureCanAbortEva)
      .andThen(() => dependencies.permitResolver.resolveById(input.permitId))
      .andThen(ensurePermitFound(input.permitId))
      .andThen(ensureAbortable)
      .andThen((permit) =>
        createEvent(() =>
          EvaPermit.abort(createEventContext(dependencies, input.actorUserId))(
            permit,
            input.reason,
          ),
        ),
      )
      .andThrough((event) => dependencies.permitAbortedStore.store(event))
      .map((event) => ({ permit: event.aggregateState }));

export const AbortPermitUseCase = {
  create: (dependencies: Dependencies): AbortPermitUseCase => ({
    run: run(dependencies),
  }),
} as const;
