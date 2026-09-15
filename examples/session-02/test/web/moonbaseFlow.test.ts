import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { moonbaseFixture } from "../../../fixtures/moonbase.js";
import {
  createSqliteDatabase,
  migrateDatabase,
} from "../../src/adaptor/secondary/sqlite/db.js";
import { createApp } from "../../src/app.js";

const inertiaHeaders = {
  Accept: "application/json",
  "X-Inertia": "true",
  "X-Inertia-Version": "1",
} as const;

type App = ReturnType<typeof createApp>;

const post = (app: App, path: string) =>
  app.request(path, { method: "POST", headers: inertiaHeaders });

const page = async (app: App) => {
  const response = await app.request("/", { headers: inertiaHeaders });
  expect(response.status).toBe(200);
  return response.json();
};

const createTestApp = (): App => {
  const database = createSqliteDatabase(":memory:");
  migrateDatabase(database);

  return createApp(database);
};

const permitUrl = `/permits/${moonbaseFixture.permitId}`;

describe("Session 02 Web application", () => {
  let app: App;

  beforeEach(() => {
    app = createTestApp();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("未改善の通常操作が帰還済みを作業中へ戻してしまう", async () => {
    expect((await post(app, `${permitUrl}/approve`)).status).toBe(303);
    expect((await post(app, `${permitUrl}/egress`)).status).toBe(303);
    expect((await post(app, `${permitUrl}/return`)).status).toBe(303);
    expect(await page(app)).toMatchObject({
      component: "MoonbaseDashboard",
      props: { permit: { kind: "Returned" } },
    });

    expect((await post(app, `${permitUrl}/egress`)).status).toBe(303);
    expect(await page(app)).toMatchObject({
      component: "MoonbaseDashboard",
      props: {
        permit: { kind: "Outside" },
        actions: {
          approve: { kind: "Available" },
          egress: { kind: "Available" },
          returnToBase: { kind: "Available" },
          close: { kind: "Available" },
          abort: { kind: "Available" },
          exportRollCall: { kind: "NotImplemented" },
        },
      },
    });
  });

  it("事故 route から未知の status を保存して警告する", async () => {
    expect((await post(app, "/demo/incidents/unknown-status")).status).toBe(303);

    const inspection = (await page(app)).props.incidentLab.inspection;
    expect(inspection.permitJson).toContain('"status": "waiting-for-sunrise"');
    expect(inspection.warnings).toContain("想定外の作業許可の状態が保存されています");
  });

  it("事故 route から作業区画と違う系統区間を保存して警告する", async () => {
    await post(app, "/demo/reset");
    expect((await post(app, "/demo/incidents/swap-identifiers")).status).toBe(303);

    const inspection = (await page(app)).props.incidentLab.inspection;
    expect(inspection.permitJson).toContain(
      `"segmentId": "${moonbaseFixture.wrongSegmentId}"`,
    );
    expect(inspection.warnings).toContain("遮断した系統区間と作業区画が一致しません");
  });

  it("名前だけの入力境界から不正な宇宙天気の報告を保存してしまう", async () => {
    await post(app, "/demo/reset");
    expect(
      (await post(app, "/demo/incidents/malformed-space-weather")).status,
    ).toBe(303);

    const permitJson = (await page(app)).props.incidentLab.inspection.permitJson;
    expect(permitJson).toContain('"alertLevel": "X9"');
    expect(permitJson).toContain('"stations": "not-an-array"');
  });

  it("存在しない作業許可を Error 本文で判定し状態不正 notice へ誤分類する", async () => {
    const response = await post(app, "/demo/incidents/missing-permit");

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/?notice=invalid-state");
  });

  it("開始承認を繰り返すたびに Date と UUID を処理内で生成してしまう", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T01:00:00.000Z"));
    const response = post(app, "/demo/incidents/repeat-approve");

    await vi.advanceTimersByTimeAsync(10);
    expect((await response).status).toBe(303);

    const workLogs = JSON.parse(
      (await page(app)).props.incidentLab.inspection.workLogJson,
    ) as Array<{ eventId: string; eventName: string; occurredAt: string }>;
    const repeatedLogs = workLogs.slice(-2);

    expect(repeatedLogs.map(({ eventName }) => eventName)).toEqual([
      "eva.approved",
      "eva.approved",
    ]);
    expect(repeatedLogs[0]?.eventId).not.toBe(repeatedLogs[1]?.eventId);
    expect(repeatedLogs[0]?.occurredAt).not.toBe(repeatedLogs[1]?.occurredAt);
  });

  it("作業記録 payload に作業員の累積線量を表示してしまう", async () => {
    await post(app, `${permitUrl}/approve`);
    const currentPage = await page(app);
    const workLogJson = currentPage.props.incidentLab.inspection.workLogJson;

    expect(workLogJson).toContain("44000");
    expect(currentPage.props.incidentLab.inspection.warnings).toContain(
      "作業記録に作業員の累積線量が含まれています",
    );
  });

  it("5つの固定事故操作だけを表示する", async () => {
    const scenarios = (await page(app)).props.incidentLab.scenarios;

    expect(
      scenarios.map(({ action }: { action: { href: string } }) => action.href),
    ).toEqual([
      "/demo/incidents/unknown-status",
      "/demo/incidents/swap-identifiers",
      "/demo/incidents/malformed-space-weather",
      "/demo/incidents/missing-permit",
      "/demo/incidents/repeat-approve",
    ]);
  });

  it("点呼表の出力を固定 notice へリダイレクトする", async () => {
    const response = await post(app, "/reports/roll-call");

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/?notice=not-implemented");
  });

  it("reset 後は同じ fixture の申請済の状態と初期記録へ戻る", async () => {
    await post(app, `${permitUrl}/approve`);

    const response = await post(app, "/demo/reset");

    expect(response.status).toBe(303);
    expect(await page(app)).toMatchObject({
      props: {
        permit: { permitId: moonbaseFixture.permitId, kind: "Requested" },
      },
    });
    expect(
      JSON.parse((await page(app)).props.incidentLab.inspection.workLogJson),
    ).toHaveLength(1);
  });

  it("未知の障害を内部情報のない 500 へ変換する", async () => {
    const response = await post(app, "/permits/secret-permit-id/approve");

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Internal Server Error");
  });
});
