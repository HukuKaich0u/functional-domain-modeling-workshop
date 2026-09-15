import { errAsync, okAsync } from "neverthrow";
import { describe, expect, test } from "vitest";

import type { Clock } from "../../src/domain/aggregate/clock.js";
import type { PasswordHasher } from "../../src/domain/user/passwordHasher.js";
import { PlaintextPassword } from "../../src/domain/user/plaintextPassword.js";
import type { User } from "../../src/domain/user/user.js";
import type { UserCreated, UserDeleted, UserPasswordReset, UserUpdated } from "../../src/domain/user/userEvent.js";
import { UserEmail } from "../../src/domain/user/userEmail.js";
import { UserName } from "../../src/domain/user/userName.js";
import { CreateUserUseCase } from "../../src/useCase/createUserUseCase.js";
import { DeleteUserUseCase } from "../../src/useCase/deleteUserUseCase.js";
import { ListUsersUseCase } from "../../src/useCase/listUsersUseCase.js";
import { ResetUserPasswordUseCase } from "../../src/useCase/resetUserPasswordUseCase.js";
import { UpdateUserUseCase } from "../../src/useCase/updateUserUseCase.js";
import { admin, at, baseCommander, day, electrician, eventContext, groundControl, ids, passwordHash } from "../support/fixtures.js";

const clock: Clock = { now: () => at("2026-09-15T06:00:00.000Z"), lunarDay: () => day(7) };
let sequence = 400;
const eventIdGenerator = { generate: () => eventContext(sequence++).eventId };
const users = [admin, groundControl, baseCommander, electrician];
const userByIdResolver = { resolveById: (userId: User["userId"]) => okAsync(users.find((user) => user.userId === userId)) };
const userByEmailResolver = {
  resolveByEmail: (email: User["email"]) => okAsync(users.find((user) => user.email.unwrap() === email.unwrap())),
};
const userListResolver = { resolveAll: () => okAsync(users) };
const passwordHasher: PasswordHasher = { hash: async () => passwordHash, verify: async () => true };
const collecting = <T>(stored: T[]) => ({
  store: (...events: readonly T[]) => {
    stored.push(...events);
    return okAsync(undefined);
  },
});

