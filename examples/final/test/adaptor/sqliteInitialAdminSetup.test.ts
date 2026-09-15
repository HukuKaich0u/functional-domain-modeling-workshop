import { count } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { createSqliteDatabase, migrateDatabase } from "../../src/adaptor/secondary/sqlite/db.js";
import { createInstallationStatusQuery } from "../../src/adaptor/secondary/sqlite/query/installationStatusQuery.js";
import { domainEventsTable, installationTable, sessionsTable, usersTable } from "../../src/adaptor/secondary/sqlite/schema.js";
import { createInitialAdminSetupStore } from "../../src/adaptor/secondary/sqlite/store/initialAdminSetupStore.js";
import { Session } from "../../src/domain/session/session.js";
import { SessionId } from "../../src/domain/session/sessionId.js";
import { SessionTokenHash } from "../../src/domain/session/sessionTokenHash.js";
import { User } from "../../src/domain/user/user.js";
import { admin, at, eventContext, ids } from "../support/fixtures.js";

const sessionOf = (sequence: number) =>
  Session.create(eventContext(sequence, { actorUserId: ids.admin }))({
    sessionId: SessionId.schema.parse(`60000000-0000-4000-8000-${sequence.toString().padStart(12, "0")}`),
    userId: ids.admin,
    tokenHash: SessionTokenHash.schema.parse("c".repeat(64)),
    expiresAt: at("2026-09-15T13:00:00.000Z"),
  });

describe("initial admin setup store", () => {
  test("installation marker、Admin、session、2件の作業記録を1つの transaction で確定する", async () => {
    const db = createSqliteDatabase(":memory:");
    migrateDatabase(db);
    expect((await createInstallationStatusQuery(db).get())._unsafeUnwrap()).toEqual({ kind: "InitialSetupAvailable" });

    const result = await createInitialAdminSetupStore(db).store(User.create(eventContext(1, { actorUserId: ids.admin }))(admin), sessionOf(2));

    expect(result.isOk()).toBe(true);
    expect(db.select({ value: count() }).from(installationTable).get()).toEqual({ value: 1 });
    expect(db.select({ value: count() }).from(usersTable).get()).toEqual({ value: 1 });
    expect(db.select({ value: count() }).from(sessionsTable).get()).toEqual({ value: 1 });
    expect(db.select().from(domainEventsTable).all().map(({ eventName }) => eventName)).toEqual(["user.created", "session.created"]);
    expect((await createInstallationStatusQuery(db).get())._unsafeUnwrap()).toEqual({ kind: "Installed" });
    expect(JSON.stringify(db.select().from(domainEventsTable).all())).not.toContain("moonbase.test");
  });

  test("二人目は InitialAdminAlreadyExists で拒み、何も追加しない", async () => {
    const db = createSqliteDatabase(":memory:");
    migrateDatabase(db);
    const store = createInitialAdminSetupStore(db);
    (await store.store(User.create(eventContext(1, { actorUserId: ids.admin }))(admin), sessionOf(2)))._unsafeUnwrap();

    const second = await store.store(
      User.create(eventContext(3, { actorUserId: ids.groundControl }))({ ...admin, userId: ids.groundControl }),
      sessionOf(4),
    );

    expect(second._unsafeUnwrapErr()).toEqual({ kind: "InitialAdminAlreadyExists" });
    expect(db.select({ value: count() }).from(usersTable).get()).toEqual({ value: 1 });
    expect(db.select({ value: count() }).from(domainEventsTable).get()).toEqual({ value: 2 });
  });
});
