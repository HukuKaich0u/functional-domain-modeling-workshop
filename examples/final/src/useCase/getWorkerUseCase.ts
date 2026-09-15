import type { ResultAsync } from "neverthrow";

import type { UserId } from "../domain/user/userId.js";
import type { UserByIdResolver } from "../domain/user/userResolver.js";
import type { WorkerByIdResolver, WorkerId } from "../domain/worker/index.js";
import { ensureCanManageOperations } from "./authorization.js";
import {
  ensureUserFound,
  ensureWorkerFound,
  type UnauthorizedError,
  type WorkerNotFound,
} from "./errors.js";
import { toWorkerView, type WorkerView } from "./workerView.js";

export type UseCaseInput = Readonly<{ actorUserId: UserId; workerId: WorkerId }>;
export type UseCaseOk = Readonly<{ worker: WorkerView }>;
export type UseCaseError = UnauthorizedError | WorkerNotFound;
export type UseCaseOutput = ResultAsync<UseCaseOk, UseCaseError>;
export type Dependencies = Readonly<{
  userResolver: UserByIdResolver;
  workerResolver: WorkerByIdResolver;
}>;
export type GetWorkerUseCase = Readonly<{
  run: (input: UseCaseInput) => UseCaseOutput;
}>;

const run =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): UseCaseOutput =>
    dependencies.userResolver
      .resolveById(input.actorUserId)
      .andThen(ensureUserFound(input.actorUserId))
      .andThen(ensureCanManageOperations)
      .andThen(() => dependencies.workerResolver.resolveById(input.workerId))
      .andThen(ensureWorkerFound(input.workerId))
      .map((worker) => ({ worker: toWorkerView(worker) }));

export const GetWorkerUseCase = {
  create: (dependencies: Dependencies): GetWorkerUseCase => ({
    run: run(dependencies),
  }),
} as const;
