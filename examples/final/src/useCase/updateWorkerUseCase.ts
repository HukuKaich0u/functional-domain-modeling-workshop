import type { ResultAsync as UseResultAsync } from "neverthrow";

import type { Clock } from "../domain/aggregate/clock.js";
import type { EventIdGenerator } from "../domain/aggregate/eventIdGenerator.js";
import type { UserId } from "../domain/user/userId.js";
import type { UserByIdResolver } from "../domain/user/userResolver.js";
import { Worker } from "../domain/worker/index.js";
import type {
  CumulativeDose,
  WorkerByIdResolver,
  WorkerId,
  WorkerQualification,
  WorkerUpdatedStore,
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
import { toWorkerView, type WorkerView } from "./workerView.js";

export type UseCaseInput = Readonly<{
  actorUserId: UserId;
  workerId: WorkerId;
  qualification: WorkerQualification;
  cumulativeDoseMicroSv: CumulativeDose;
}>;
export type UseCaseOk = Readonly<{ worker: WorkerView }>;
export type UseCaseError = UnauthorizedError | WorkerNotFound | IdentityGenerationFailed;
export type UseCaseOutput = UseResultAsync<UseCaseOk, UseCaseError>;
export type Dependencies = Readonly<{
  userResolver: UserByIdResolver;
  workerResolver: WorkerByIdResolver;
  workerUpdatedStore: WorkerUpdatedStore;
  clock: Clock;
  eventIdGenerator: EventIdGenerator;
}>;
export type UpdateWorkerUseCase = Readonly<{
  run: (input: UseCaseInput) => UseCaseOutput;
}>;

/** 医務が累積線量を更新する。値は Sensitive のまま状態に入り、作業記録には出ない */
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
          Worker.update(createEventContext(dependencies, input.actorUserId))(worker, {
            qualification: input.qualification,
            cumulativeDoseMicroSv: input.cumulativeDoseMicroSv,
          }),
        ),
      )
      .andThrough((event) => dependencies.workerUpdatedStore.store(event))
      .map((event) => ({ worker: toWorkerView(event.aggregateState) }));

export const UpdateWorkerUseCase = {
  create: (dependencies: Dependencies): UpdateWorkerUseCase => ({
    run: run(dependencies),
  }),
} as const;
