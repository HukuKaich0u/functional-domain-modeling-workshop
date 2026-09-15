import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { count, sql } from "drizzle-orm";
import { afterEach, describe, expect, test } from "vitest";

import { createSqliteDatabase, migrateDatabase } from "../../src/adaptor/secondary/sqlite/db.js";
import {
  domainEventsTable,
  installationTable,
  permitsTable,
  segmentsTable,
  sessionsTable,
  usersTable,
} from "../../src/adaptor/secondary/sqlite/schema.js";
import { createPermitByIdResolver } from "../../src/adaptor/secondary/sqlite/resolver/permitResolver.js";
import { createInitialAdminSetupStore } from "../../src/adaptor/secondary/sqlite/store/initialAdminSetupStore.js";
import { createLockoutReleaseStore } from "../../src/adaptor/secondary/sqlite/store/lockoutReleaseStore.js";
import { createPermitEventStore } from "../../src/adaptor/secondary/sqlite/store/permitEventStore.js";
import {
  createLockoutTaggedStore,
  createSegmentRegisteredStore,
} from "../../src/adaptor/secondary/sqlite/store/segmentEventStore.js";
import { createApp, createApplicationDependencies } from "../../src/app.js";
import { EvaPermit } from "../../src/domain/permit/index.js";
import { Segment } from "../../src/domain/segment/index.js";
import { Session } from "../../src/domain/session/session.js";
import { SessionId } from "../../src/domain/session/sessionId.js";
import { SessionTokenHash } from "../../src/domain/session/sessionTokenHash.js";
import { User } from "../../src/domain/user/user.js";
import { admin, at, day, energizedSegment, eventContext, ids, requested } from "../support/fixtures.js";

const temporaryDirectories: string[] = [];
const inertiaHeaders = {
  Accept: "application/json",
  "X-Inertia": "true",
  "X-Inertia-Version": "1",
} as const;

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

const temporaryDatabasePath = (prefix: string): string => {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return join(directory, "moonbase.sqlite");
};

