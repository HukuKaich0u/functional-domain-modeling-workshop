import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { moonbaseFixture } from "../../../fixtures/moonbase.js";
import { createDatabaseBackedApp } from "../../src/app.js";

const inertiaHeaders = {
  Accept: "application/json",
  "X-Inertia": "true",
  "X-Inertia-Version": "1",
} as const;

type App = ReturnType<typeof createDatabaseBackedApp>;

const approveBody = {
  segmentId: moonbaseFixture.segmentId,
  equipmentChecks: moonbaseFixture.crew.map((workerId) => ({
    workerId,
    oxygenMinutes: moonbaseFixture.oxygenMinutes,
    checkedAt: moonbaseFixture.checkedAt,
  })),
  approvedBy: "base-commander",
} as const;

const post = (app: App, path: string, body?: unknown) =>
  body === undefined
    ? app.request(path, { method: "POST", headers: inertiaHeaders })
    : app.request(path, {
        method: "POST",
        headers: { ...inertiaHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

const page = async (app: App) => {
  const response = await app.request("/", { headers: inertiaHeaders });
  expect(response.status).toBe(200);
  return response.json();
};

describe("Session 05 Web application", () => {
  let app: App;
  let directory: string;
  const permitUrl = `/permits/${moonbaseFixture.permitId}`;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "session-05-web-"));
    app = createDatabaseBackedApp({
      databasePath: join(directory, "moonbase.sqlite"),
      migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
      isProduction: false,
    });
  });

  afterEach(() => {
    app.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("用途別IDと入力境界を通って完了まで操作できる", async () => {
    expect(await page(app)).toMatchObject({
      props: { sessionLabel: "Session 05", permit: { kind: "Requested" } },
    });
    await post(app, `${permitUrl}/approve`, approveBody);
    await post(app, `${permitUrl}/egress`);
    await post(app, `${permitUrl}/return`);
    await post(app, `${permitUrl}/close`);

    expect(await page(app)).toMatchObject({
      props: { permit: { kind: "Closed" } },
    });
  });

  it("starterの未検証境界が書式に合わない系統区間を受け入れる問題を再現する", async () => {
    const response = await post(app, `${permitUrl}/approve`, {
      ...approveBody,
      segmentId: "PV7",
    });

    expect(response.status).toBe(303);
    expect(await page(app)).toMatchObject({
      props: { permit: { kind: "Approved" } },
    });
  });

  it("帰還記録前の完了を拒否し、未実装操作とresetを扱う", async () => {
    expect((await post(app, `${permitUrl}/close`)).status).toBe(500);
    expect(
      (await post(app, "/reports/roll-call")).headers.get("location"),
    ).toBe("/?notice=not-implemented");

    await post(app, `${permitUrl}/approve`, approveBody);
    await post(app, "/demo/reset");
    expect(await page(app)).toMatchObject({
      props: { permit: { kind: "Requested" } },
    });
  });
});