describe("ユーザー管理", () => {
  test("一覧は Admin だけが見られ、パスワードハッシュを含まない表現を返す", async () => {
    const useCase = ListUsersUseCase.create({ userByIdResolver, userListResolver });
    const result = await useCase.run({ actorUserId: ids.admin });
    expect(result._unsafeUnwrap().users.map((user) => user.kind)).toEqual(["Admin", "GroundControl", "BaseCommander", "Electrician"]);
    expect(result._unsafeUnwrap().users[0]).not.toHaveProperty("passwordHash");
    expect((await useCase.run({ actorUserId: ids.groundControl }))._unsafeUnwrapErr().kind).toBe("Unauthorized");
  });

  test("作成は役割を受け取り、メールアドレスの重複を拒む", async () => {
    const stored: UserCreated[] = [];
    const useCase = CreateUserUseCase.create({
      userByIdResolver,
      userByEmailResolver,
      userCreatedStore: collecting(stored),
      passwordHasher,
      clock,
      eventIdGenerator,
      userIdGenerator: { generate: () => ids.electricianB },
    });
    const created = await useCase.run({
      actorUserId: ids.admin,
      email: UserEmail.schema.parse("electrician-b@moonbase.test"),
      name: UserName.schema.parse("Electrician b"),
      password: PlaintextPassword.schema.parse("electrician password value"),
      role: "Electrician",
    });
    expect(created._unsafeUnwrap().user).toMatchObject({ kind: "Electrician", userId: ids.electricianB });
    expect(stored).toHaveLength(1);
    const duplicate = await useCase.run({
      actorUserId: ids.admin,
      email: groundControl.email,
      name: UserName.schema.parse("dup"),
      password: PlaintextPassword.schema.parse("another password value"),
      role: "GroundControl",
    });
    expect(duplicate._unsafeUnwrapErr()).toEqual({ kind: "UserEmailAlreadyExists" });
  });

  test("更新は保存側の CannotDowngradeLastAdmin をそのまま返す", async () => {
    const stored: UserUpdated[] = [];
    const base = { userByIdResolver, userByEmailResolver, userUpdatedStore: collecting(stored), clock, eventIdGenerator };
    const input = { actorUserId: ids.admin, targetUserId: ids.groundControl, email: groundControl.email, name: groundControl.name, role: "BaseCommander" as const };
    expect((await UpdateUserUseCase.create(base).run(input))._unsafeUnwrap().user.kind).toBe("BaseCommander");
    expect(
      (await UpdateUserUseCase.create({
        ...base,
        userUpdatedStore: { store: () => errAsync({ kind: "CannotDowngradeLastAdmin" } as const) },
      }).run({ ...input, targetUserId: ids.admin, email: admin.email, name: admin.name, role: "GroundControl" }))._unsafeUnwrapErr(),
    ).toEqual({ kind: "CannotDowngradeLastAdmin" });
  });

  test("削除は自分自身と最後の Admin を拒む", async () => {
    const stored: UserDeleted[] = [];
    const useCase = DeleteUserUseCase.create({ userByIdResolver, userListResolver, userDeletedStore: collecting(stored), clock, eventIdGenerator });
    expect((await useCase.run({ actorUserId: ids.admin, targetUserId: ids.admin }))._unsafeUnwrapErr()).toEqual({ kind: "CannotDeleteSelf" });
    expect((await useCase.run({ actorUserId: ids.admin, targetUserId: ids.electrician }))._unsafeUnwrap()).toEqual({ userId: ids.electrician });
    const secondAdmin = { ...admin, userId: ids.electricianB };
    const twoAdmins = DeleteUserUseCase.create({
      userByIdResolver: { resolveById: (userId) => okAsync([admin, secondAdmin].find((user) => user.userId === userId)) },
      userListResolver: { resolveAll: () => okAsync([admin, secondAdmin]) },
      userDeletedStore: collecting(stored),
      clock,
      eventIdGenerator,
    });
    expect((await twoAdmins.run({ actorUserId: ids.admin, targetUserId: ids.electricianB })).isOk()).toBe(true);
    const lastAdmin = DeleteUserUseCase.create({
      userByIdResolver: { resolveById: (userId) => okAsync([secondAdmin, groundControl].find((user) => user.userId === userId)) },
      userListResolver: { resolveAll: () => okAsync([secondAdmin, groundControl]) },
      userDeletedStore: collecting(stored),
      clock,
      eventIdGenerator,
    });
    expect((await lastAdmin.run({ actorUserId: ids.groundControl, targetUserId: ids.electricianB }))._unsafeUnwrapErr().kind).toBe("Unauthorized");
  });

  test("パスワードの再設定は Admin だけが行い、ハッシュを差し替える", async () => {
    const stored: UserPasswordReset[] = [];
    const useCase = ResetUserPasswordUseCase.create({
      userResolver: userByIdResolver,
      userPasswordResetStore: collecting(stored),
      passwordHasher,
      clock,
      eventIdGenerator,
    });
    const result = await useCase.run({ actorUserId: ids.admin, targetUserId: ids.baseCommander, password: PlaintextPassword.schema.parse("new password value 12") });
    expect(result._unsafeUnwrap().user.userId).toBe(ids.baseCommander);
    expect(stored[0]?.kind).toBe("UserPasswordReset");
    expect((await useCase.run({ actorUserId: ids.baseCommander, targetUserId: ids.baseCommander, password: PlaintextPassword.schema.parse("new password value 12") }))._unsafeUnwrapErr().kind).toBe("Unauthorized");
  });
});
