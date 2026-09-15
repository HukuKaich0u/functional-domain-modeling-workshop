import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";

import { moonbaseFixture } from "../../fixtures/moonbase.js";
import {
  snapshotScenarios,
  type SnapshotApp,
  type SnapshotScenario,
} from "./snapshotScenario.js";

export const inertiaHeaders = {
  Accept: "application/json",
  "X-Inertia": "true",
  "X-Inertia-Version": "1",
} as const;

export const permitUrl = `/permits/${moonbaseFixture.permitId}`;

export const approveBody = {
  segmentId: moonbaseFixture.segmentId,
  equipmentChecks: moonbaseFixture.crew.map((workerId) => ({
    workerId,
    oxygenMinutes: moonbaseFixture.oxygenMinutes,
    checkedAt: moonbaseFixture.checkedAt,
  })),
  approvedBy: "base-commander",
} as const;

export const post = (
  app: SnapshotApp,
  path: string,
  body: unknown = path.endsWith("/approve") ? approveBody : undefined,
): Promise<Response> =>
  body === undefined
    ? app.request(path, { method: "POST", headers: inertiaHeaders })
    : app.request(path, {
        method: "POST",
        headers: { ...inertiaHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

export const createTemporaryDatabases = (prefix: string) => {
  const directories: string[] = [];

  return {
    createDatabasePath: (name: string): string => {
      const directory = mkdtempSync(join(tmpdir(), `${prefix}-${name}-`));
      directories.push(directory);
      return join(directory, "moonbase.sqlite");
    },
    cleanup: (): void => {
      for (const directory of directories.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  };
};

export const closeIfSupported = (app: SnapshotApp): void => {
  if (typeof app.close === "function") app.close();
};

export const scenarioFor = (name: SnapshotScenario["name"]): SnapshotScenario => {
  const scenario = snapshotScenarios.find((candidate) => candidate.name === name);
  if (scenario === undefined) throw new Error(`Snapshot scenario is missing: ${name}`);
  return scenario;
};

export const scenarioSlug = (name: SnapshotScenario["name"]): string =>
  name.replace(" ", "-").toLowerCase();

export const normalizeApprovedEventName = (eventName: string): string =>
  eventName === "eva.approved" ? "EvaApproved" : eventName;

export const installWorkLogFailureTrigger = (
  databasePath: string,
  triggerName: string,
  eventName: string,
): void => {
  const database = new Database(databasePath);
  try {
    database.exec(`
      CREATE TRIGGER ${triggerName}
      BEFORE INSERT ON work_logs
      WHEN NEW.event_name = '${eventName}'
      BEGIN
        SELECT RAISE(FAIL, 'forced work log failure');
      END;
    `);
  } finally {
    database.close();
  }
};
