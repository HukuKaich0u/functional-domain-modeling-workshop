import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import type { Hono } from "hono";
import { afterEach, expect, test } from "vitest";
import { ZodError } from "zod";

import { moonbaseFixture } from "../../../fixtures/moonbase.js";
import * as session08App from "../../src/app.js";
import type { PermitPersistenceError } from "../../src/adaptor/secondary/sqlite/permitPersistenceError.js";
import { createSqliteDatabase } from "../../src/adaptor/secondary/sqlite/db.js";
import { createEvaApprovedStore } from "../../src/adaptor/secondary/sqlite/evaApprovedStore.js";
import type { Clock } from "../../src/domain/aggregate/clock.js";
import { EventId } from "../../src/domain/aggregate/eventId.js";
import type { EventIdGenerator } from "../../src/domain/aggregate/eventIdGenerator.js";
import { SegmentId } from "../../src/domain/lockout/index.js";
import { EvaPermit, PermitId } from "../../src/domain/permit/index.js";
import { FlareAlert } from "../../src/domain/spaceWeather/index.js";
import { RadiationExposure } from "../../src/domain/worker/index.js";
import { approveEvaWithEffects } from "../../src/useCase/approveEva.js";
import { session08InitialPermit } from "../../src/web/routes.js";

const directories: string[] = [];
const eventId = EventId.parse("77777777-7777-4777-8777-777777777777");
const occurredAt = "2026-09-15T02:00:00.000Z";
const lunarDay = 1;

const inertiaHeaders = {
  Accept: "application/json",
  "X-Inertia": "true",
  "X-Inertia-Version": "1",
} as const;

type DatabaseBackedApp = Hono & Readonly<{ close: () => void }>;
type DatabaseBackedAppOptions = Readonly<{
  clock: Clock;
  databasePath: string;
  eventIdGenerator: EventIdGenerator;
  isProduction: boolean;
  migrationsFolder: string;
}>;
type DatabaseBackedAppFactory = (
  options: DatabaseBackedAppOptions,
) => DatabaseBackedApp;

const createDatabaseBackedApp = Reflect.get(
  session08App,
  "createDatabaseBackedApp",
) as DatabaseBackedAppFactory;

const equipmentChecks = moonbaseFixture.crew.map((workerId) => ({
  workerId,
  oxygenMinutes: moonbaseFixture.oxygenMinutes,
  checkedAt: moonbaseFixture.checkedAt,
}));
const approveBody = {
  segmentId: moonbaseFixture.segmentId,
  equipmentChecks,
  approvedBy: "base-commander",
} as const;
const approveInput = {
  segmentId: SegmentId.parse(moonbaseFixture.segmentId),
  equipmentChecks: [
    { ...equipmentChecks[0]!, workerId: session08InitialPermit.crew[0] },
    { ...equipmentChecks[1]!, workerId: session08InitialPermit.crew[1] },
  ],
  approvedBy: "base-commander",
} as const;
const environment = {
  exposures: {
    resolve: (workerId: string) =>
      RadiationExposure.of(
        (moonbaseFixture.crewExposureMicroSv as Record<string, number>)[workerId] ?? 0,
      ),
  },
  spaceWeather: { currentAlert: () => FlareAlert.clear },
  clock: { now: () => occurredAt, lunarDay: () => lunarDay },
  eventIdGenerator: { generate: () => eventId },
} as const;

const createOptions = (): DatabaseBackedAppOptions => {
  const directory = mkdtempSync(join(tmpdir(), "session-08-"));
  directories.push(directory);

  return {
    clock: { now: () => occurredAt, lunarDay: () => lunarDay },
    databasePath: join(directory, "moonbase.sqlite"),
    eventIdGenerator: { generate: () => eventId },
    isProduction: false,
    migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
  };
};

