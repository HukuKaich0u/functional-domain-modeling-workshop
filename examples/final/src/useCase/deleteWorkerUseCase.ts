import type { ResultAsync as UseResultAsync } from "neverthrow";

import type { Clock } from "../domain/aggregate/clock.js";
import type { EventIdGenerator } from "../domain/aggregate/eventIdGenerator.js";
import type { UserId } from "../domain/user/userId.js";
import type { UserByIdResolver } from "../domain/user/userResolver.js";
import { Worker } from "../domain/worker/index.js";
import type {
  WorkerByIdResolver,
  WorkerDeletedStore,
  WorkerHasActivePermitStoreError,
  WorkerId,
} from "../domain/worker/index.js";
import { ensureCanManageOperations } from "./authorization.js";
import {
  ensureUserFound,
  ensureWorkerFound,
  type IdentityGenerationFailed,
  type UnauthorizedError,
  type WorkerNotFound,
} from "./errors.js";
import { createEvent, createEventContext } from "./eventContext.js";

export type UseCaseInput = Readonly<{ actorUserId: UserId; workerId: WorkerId }>;
export type UseCaseOk = Readonly<{ workerId: WorkerId }>;
export type UseCaseError =
  | UnauthorizedError
  | WorkerNotFound
  | WorkerHasActivePermitStoreError
  | IdentityGenerationFailed;
export type UseCaseOutput = UseResultAsync<UseCaseOk, UseCaseError>;
export type Dependencies = Readonly<{
  userResolver: UserByIdResolver;
  workerResolver: WorkerByIdResolver;
  workerDeletedStore: WorkerDeletedStore;
  clock: Clock;
  eventIdGenerator: EventIdGenerator;
}>;
export type DeleteWorkerUseCase = Readonly<{
  run: (input: UseCaseInput) => UseCaseOutput;
}>;

/** 進行中の作業許可に登録されている隊員は保存側が WorkerHasActivePermit で拒否する */
const run =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): UseCaseOutput =>
    dependencies.userResolver
      .resolveById(input.actorUserId)
      .andThen(ensureUserFound(input.actorUserId))
      .andThen(ensureCanManageOperations)
      .andThen(() => dependencies.workerResolver.resolveById(input.workerId))
      .andThen(ensureWorkerFound(input.workerId))
      .andThen((worker) =>
        createEvent(() =>
          Worker.delete(createEventContext(dependencies, input.actorUserId))(worker),
        ),
      )
      .andThrough((event) => dependencies.workerDeletedStore.store(event))
      .map((event) => ({ workerId: event.aggregateId }));

export const DeleteWorkerUseCase = {
  create: (dependencies: Dependencies): DeleteWorkerUseCase => ({
    run: run(dependencies),
  }),
} as const;
