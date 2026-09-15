import type { ResultAsync } from "neverthrow";

import type { UserId } from "../domain/user/userId.js";
import type { UserByIdResolver } from "../domain/user/userResolver.js";
import type { WorkerListResolver } from "../domain/worker/index.js";
import { ensureCanManageOperations } from "./authorization.js";
import { ensureUserFound, type UnauthorizedError } from "./errors.js";
import { toWorkerView, type WorkerView } from "./workerView.js";

export type { WorkerView } from "./workerView.js";
export type UseCaseInput = Readonly<{ actorUserId: UserId }>;
export type UseCaseOk = Readonly<{ workers: readonly WorkerView[] }>;
export type UseCaseError = UnauthorizedError;
export type UseCaseOutput = ResultAsync<UseCaseOk, UseCaseError>;
export type Dependencies = Readonly<{
  userResolver: UserByIdResolver;
  workerResolver: WorkerListResolver;
}>;
export type ListWorkersUseCase = Readonly<{
  run: (input: UseCaseInput) => UseCaseOutput;
}>;

/** 累積線量を含むため、地上管制（医務の窓口）と Admin だけが一覧を見る */
const run =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): UseCaseOutput =>
    dependencies.userResolver
      .resolveById(input.actorUserId)
      .andThen(ensureUserFound(input.actorUserId))
      .andThen(ensureCanManageOperations)
      .andThen(() => dependencies.workerResolver.resolveAll())
      .map((workers) => ({ workers: workers.map(toWorkerView) }));

export const ListWorkersUseCase = {
  create: (dependencies: Dependencies): ListWorkersUseCase => ({
    run: run(dependencies),
  }),
} as const;
