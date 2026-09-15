import {
  err,
  ok,
  ResultAsync,
  type Result,
  type ResultAsync as UseResultAsync,
} from "neverthrow";

import type { Clock } from "../domain/aggregate/clock.js";
import type { EventIdGenerator } from "../domain/aggregate/eventIdGenerator.js";
import {
  Timestamp,
  type Timestamp as TimestampValue,
} from "../domain/aggregate/timestamp.js";
import { Session } from "../domain/session/session.js";
import type { SessionId } from "../domain/session/sessionId.js";
import type { SessionCreatedStore } from "../domain/session/sessionStores.js";
import type { SessionTokenGenerator } from "../domain/session/sessionTokenGenerator.js";
import type { SessionTokenPlaintext } from "../domain/session/sessionTokenPlaintext.js";
import type { User } from "../domain/user/user.js";
import type { PasswordHash } from "../domain/user/passwordHash.js";
import type { UserEmail } from "../domain/user/userEmail.js";
import type { UserId } from "../domain/user/userId.js";
import type {
  PasswordHasher,
  PlaintextPassword,
} from "../domain/user/passwordHasher.js";
import type { UserByEmailResolver } from "../domain/user/userResolver.js";
import { createEventContext } from "./eventContext.js";

const sessionDurationMs = 8 * 60 * 60 * 1_000;

export type UseCaseInput = Readonly<{
  email: UserEmail;
  password: PlaintextPassword;
}>;
export type UseCaseOk = Readonly<{
  userId: UserId;
  sessionId: SessionId;
  expiresAt: TimestampValue;
  sessionToken: SessionTokenPlaintext;
}>;
export type InvalidCredentials = Readonly<{ kind: "InvalidCredentials" }>;
export type PasswordVerificationFailed = Readonly<{
  kind: "PasswordVerificationFailed";
}>;
export type SessionCreationFailed = Readonly<{ kind: "SessionCreationFailed" }>;
export type UseCaseError =
  | InvalidCredentials
  | PasswordVerificationFailed
  | SessionCreationFailed;
export type UseCaseOutput = UseResultAsync<UseCaseOk, UseCaseError>;

export type SessionIdGenerator = Readonly<{ generate: () => SessionId }>;
export type Dependencies = Readonly<{
  userResolver: UserByEmailResolver;
  sessionCreatedStore: SessionCreatedStore;
  passwordHasher: PasswordHasher;
  dummyPasswordHash: PasswordHash;
  sessionTokenGenerator: SessionTokenGenerator;
  clock: Clock;
  eventIdGenerator: EventIdGenerator;
  sessionIdGenerator: SessionIdGenerator;
}>;
export type LogInUseCase = Readonly<{
  run: (input: UseCaseInput) => UseCaseOutput;
}>;

const ensureVerified =
  (user: User | undefined) =>
  (verified: boolean): Result<User, InvalidCredentials> =>
    user !== undefined && verified
      ? ok(user)
      : err({ kind: "InvalidCredentials" });
/** 存在しないメールアドレスでも同じ時間を掛け、利用者の列挙を防ぐ */
const verifyPassword =
  (
    passwordHasher: PasswordHasher,
    dummyPasswordHash: PasswordHash,
    password: PlaintextPassword,
  ) =>
  (user: User | undefined) =>
    ResultAsync.fromPromise(
      Promise.resolve().then(() =>
        passwordHasher.verify(
          password,
          user?.passwordHash ?? dummyPasswordHash,
        ),
      ),
      (): PasswordVerificationFailed => ({
        kind: "PasswordVerificationFailed",
      }),
    ).andThen(ensureVerified(user));
const expirationFrom = (
  occurredAt: TimestampValue,
): Result<TimestampValue, SessionCreationFailed> =>
  Timestamp.parse(
    new Date(Date.parse(occurredAt) + sessionDurationMs).toISOString(),
  ).mapErr(() => ({ kind: "SessionCreationFailed" }));
const generateSession = (dependencies: Dependencies, userId: UserId) =>
  ResultAsync.fromPromise(
    Promise.resolve().then(() => ({
      sessionId: dependencies.sessionIdGenerator.generate(),
      token: dependencies.sessionTokenGenerator.generate(),
      context: createEventContext(dependencies, userId),
    })),
    (): SessionCreationFailed => ({ kind: "SessionCreationFailed" }),
  )
    .andThen((generated) =>
      expirationFrom(generated.context.occurredAt).map((expiresAt) => ({
        ...generated,
        expiresAt,
      })),
    )
    .map((generated) => ({
      event: Session.create(generated.context)({
        sessionId: generated.sessionId,
        userId,
        tokenHash: generated.token.hash,
        expiresAt: generated.expiresAt,
      }),
      token: generated.token.plaintext,
    }));

const run =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): UseCaseOutput =>
    dependencies.userResolver
      .resolveByEmail(input.email)
      .andThen(
        verifyPassword(
          dependencies.passwordHasher,
          dependencies.dummyPasswordHash,
          input.password,
        ),
      )
      .andThen((user) => generateSession(dependencies, user.userId))
      .andThrough(({ event }) =>
        dependencies.sessionCreatedStore.store(event),
      )
      .map(({ event, token }) => ({
        userId: event.aggregateState.userId,
        sessionId: event.aggregateState.sessionId,
        expiresAt: event.aggregateState.expiresAt,
        sessionToken: token,
      }));

export const LogInUseCase = {
  create: (dependencies: Dependencies): LogInUseCase => ({
    run: run(dependencies),
  }),
} as const;
