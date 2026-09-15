import { okAsync } from "neverthrow";
import { describe, expect, test } from "vitest";

import type { Clock } from "../../src/domain/aggregate/clock.js";
import type { Session } from "../../src/domain/session/session.js";
import type { SessionCreated, SessionDeleted } from "../../src/domain/session/sessionEvent.js";
import { SessionId } from "../../src/domain/session/sessionId.js";
import { SessionTokenHash } from "../../src/domain/session/sessionTokenHash.js";
import { SessionTokenPlaintext } from "../../src/domain/session/sessionTokenPlaintext.js";
import type { PasswordHasher } from "../../src/domain/user/passwordHasher.js";
import { PlaintextPassword } from "../../src/domain/user/plaintextPassword.js";
import type { UserCreated } from "../../src/domain/user/userEvent.js";
import { UserEmail } from "../../src/domain/user/userEmail.js";
import { UserName } from "../../src/domain/user/userName.js";
import { LogInUseCase } from "../../src/useCase/logInUseCase.js";
import { LogOutUseCase } from "../../src/useCase/logOutUseCase.js";
import { SetUpInitialAdminUseCase } from "../../src/useCase/setUpInitialAdminUseCase.js";
import { admin, at, day, eventContext, ids, passwordHash } from "../support/fixtures.js";

const now = at("2026-09-15T05:00:00.000Z");
const clock: Clock = { now: () => now, lunarDay: () => day(7) };
let sequence = 300;
const eventIdGenerator = { generate: () => eventContext(sequence++).eventId };
const sessionId = SessionId.schema.parse("40000000-0000-4000-8000-000000000001");
const token = {
  plaintext: SessionTokenPlaintext.schema.parse("a".repeat(64)),
  hash: SessionTokenHash.schema.parse("b".repeat(64)),
} as const;
const sessionTokenGenerator = { generate: () => token };
const password = PlaintextPassword.schema.parse("correct horse battery staple");

const passwordHasher = (verified: boolean, calls: string[] = []): PasswordHasher => ({
  hash: async () => passwordHash,
  verify: async (_password, hash) => {
    calls.push(hash.unwrap());
    return verified;
  },
});

describe("SetUpInitialAdminUseCase", () => {
  test("Admin の作成と session の作成を1回の store に渡し、8時間の session を返す", async () => {
    const stored: Array<readonly [UserCreated, SessionCreated]> = [];
    const result = await SetUpInitialAdminUseCase.create({
      initialAdminSetupStore: {
        store: (userEvent, sessionEvent) => {
          stored.push([userEvent, sessionEvent]);
          return okAsync(undefined);
        },
      },
      passwordHasher: passwordHasher(true),
      sessionTokenGenerator,
      clock,
      eventIdGenerator,
      userIdGenerator: { generate: () => ids.admin },
      sessionIdGenerator: { generate: () => sessionId },
    }).run({ email: UserEmail.schema.parse("admin@moonbase.test"), name: UserName.schema.parse("Admin"), password });

    expect(result._unsafeUnwrap()).toMatchObject({
      userId: ids.admin,
      sessionId,
      expiresAt: "2026-09-15T13:00:00.000Z",
    });
    expect(result._unsafeUnwrap().sessionToken.unwrap()).toBe(token.plaintext.unwrap());
    expect(stored).toHaveLength(1);
    expect(stored[0]?.[0].aggregateState.kind).toBe("Admin");
    expect(stored[0]?.[1].aggregateState.userId).toBe(ids.admin);
  });
});

describe("LogInUseCase", () => {
  const dependencies = (user: typeof admin | undefined, verified: boolean, calls: string[] = [], stored: SessionCreated[] = []) => ({
    userResolver: { resolveByEmail: () => okAsync(user) },
    sessionCreatedStore: {
      store: (...events: readonly SessionCreated[]) => {
        stored.push(...events);
        return okAsync(undefined);
      },
    },
    passwordHasher: passwordHasher(verified, calls),
    dummyPasswordHash: passwordHash,
    sessionTokenGenerator,
    clock,
    eventIdGenerator,
    sessionIdGenerator: { generate: () => sessionId },
  });

  test("正しい資格情報で session を作る", async () => {
    const stored: SessionCreated[] = [];
    const result = await LogInUseCase.create(dependencies(admin, true, [], stored)).run({ email: admin.email, password });
    expect(result._unsafeUnwrap()).toMatchObject({ userId: ids.admin, sessionId });
    expect(stored[0]?.aggregateState.tokenHash.unwrap()).toBe(token.hash.unwrap());
  });

  test("存在しないメールアドレスでも dummy hash で検証し、同じ InvalidCredentials を返す", async () => {
    const calls: string[] = [];
    const missing = await LogInUseCase.create(dependencies(undefined, false, calls)).run({ email: admin.email, password });
    const wrong = await LogInUseCase.create(dependencies(admin, false, calls)).run({ email: admin.email, password });
    expect(missing._unsafeUnwrapErr()).toEqual({ kind: "InvalidCredentials" });
    expect(wrong._unsafeUnwrapErr()).toEqual({ kind: "InvalidCredentials" });
    expect(calls).toHaveLength(2);
  });
});

describe("LogOutUseCase", () => {
  const session: Session = { sessionId, userId: ids.admin, tokenHash: token.hash, expiresAt: at("2026-09-15T13:00:00.000Z") };

  test("自分の session だけを削除できる", async () => {
    const stored: SessionDeleted[] = [];
    const dependencies = {
      sessionResolver: { resolveById: () => okAsync(session) },
      sessionDeletedStore: {
        store: (...events: readonly SessionDeleted[]) => {
          stored.push(...events);
          return okAsync(undefined);
        },
      },
      clock,
      eventIdGenerator,
    };
    expect((await LogOutUseCase.create(dependencies).run({ actorUserId: ids.admin, sessionId }))._unsafeUnwrap()).toEqual({ sessionId });
    expect(stored[0]?.kind).toBe("SessionDeleted");
    expect((await LogOutUseCase.create(dependencies).run({ actorUserId: ids.groundControl, sessionId }))._unsafeUnwrapErr()).toEqual({ kind: "Unauthorized", actorUserId: ids.groundControl });
    expect(
      (await LogOutUseCase.create({ ...dependencies, sessionResolver: { resolveById: () => okAsync(undefined) } }).run({ actorUserId: ids.admin, sessionId }))._unsafeUnwrapErr(),
    ).toEqual({ kind: "SessionNotFound", sessionId });
  });
});
