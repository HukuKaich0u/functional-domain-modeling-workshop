import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import type { Hono } from "hono";
import { afterEach, expect, test } from "vitest";
import { ZodError } from "zod";

import { moonbaseFixture } from "../../../fixtures/moonbase.js";
import * as session07App from "../../src/app.js";
import type { PermitPersistenceError } from "../../src/adaptor/secondary/sqlite/permitPersistenceError.js";
import { createPermitStore } from "../../src/adaptor/secondary/sqlite/permitStore.js";
import { createSqliteDatabase } from "../../src/adaptor/secondary/sqlite/db.js";
import { EventId } from "../../src/domain/aggregate/eventId.js";
import { SegmentId } from "../../src/domain/lockout/index.js";
import { EvaPermit, PermitId } from "../../src/domain/permit/index.js";
import { FlareAlert } from "../../src/domain/spaceWeather/index.js";
import { RadiationExposure } from "../../src/domain/worker/index.js";
import { approveEvaWithEffects } from "../../src/useCase/approveEva.js";
import { session07InitialPermit } from "../../src/web/routes.js";

const directories: string[] = [];

const inertiaHeaders = {
  Accept: "application/json",
  "X-Inertia": "true",
  "X-Inertia-Version": "1",
} as const;

type DatabaseBackedApp = Hono & Readonly<{ close: () => void }>;
type DatabaseBackedAppOptions = Readonly<{
  databasePath: string;
  migrationsFolder: string;
  isProduction: boolean;
}>;
type DatabaseBackedAppFactory = (
  options: DatabaseBackedAppOptions,
) => DatabaseBackedApp;

const createDatabaseBackedApp = Reflect.get(
  session07App,
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
    { ...equipmentChecks[0]!, workerId: session07InitialPermit.crew[0] },
    { ...equipmentChecks[1]!, workerId: session07InitialPermit.crew[1] },
  ],
  approvedBy: "base-commander",
} as const;
const environment = {
  exposures: {
    resolve: (workerId: string) =>
      RadiationExposure.of(moonbaseFixture.crewExposureMicroSv[workerId] ?? 0),
  },
  spaceWeather: { currentAlert: () => FlareAlert.clear },
} as const;
const permitUrl = `/permits/${moonbaseFixture.permitId}`;

const createOptions = (): DatabaseBackedAppOptions => {
  const directory = mkdtempSync(join(tmpdir(), "session-07-"));
  directories.push(directory);

  return {
    databasePath: join(directory, "moonbase.sqlite"),
    migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
    isProduction: false,
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
    const workLogCount = database
      .prepare("SELECT count(*) AS count FROM work_logs")
      .get() as Readonly<{ count: number }>;

    return { workLogCount: workLogCount.count, state: permit.state };
  } finally {
    database.close();
  }
};

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("file SQLite maps an absent permit to the not-found notice", async () => {
  const app = createDatabaseBackedApp(createOptions());
  try {
    const response = await post(app, "/permits/EVA-9999/approve");

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/?notice=not-found");
  } finally {
    app.close();
  }
});

test("file SQLite maps an already approved permit to the invalid-state notice", async () => {
  const app = createDatabaseBackedApp(createOptions());
  try {
    expect((await post(app, `${permitUrl}/approve`)).status).toBe(303);
    const response = await post(app, `${permitUrl}/approve`);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/?notice=invalid-state");
  } finally {
    app.close();
  }
});

test("SQLite work log failure leaves the approved state without a work log entry", async () => {
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
    expect((await post(app, `${permitUrl}/approve`)).status).toBe(500);
  } finally {
    app.close();
  }

  const persisted = observe(options.databasePath);
  expect(JSON.parse(persisted.state)).toMatchObject({ kind: "Approved" });
  expect(persisted.workLogCount).toBe(1);
});

test("corrupt persisted state rejects the effectful use case as a ZodError", async () => {
  const options = createOptions();
  const seeded = createDatabaseBackedApp(options);
  seeded.close();

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
    const store = createPermitStore(database, session07InitialPermit);
    const effect = approveEvaWithEffects({
      ...environment,
      resolver: store,
      stateStore: store.stateStore,
      workLog: store.workLog,
    });

    await expect(
      effect({ permitId: PermitId.parse(moonbaseFixture.permitId), ...approveInput }),
    ).rejects.toBeInstanceOf(ZodError);
  } finally {
    database.close();
  }
});

test("atomic store rejects the SQLite work log failure and rolls back the state", async () => {
  const options = createOptions();
  const seeded = createDatabaseBackedApp(options);
  seeded.close();

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
    const store = createPermitStore(database, session07InitialPermit);
    const event = EvaPermit.approve({
      eventId: EventId.parse(moonbaseFixture.eventId),
      occurredAt: moonbaseFixture.approvedAt,
      lunarDay: moonbaseFixture.lunarDay,
    })(session07InitialPermit, approveInput);

    await expect(store.atomicStore.store(event)).rejects.toMatchObject({
      kind: "PermitPersistenceError",
      operation: "append-work-log",
    } satisfies Partial<PermitPersistenceError>);
  } finally {
    database.close();
  }

  const persisted = observe(options.databasePath);
  expect(JSON.parse(persisted.state)).toMatchObject({ kind: "Requested" });
  expect(persisted.workLogCount).toBe(1);
});
