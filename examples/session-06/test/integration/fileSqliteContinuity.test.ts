import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterEach, expect, test } from "vitest";
import { ZodError } from "zod";

import { moonbaseFixture } from "../../../fixtures/moonbase.js";
import { createDatabaseBackedApp } from "../../src/app.js";
import { PermitPersistenceError } from "../../src/adaptor/secondary/sqlite/permitPersistenceError.js";
import { createPermitRepository } from "../../src/adaptor/secondary/sqlite/permitRepository.js";
import {
  createSqliteDatabase,
  migrateDatabase,
} from "../../src/adaptor/secondary/sqlite/db.js";
import { SegmentId } from "../../src/domain/lockout/index.js";
import { approve, PermitId } from "../../src/domain/permit/index.js";
import { session06InitialPermit } from "../../src/web/routes.js";

const directories: string[] = [];

const inertiaHeaders = {
  Accept: "application/json",
  "X-Inertia": "true",
  "X-Inertia-Version": "1",
} as const;

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
const permitUrl = `/permits/${moonbaseFixture.permitId}`;

const createOptions = () => {
  const directory = mkdtempSync(join(tmpdir(), "session-06-"));
  directories.push(directory);

  return {
    databasePath: join(directory, "moonbase.sqlite"),
    migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
    isProduction: false,
  } as const;
};

const post = (
  app: ReturnType<typeof createDatabaseBackedApp>,
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

    return { state: permit.state, workLogCount: workLogCount.count };
  } finally {
    database.close();
  }
};

const seedRawPermit = (databasePath: string, migrationsFolder: string, state: string) => {
  const migrationDatabase = createSqliteDatabase(databasePath);
  try {
    migrateDatabase(migrationDatabase, migrationsFolder);
  } finally {
    migrationDatabase.close();
  }

  const seedDatabase = new Database(databasePath);
  try {
    seedDatabase
      .prepare(
        "INSERT INTO permits (permit_id, zone_id, status, state) VALUES (?, ?, ?, ?)",
      )
      .run(moonbaseFixture.permitId, moonbaseFixture.zoneId, "Requested", state);
  } finally {
    seedDatabase.close();
  }
};

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("file SQLite stores an approval work log payload without equipment checks", async () => {
  const options = createOptions();
  const app = createDatabaseBackedApp(options);

  try {
    expect((await post(app, `${permitUrl}/approve`)).status).toBe(303);
  } finally {
    app.close();
  }

  const database = new Database(options.databasePath, { readonly: true });
  try {
    const permit = database
      .prepare("SELECT state FROM permits WHERE permit_id = ?")
      .get(moonbaseFixture.permitId) as Readonly<{ state: string }>;
    const workLog = database
      .prepare("SELECT event_name, payload FROM work_logs ORDER BY rowid DESC LIMIT 1")
      .get() as Readonly<{ event_name: string; payload: string }>;
    const payload = JSON.parse(workLog.payload);

    expect(JSON.parse(permit.state)).toMatchObject({ kind: "Approved" });
    expect(workLog.event_name).toBe("EvaApproved");
    expect(payload).toEqual({
      permitId: moonbaseFixture.permitId,
      zoneId: moonbaseFixture.zoneId,
      segmentId: moonbaseFixture.segmentId,
      crew: [...moonbaseFixture.crew],
      approvedAt: moonbaseFixture.approvedAt,
      approvedBy: "base-commander",
    });
    expect(workLog.payload).not.toContain("oxygenMinutes");
  } finally {
    database.close();
  }
});

test("file SQLite restart keeps the approved state and work log history", async () => {
  const options = createOptions();
  const first = createDatabaseBackedApp(options);

  try {
    expect((await post(first, `${permitUrl}/approve`)).status).toBe(303);
  } finally {
    first.close();
  }

  const beforeRestart = observe(options.databasePath);
  expect(JSON.parse(beforeRestart.state)).toMatchObject({ kind: "Approved" });
  expect(beforeRestart.workLogCount).toBe(2);

  const restarted = createDatabaseBackedApp(options);
  try {
    const response = await restarted.request("/", { headers: inertiaHeaders });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      props: { permit: { kind: "Approved" } },
    });
  } finally {
    restarted.close();
  }

  expect(observe(options.databasePath)).toEqual(beforeRestart);
});

