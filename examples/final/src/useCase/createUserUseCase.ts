import {
  err,
  ok,
  ResultAsync,
  type Result,
  type ResultAsync as UseResultAsync,
} from "neverthrow";

import type { Clock } from "../domain/aggregate/clock.js";
import type { EventIdGenerator } from "../domain/aggregate/eventIdGenerator.js";
import { User, type User as UserState } from "../domain/user/user.js";
import type { UserEmail } from "../domain/user/userEmail.js";
import type { UserId } from "../domain/user/userId.js";
import type { UserName } from "../domain/user/userName.js";
import type { UserRole } from "../domain/user/userRole.js";
import type {
  PasswordHasher,
  PlaintextPassword,
} from "../domain/user/passwordHasher.js";
import type {
  UserByEmailResolver,
  UserByIdResolver,
} from "../domain/user/userResolver.js";
import type { UserCreatedStore } from "../domain/user/userStores.js";
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
  email: UserEmail;
  name: UserName;
  password: PlaintextPassword;
  role: UserRole;
}>;
export type UseCaseOk = Readonly<{ user: UserView }>;
export type UserEmailAlreadyExists = Readonly<{
  kind: "UserEmailAlreadyExists";
}>;
export type PasswordHashingFailed = Readonly<{ kind: "PasswordHashingFailed" }>;
export type UseCaseError =
  | UnauthorizedError
  | UserEmailAlreadyExists
  | PasswordHashingFailed
  | IdentityGenerationFailed;
export type UseCaseOutput = UseResultAsync<UseCaseOk, UseCaseError>;
export type UserIdGenerator = Readonly<{ generate: () => UserId }>;
export type Dependencies = Readonly<{
  userByIdResolver: UserByIdResolver;
  userByEmailResolver: UserByEmailResolver;
  userCreatedStore: UserCreatedStore;
  passwordHasher: PasswordHasher;
  clock: Clock;
  eventIdGenerator: EventIdGenerator;
  userIdGenerator: UserIdGenerator;
}>;
export type CreateUserUseCase = Readonly<{
  run: (input: UseCaseInput) => UseCaseOutput;
}>;

const ensureEmailAvailable = (
  user: UserState | undefined,
): Result<void, UserEmailAlreadyExists> =>
  user === undefined ? ok(undefined) : err({ kind: "UserEmailAlreadyExists" });
const hashPassword = (
  passwordHasher: PasswordHasher,
  password: PlaintextPassword,
) =>
  ResultAsync.fromPromise(
    Promise.resolve().then(() => passwordHasher.hash(password)),
    (): PasswordHashingFailed => ({ kind: "PasswordHashingFailed" }),
  );
const run =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): UseCaseOutput =>
    dependencies.userByIdResolver
      .resolveById(input.actorUserId)
      .andThen(ensureUserFound(input.actorUserId))
      .andThen(ensureAdmin)
      .andThen(() =>
        dependencies.userByEmailResolver.resolveByEmail(input.email),
      )
      .andThen(ensureEmailAvailable)
      .andThen(() => hashPassword(dependencies.passwordHasher, input.password))
      .andThen((passwordHash) =>
        createEvent(() =>
          User.create(createEventContext(dependencies, input.actorUserId))({
            kind: input.role,
            userId: dependencies.userIdGenerator.generate(),
            email: input.email,
            name: input.name,
            passwordHash,
          }),
        ),
      )
      .andThrough((event) => dependencies.userCreatedStore.store(event))
      .map((event) => ({ user: toUserView(event.aggregateState) }));

export const CreateUserUseCase = {
  create: (dependencies: Dependencies): CreateUserUseCase => ({
    run: run(dependencies),
  }),
} as const;