const post = (
  app: DatabaseBackedApp,
  path: string,
  body: unknown = path.endsWith("/approve") ? approveBody : undefined,
) =>
  body === undefined
    ? app.request(path, { method: "POST", headers: inertiaHeaders })
    : app.request(path, {
        method: "POST",
        headers: { ...inertiaHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

const observe = (databasePath: string) => {
  const database = new Database(databasePath, { readonly: true });
  try {
    const permit = database
      .prepare("SELECT state FROM permits WHERE permit_id = ?")
      .get(moonbaseFixture.permitId) as Readonly<{ state: string }>;
    const workLogs = database
      .prepare(
        "SELECT event_id AS eventId, occurred_at AS occurredAt, lunar_day AS lunarDay, payload FROM work_logs WHERE event_name = 'EvaApproved'",
      )
      .all() as ReadonlyArray<
      Readonly<{ eventId: string; occurredAt: string; lunarDay: number; payload: string }>
    >;
    const workLogCount = database
      .prepare("SELECT count(*) AS count FROM work_logs")
      .get() as Readonly<{ count: number }>;

    return {
      permit: JSON.parse(permit.state),
      workLogCount: workLogCount.count,
      workLogs,
    };
  } finally {
    database.close();
  }
};

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("file SQLite persists the injected event ID, clock value, and lunar day", async () => {
  const options = createOptions();
  const app = createDatabaseBackedApp(options);
  try {
    expect(
      (await post(app, `/permits/${moonbaseFixture.permitId}/approve`)).status,
    ).toBe(303);
  } finally {
    app.close();
  }

  expect(observe(options.databasePath)).toMatchObject({
    permit: { kind: "Approved", approvedAt: occurredAt },
    workLogs: [{ eventId, occurredAt, lunarDay }],
  });
});

test("SQLite work log payload excludes equipment checks and anything outside the work log DTO", async () => {
  const options = createOptions();
  const checkSentinel = "exposure: 44000 microSv";
  const app = createDatabaseBackedApp(options);
  app.close();

  const database = createSqliteDatabase(options.databasePath);
  try {
    const store = createEvaApprovedStore(database, session08InitialPermit);
    const event = EvaPermit.approve({ eventId, occurredAt, lunarDay })(
      session08InitialPermit,
      {
        ...approveInput,
        equipmentChecks: [
          { ...approveInput.equipmentChecks[0], checkedAt: checkSentinel },
          approveInput.equipmentChecks[1],
        ],
      },
    );

    expect((await store.store(event)).isOk()).toBe(true);
  } finally {
    database.close();
  }

  const workLog = observe(options.databasePath).workLogs[0];
  expect(workLog === undefined ? undefined : JSON.parse(workLog.payload)).toEqual({
    permitId: moonbaseFixture.permitId,
    zoneId: moonbaseFixture.zoneId,
    segmentId: moonbaseFixture.segmentId,
    crew: [...moonbaseFixture.crew],
    approvedAt: occurredAt,
    approvedBy: "base-commander",
  });
  expect(workLog?.payload).not.toContain(checkSentinel);
  expect(workLog?.payload).not.toContain("oxygenMinutes");
});

test("SQLite work log failure returns 500 and rolls back the approved state", async () => {
  const options = createOptions();
  const initialApp = createDatabaseBackedApp(options);
  initialApp.close();

  const triggerDatabase = new Database(options.databasePath);
  try {
    triggerDatabase.exec(`
      CREATE TRIGGER fail_eva_approved_log
      BEFORE INSERT ON work_logs
      WHEN NEW.event_name = 'EvaApproved'
      BEGIN
        SELECT RAISE(FAIL, 'forced work log failure');
      END;
    `);
  } finally {
    triggerDatabase.close();
  }

  const app = createDatabaseBackedApp(options);
  try {
    expect(
      (await post(app, `/permits/${moonbaseFixture.permitId}/approve`)).status,
    ).toBe(500);
  } finally {
    app.close();
  }

  expect(observe(options.databasePath)).toMatchObject({
    permit: { kind: "Requested" },
    workLogCount: 1,
    workLogs: [],
  });
});

test("the SQLite store returns a business conflict after the current row has changed", async () => {
  const options = createOptions();
  const seededApp = createDatabaseBackedApp(options);
  seededApp.close();

  const database = createSqliteDatabase(options.databasePath);
  try {
    const store = createEvaApprovedStore(database, session08InitialPermit);
    const event = EvaPermit.approve({ eventId, occurredAt, lunarDay })(
      session08InitialPermit,
      approveInput,
    );

    expect((await store.store(event)).isOk()).toBe(true);
    await expect(store.store(event)).resolves.toMatchObject({
      error: {
        kind: "PermitConflict",
        permitId: PermitId.parse(moonbaseFixture.permitId),
      },
    });
  } finally {
    database.close();
  }
});

test("the SQLite store preserves the current Requested fields when it commits a stale event", async () => {
  const options = createOptions();
  const seededApp = createDatabaseBackedApp(options);
  seededApp.close();

  const database = createSqliteDatabase(options.databasePath);
  try {
    const store = createEvaApprovedStore(database, session08InitialPermit);
    const staleEvent = EvaPermit.approve({ eventId, occurredAt, lunarDay })(
      { ...session08InitialPermit, requestedAt: "2026-09-14T23:00:00.000Z" },
      approveInput,
    );
    store.save({ ...session08InitialPermit, plannedMinutes: 120 });

    expect((await store.store(staleEvent)).isOk()).toBe(true);
  } finally {
    database.close();
  }

  expect(observe(options.databasePath).permit).toMatchObject({
    kind: "Approved",
    plannedMinutes: 120,
    requestedAt: moonbaseFixture.requestedAt,
    approvedAt: occurredAt,
    segmentId: moonbaseFixture.segmentId,
  });
});

test("corrupt persisted state rejects the effectful use case as a ZodError", async () => {
  const options = createOptions();
  const seededApp = createDatabaseBackedApp(options);
  seededApp.close();

  const corruptingDatabase = new Database(options.databasePath);
  try {
    corruptingDatabase
      .prepare("UPDATE permits SET state = ? WHERE permit_id = ?")
      .run("{", moonbaseFixture.permitId);
  } finally {
    corruptingDatabase.close();
  }

  const database = createSqliteDatabase(options.databasePath);
  try {
    const store = createEvaApprovedStore(database, session08InitialPermit);

    await expect(
      approveEvaWithEffects({
        ...environment,
        resolver: store,
        store,
      })({
        permitId: PermitId.parse(moonbaseFixture.permitId),
        ...approveInput,
      }),
    ).rejects.toBeInstanceOf(ZodError);
  } finally {
    database.close();
  }
});

test("the SQLite store rejects work log failures instead of returning a business result", async () => {
  const options = createOptions();
  const seededApp = createDatabaseBackedApp(options);
  seededApp.close();

  const triggerDatabase = new Database(options.databasePath);
  try {
    triggerDatabase.exec(`
      CREATE TRIGGER fail_eva_approved_log
      BEFORE INSERT ON work_logs
      WHEN NEW.event_name = 'EvaApproved'
      BEGIN
        SELECT RAISE(FAIL, 'forced work log failure');
      END;
    `);
  } finally {
    triggerDatabase.close();
  }

  const database = createSqliteDatabase(options.databasePath);
  try {
    const store = createEvaApprovedStore(database, session08InitialPermit);
    const event = EvaPermit.approve({ eventId, occurredAt, lunarDay })(
      session08InitialPermit,
      approveInput,
    );

    await expect(store.store(event)).rejects.toMatchObject({
      kind: "PermitPersistenceError",
      operation: "append-work-log",
    } satisfies Partial<PermitPersistenceError>);
  } finally {
    database.close();
  }

  expect(observe(options.databasePath)).toMatchObject({
    permit: { kind: "Requested" },
    workLogCount: 1,
    workLogs: [],
  });
});
