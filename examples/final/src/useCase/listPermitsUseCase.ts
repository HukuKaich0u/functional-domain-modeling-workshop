import type { ResultAsync } from "neverthrow";

import type { PermitListResolver } from "../domain/permit/index.js";
import type { UserId } from "../domain/user/userId.js";
import type { UserByIdResolver } from "../domain/user/userResolver.js";
import { ensureUserFound, type UnauthorizedError } from "./errors.js";
import { toPermitView, type PermitView } from "./permitView.js";

export type { PermitView } from "./permitView.js";
export type UseCaseInput = Readonly<{ actorUserId: UserId }>;
export type UseCaseOk = Readonly<{ permits: readonly PermitView[] }>;
export type UseCaseError = UnauthorizedError;
export type UseCaseOutput = ResultAsync<UseCaseOk, UseCaseError>;
export type Dependencies = Readonly<{
  userResolver: UserByIdResolver;
  permitListResolver: PermitListResolver;
}>;
export type ListPermitsUseCase = Readonly<{
  run: (input: UseCaseInput) => UseCaseOutput;
}>;

const run =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): UseCaseOutput =>
    dependencies.userResolver
      .resolveById(input.actorUserId)
      .andThen(ensureUserFound(input.actorUserId))
      .andThen(() => dependencies.permitListResolver.resolveAll())
      .map((permits) => ({ permits: permits.map(toPermitView) }));

export const ListPermitsUseCase = {
  create: (dependencies: Dependencies): ListPermitsUseCase => ({
    run: run(dependencies),
  }),
} as const;
