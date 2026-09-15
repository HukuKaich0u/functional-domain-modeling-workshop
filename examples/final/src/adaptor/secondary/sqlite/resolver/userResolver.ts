import { eq } from "drizzle-orm";
import { ResultAsync } from "neverthrow";
import { z } from "zod";

import type {
  UserByEmailResolver,
  UserByIdResolver,
  UserListResolver,
} from "../../../../domain/user/userResolver.js";
import { PasswordHash } from "../../../../domain/user/passwordHash.js";
import { UserEmail } from "../../../../domain/user/userEmail.js";
import { UserId } from "../../../../domain/user/userId.js";
import { UserName } from "../../../../domain/user/userName.js";
import { UserRoleSchema } from "../../../../domain/user/userRole.js";
import type { User } from "../../../../domain/user/user.js";
import type { SqliteDatabase } from "../db.js";
import { usersTable } from "../schema.js";

const UserRowSchema = z.object({
  kind: UserRoleSchema,
  userId: UserId.schema,
  email: UserEmail.schema,
  name: UserName.schema,
  passwordHash: PasswordHash.schema,
});

const parseRow = (row: typeof usersTable.$inferSelect): User =>
  UserRowSchema.parse({ ...row, kind: row.role });

export const createUserByIdResolver = (db: SqliteDatabase): UserByIdResolver => ({
  resolveById: (userId) =>
    ResultAsync.fromSafePromise(
      Promise.resolve().then(() => {
        const row = db.select().from(usersTable).where(eq(usersTable.userId, userId)).get();
        return row === undefined ? undefined : parseRow(row);
      }),
    ),
});

export const createUserByEmailResolver = (db: SqliteDatabase): UserByEmailResolver => ({
  resolveByEmail: (email) =>
    ResultAsync.fromSafePromise(
      Promise.resolve().then(() => {
        const row = db.select().from(usersTable).where(eq(usersTable.email, email.unwrap())).get();
        return row === undefined ? undefined : parseRow(row);
      }),
    ),
});

export const createUserListResolver = (db: SqliteDatabase): UserListResolver => ({
  resolveAll: () =>
    ResultAsync.fromSafePromise(
      Promise.resolve().then(() => db.select().from(usersTable).all().map(parseRow)),
    ),
});
