import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterEach, expect, test } from "vitest";

import { moonbaseFixture } from "../../../fixtures/moonbase.js";
import { createDatabaseBackedApp } from "../../src/app.js";

const directories: string[] = [];

const inertiaHeaders = {
  Accept: "application/json",
  "X-Inertia": "true",
  "X-Inertia-Version": "1",
} as const;

const post = (
  app: ReturnType<typeof createDatabaseBackedApp>,
  path: string,
  body?: unknown,
) =>
  body === undefined
    ? app.request(path, { method: "POST", headers: inertiaHeaders })
    : app.request(path, {
        method: "POST",
        headers: { ...inertiaHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("file SQLite reopens the Session 03 approved state and leaking work log context", async () => {
  const directory = mkdtempSync(join(tmpdir(), "session-03-"));
  directories.push(directory);
  const options = {
    databasePath: join(directory, "moonbase.sqlite"),
    migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
    isProduction: false,
  } as const;
  const permitUrl = `/permits/${moonbaseFixture.permitId}`;
  const first = createDatabaseBackedApp(options);

  try {
    expect((await post(first, `${permitUrl}/approve`)).status).toBe(303);
  } finally {
    first.close();
  }

  const database = new Database(options.databasePath, { readonly: true });
  try {
    const permit = database
      .prepare("SELECT state FROM permits WHERE permit_id = ?")
      .get(moonbaseFixture.permitId) as Readonly<{ state: string }>;
    const workLog = database
      .prepare("SELECT event_name, payload FROM work_logs ORDER BY rowid DESC LIMIT 1")
      .get() as Readonly<{ event_name: string; payload: string }>;

    expect(JSON.parse(permit.state)).toMatchObject({
      kind: "Approved",
      segmentId: moonbaseFixture.segmentId,
    });
    expect(workLog.event_name).toBe("EvaApproved");
    expect(JSON.parse(workLog.payload)).toMatchObject({
      permit: { kind: "Approved" },
      crewDose: moonbaseFixture.crewDoseMicroSv,
    });
  } finally {
    database.close();
  }

  const second = createDatabaseBackedApp(options);
  try {
    const response = await second.request("/", { headers: inertiaHeaders });
    expect(await response.json()).toMatchObject({
      props: { permit: { kind: "Approved" } },
    });
  } finally {
    second.close();
  }
});
