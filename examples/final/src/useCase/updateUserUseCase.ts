import {
  err,
  ok,
  type Result,
  type ResultAsync as UseResultAsync,
} from "neverthrow";

import type { Clock } from "../domain/aggregate/clock.js";
import type { EventIdGenerator } from "../domain/aggregate/eventIdGenerator.js";
import type { User } from "../domain/user/user.js";
import { createUserUpdated } from "../domain/user/userEvent.js";
import type { UserEmail } from "../domain/user/userEmail.js";
import type { UserId } from "../domain/user/userId.js";
import type { UserName } from "../domain/user/userName.js";
import type { UserRole } from "../domain/user/userRole.js";
import type {
  UserByEmailResolver,
  UserByIdResolver,
} from "../domain/user/userResolver.js";
import type { UserUpdatedStore } from "../domain/user/userStores.js";
import { ensureAdmin } from "./authorization.js";
import {
  ensureUserFound,
  type IdentityGenerationFailed,
  type UnauthorizedError,
} from "./errors.js";
import { createEvent, createEventContext } from "./eventContext.js";
import { toUserView, type UserView } from "./userView.js";

export type { UserView } from "./userView.js";
export type UseCaseInput = Readonly<{
  actorUserId: UserId;
  targetUserId: UserId;
  email: UserEmail;
  name: UserName;
  role: UserRole;
}>;
export type UseCaseOk = Readonly<{ user: UserView }>;
export type UserNotFound = Readonly<{ kind: "UserNotFound"; userId: UserId }>;
export type UserEmailAlreadyExists = Readonly<{
  kind: "UserEmailAlreadyExists";
}>;
export type CannotDowngradeLastAdmin = Readonly<{
  kind: "CannotDowngradeLastAdmin";
}>;
export type UseCaseError =
  | UnauthorizedError
  | UserNotFound
  | UserEmailAlreadyExists
  | CannotDowngradeLastAdmin
  | IdentityGenerationFailed;
export type UseCaseOutput = UseResultAsync<UseCaseOk, UseCaseError>;
export type Dependencies = Readonly<{
  userByIdResolver: UserByIdResolver;
  userByEmailResolver: UserByEmailResolver;
  userUpdatedStore: UserUpdatedStore;
  clock: Clock;
  eventIdGenerator: EventIdGenerator;
}>;
export type UpdateUserUseCase = Readonly<{
  run: (input: UseCaseInput) => UseCaseOutput;
}>;

const ensureTarget =
  (userId: UserId) =>
  (user: User | undefined): Result<User, UserNotFound> =>
    user === undefined ? err({ kind: "UserNotFound", userId }) : ok(user);
const ensureEmailAvailable =
  (targetUserId: UserId) =>
  (user: User | undefined): Result<void, UserEmailAlreadyExists> =>
    user === undefined || user.userId === targetUserId
      ? ok(undefined)
      : err({ kind: "UserEmailAlreadyExists" });
const run =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): UseCaseOutput =>
    dependencies.userByIdResolver
      .resolveById(input.actorUserId)
      .andThen(ensureUserFound(input.actorUserId))
      .andThen(ensureAdmin)
      .andThen(() =>
        dependencies.userByIdResolver.resolveById(input.targetUserId),
      )
      .andThen(ensureTarget(input.targetUserId))
      .andThen((target) =>
        dependencies.userByEmailResolver
          .resolveByEmail(input.email)
          .andThen(ensureEmailAvailable(target.userId))
          .map(() => target),
      )
      .andThen((target) =>
        createEvent(() =>
          createUserUpdated(createEventContext(dependencies, input.actorUserId), {
            kind: input.role,
            userId: target.userId,
            email: input.email,
            name: input.name,
            passwordHash: target.passwordHash,
          }),
        ),
      )
      .andThrough((event) => dependencies.userUpdatedStore.store(event))
      .map((event) => ({ user: toUserView(event.aggregateState) }));

export const UpdateUserUseCase = {
  create: (dependencies: Dependencies): UpdateUserUseCase => ({
    run: run(dependencies),
  }),
} as const;