describe("file SQLite application smoke", () => {
  test("新しいファイルへ migration を当て、初期設定を実アプリ経由で保存する", async () => {
    const databasePath = temporaryDatabasePath("moonbase-final-");
    const database = createSqliteDatabase(databasePath);

    migrateDatabase(database);
    migrateDatabase(database);

    expect(existsSync(databasePath)).toBe(true);
    expect(
      database
        .all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
        .map(({ name }) => name),
    ).toEqual(
      expect.arrayContaining([
        "__drizzle_migrations",
        "domain_events",
        "equipment_checks",
        "installation",
        "permits",
        "segments",
        "sessions",
        "space_weather_reports",
        "users",
        "workers",
      ]),
    );

    const app = createApp(
      createApplicationDependencies(database, {
        clock: { now: () => at("2026-09-15T04:30:00.000Z"), lunarDay: () => day(7) },
        isProduction: false,
      }),
    );
    const beforeSetup = await app.request("/", { headers: inertiaHeaders });
    expect(beforeSetup.status).toBe(302);
    expect(beforeSetup.headers.get("location")).toBe("/setup");

    const setupResponse = await app.request("/setup", {
      method: "POST",
      body: new URLSearchParams({
        email: "admin@moonbase.test",
        name: "System Admin",
        password: "correct horse battery staple",
      }),
      headers: {
        ...inertiaHeaders,
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "http://localhost",
      },
    });

    expect(setupResponse.status).toBe(302);
    expect(setupResponse.headers.get("location")).toBe("/");
    expect(setupResponse.headers.get("set-cookie")).toContain("moonbase_session=");

    const secondConnection = createSqliteDatabase(databasePath);
    const persistedAdmin = secondConnection.select().from(usersTable).get();
    expect(persistedAdmin).toMatchObject({ email: "admin@moonbase.test", name: "System Admin", role: "Admin" });
    expect(secondConnection.select({ value: count() }).from(installationTable).get()).toEqual({ value: 1 });
    expect(secondConnection.select({ value: count() }).from(sessionsTable).get()).toEqual({ value: 1 });
    const persistedEvents = secondConnection.select().from(domainEventsTable).all();
    expect(persistedEvents.map(({ eventName }) => eventName).sort()).toEqual(["session.created", "user.created"]);
    expect(persistedEvents.every(({ lunarDay }) => lunarDay === 7)).toBe(true);
    const serializedEvents = JSON.stringify(persistedEvents);
    for (const privateValue of [
      "admin@moonbase.test",
      "System Admin",
      persistedAdmin?.passwordHash,
      secondConnection.select().from(sessionsTable).get()?.tokenHash,
    ]) {
      expect(serializedEvents).not.toContain(privateValue);
    }
  });

  test("2件目の作業記録の挿入が失敗すると、marker、Admin、session、記録がすべて巻き戻る", async () => {
    const database = createSqliteDatabase(temporaryDatabasePath("moonbase-final-rollback-"));
    migrateDatabase(database);
    const duplicateContext = eventContext(1, { actorUserId: ids.admin });
    const userEvent = User.create(duplicateContext)(admin);
    const sessionEvent = Session.create(duplicateContext)({
      sessionId: SessionId.schema.parse("70000000-0000-4000-8000-000000000001"),
      userId: ids.admin,
      tokenHash: SessionTokenHash.schema.parse("a".repeat(64)),
      expiresAt: at("2026-09-15T13:00:00.000Z"),
    });

    await expect(createInitialAdminSetupStore(database).store(userEvent, sessionEvent)).rejects.toThrow();

    expect(database.select({ value: count() }).from(installationTable).get()).toEqual({ value: 0 });
    expect(database.select({ value: count() }).from(usersTable).get()).toEqual({ value: 0 });
    expect(database.select({ value: count() }).from(sessionsTable).get()).toEqual({ value: 0 });
    expect(database.select({ value: count() }).from(domainEventsTable).get()).toEqual({ value: 0 });
  });

  test("既存の作業許可を保ちながら再 migration し、別の接続から完了済の状態を復元する", async () => {
    const databasePath = temporaryDatabasePath("moonbase-final-closed-");
    const database = createSqliteDatabase(databasePath);
    migrateDatabase(database);
    const permitStore = createPermitEventStore(database);
    (await createSegmentRegisteredStore(database).store(Segment.register(eventContext(1))(energizedSegment)))._unsafeUnwrap();
    (await permitStore.store(EvaPermit.request(eventContext(2))(requested)))._unsafeUnwrap();
    const tagged = Segment.tagLockout(eventContext(3, { actorUserId: ids.electrician }))(energizedSegment, ids.permit);
    (await createLockoutTaggedStore(database).store(tagged))._unsafeUnwrap();
    const approvedEvent = EvaPermit.approve(eventContext(4))(requested, { segmentId: ids.segment });
    const egressedEvent = EvaPermit.egress(eventContext(5))(approvedEvent.aggregateState);
    const returnedEvent = EvaPermit.returnToBase(eventContext(6))(egressedEvent.aggregateState, { kind: "Planned" });
    (await permitStore.store(approvedEvent, egressedEvent, returnedEvent))._unsafeUnwrap();
    const existingEventIds = database.select({ eventId: domainEventsTable.eventId }).from(domainEventsTable).all();

    migrateDatabase(database);
    (
      await createLockoutReleaseStore(database).store(
        Segment.removeLockout(eventContext(7, { actorUserId: ids.electrician }))(tagged.aggregateState),
        EvaPermit.close(eventContext(8, { actorUserId: ids.electrician }))(returnedEvent.aggregateState),
      )
    )._unsafeUnwrap();

    const secondConnection = createSqliteDatabase(databasePath);
    expect((await createPermitByIdResolver(secondConnection).resolveById(ids.permit))._unsafeUnwrap()).toMatchObject({
      kind: "Closed",
      segmentId: ids.segment,
      closedAt: eventContext(8).occurredAt,
    });
    expect(secondConnection.select().from(permitsTable).all()).toHaveLength(1);
    expect(secondConnection.select().from(segmentsTable).get()?.lockoutStatus).toBe("Energized");
    expect(secondConnection.select({ eventId: domainEventsTable.eventId }).from(domainEventsTable).all()).toEqual(
      expect.arrayContaining(existingEventIds),
    );
    expect(secondConnection.select().from(domainEventsTable).all()).toHaveLength(8);
  });
});