test("malformed persisted JSON is rejected as a ZodError", () => {
  const options = createOptions();
  seedRawPermit(options.databasePath, options.migrationsFolder, "{");

  const database = createSqliteDatabase(options.databasePath);
  try {
    const repository = createPermitRepository(database);
    expect(() =>
      repository.resolveById(PermitId.parse(moonbaseFixture.permitId)),
    ).toThrow(ZodError);
  } finally {
    database.close();
  }
});

test("structurally invalid persisted JSON is rejected as a ZodError", () => {
  const options = createOptions();
  seedRawPermit(
    options.databasePath,
    options.migrationsFolder,
    JSON.stringify({ kind: "Requested" }),
  );

  const database = createSqliteDatabase(options.databasePath);
  try {
    const repository = createPermitRepository(database);
    expect(() =>
      repository.resolveById(PermitId.parse(moonbaseFixture.permitId)),
    ).toThrow(ZodError);
  } finally {
    database.close();
  }
});

test("invalid approve identifiers return 500 without changing file SQLite", async () => {
  const options = createOptions();
  const first = createDatabaseBackedApp(options);
  first.close();
  const before = observe(options.databasePath);

  const invalidPermitApp = createDatabaseBackedApp(options);
  try {
    const response = await post(invalidPermitApp, "/permits/EVA-41/approve");
    expect(response.status).toBe(500);
  } finally {
    invalidPermitApp.close();
  }
  expect(observe(options.databasePath)).toEqual(before);

  const invalidSegmentApp = createDatabaseBackedApp(options);
  try {
    const response = await post(invalidSegmentApp, `${permitUrl}/approve`, {
      ...approveBody,
      segmentId: "PV7",
    });
    expect(response.status).toBe(500);
  } finally {
    invalidSegmentApp.close();
  }
  expect(observe(options.databasePath)).toEqual(before);
});

test("SQLite work log failures preserve the saved state and expose a exposure-free persistence error", () => {
  const options = createOptions();
  const migrationDatabase = createSqliteDatabase(options.databasePath);
  try {
    migrateDatabase(migrationDatabase, options.migrationsFolder);
  } finally {
    migrationDatabase.close();
  }

  const triggerDatabase = new Database(options.databasePath);
  try {
    triggerDatabase.exec(`
      CREATE TRIGGER fail_eva_approved_log
      BEFORE INSERT ON work_logs
      WHEN NEW.event_name = 'EvaApproved'
      BEGIN
        SELECT RAISE(FAIL, 'W-04 radiation exposure 44000 microSv');
      END;
    `);
  } finally {
    triggerDatabase.close();
  }

  const database = createSqliteDatabase(options.databasePath);
  try {
    const repository = createPermitRepository(database);
    repository.seedIfEmpty(session06InitialPermit);
    const next = approve(
      session06InitialPermit,
      {
        segmentId: SegmentId.parse(moonbaseFixture.segmentId),
        equipmentChecks: [
          { ...equipmentChecks[0]!, workerId: session06InitialPermit.crew[0] },
          { ...equipmentChecks[1]!, workerId: session06InitialPermit.crew[1] },
        ],
        approvedBy: "base-commander",
      },
      moonbaseFixture.approvedAt,
    );

    let thrown: unknown;
    try {
      repository.save(next);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(PermitPersistenceError);
    expect(thrown).toMatchObject({
      operation: "append-work-log",
      message: "Permit persistence failed: append-work-log",
    });
    expect((thrown as Error).message).not.toContain("44000");
  } finally {
    database.close();
  }

  const persisted = observe(options.databasePath);
  expect(JSON.parse(persisted.state)).toMatchObject({
    permitId: moonbaseFixture.permitId,
    kind: "Approved",
  });
  expect(persisted.workLogCount).toBe(1);
});
