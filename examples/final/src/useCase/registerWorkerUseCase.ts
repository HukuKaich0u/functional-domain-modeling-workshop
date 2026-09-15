import type { ResultAsync as UseResultAsync } from "neverthrow";

import type { Clock } from "../domain/aggregate/clock.js";
import type { EventIdGenerator } from "../domain/aggregate/eventIdGenerator.js";
import type { UserId } from "../domain/user/userId.js";
import type { UserByIdResolver } from "../domain/user/userResolver.js";
import { Worker } from "../domain/worker/index.js";
import type {
  CumulativeDose,
  WorkerAlreadyExists,
  WorkerId,
  WorkerQualification,
  WorkerRegisteredStore,
} from "../domain/worker/index.js";
import { ensureCanManageOperations } from "./authorization.js";
import {
  ensureUserFound,
  type IdentityGenerationFailed,
  type UnauthorizedError,
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
export type UseCaseError = UnauthorizedError | WorkerAlreadyExists | IdentityGenerationFailed;
export type UseCaseOutput = UseResultAsync<UseCaseOk, UseCaseError>;
export type Dependencies = Readonly<{
  userResolver: UserByIdResolver;
  workerRegisteredStore: WorkerRegisteredStore;
  clock: Clock;
  eventIdGenerator: EventIdGenerator;
}>;
export type RegisterWorkerUseCase = Readonly<{
  run: (input: UseCaseInput) => UseCaseOutput;
}>;

const run =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): UseCaseOutput =>
    dependencies.userResolver
      .resolveById(input.actorUserId)
      .andThen(ensureUserFound(input.actorUserId))
      .andThen(ensureCanManageOperations)
      .andThen(() =>
        createEvent(() =>
          Worker.register(createEventContext(dependencies, input.actorUserId))({
            workerId: input.workerId,
            qualification: input.qualification,
            cumulativeDoseMicroSv: input.cumulativeDoseMicroSv,
          }),
        ),
      )
      .andThrough((event) => dependencies.workerRegisteredStore.store(event))
      .map((event) => ({ worker: toWorkerView(event.aggregateState) }));

export const RegisterWorkerUseCase = {
  create: (dependencies: Dependencies): RegisterWorkerUseCase => ({
    run: run(dependencies),
  }),
} as const;
