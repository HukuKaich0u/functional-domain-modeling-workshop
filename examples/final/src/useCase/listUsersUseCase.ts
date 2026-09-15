import type { ResultAsync } from "neverthrow";

import type { UserId } from "../domain/user/userId.js";
import type {
  UserByIdResolver,
  UserListResolver,
} from "../domain/user/userResolver.js";
import { ensureAdmin } from "./authorization.js";
import { ensureUserFound, type UnauthorizedError } from "./errors.js";
import { toUserView, type UserView } from "./userView.js";

export type { UserView } from "./userView.js";
export type UseCaseInput = Readonly<{ actorUserId: UserId }>;
export type UseCaseOk = Readonly<{ users: readonly UserView[] }>;
export type UseCaseError = UnauthorizedError;
export type UseCaseOutput = ResultAsync<UseCaseOk, UseCaseError>;
export type Dependencies = Readonly<{
  userByIdResolver: UserByIdResolver;
  userListResolver: UserListResolver;
}>;
export type ListUsersUseCase = Readonly<{
  run: (input: UseCaseInput) => UseCaseOutput;
}>;

const run =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): UseCaseOutput =>
    dependencies.userByIdResolver
      .resolveById(input.actorUserId)
      .andThen(ensureUserFound(input.actorUserId))
      .andThen(ensureAdmin)
      .andThen(() => dependencies.userListResolver.resolveAll())
      .map((users) => ({ users: users.map(toUserView) }));

export const ListUsersUseCase = {
  create: (dependencies: Dependencies): ListUsersUseCase => ({
    run: run(dependencies),
  }),
} as const;
