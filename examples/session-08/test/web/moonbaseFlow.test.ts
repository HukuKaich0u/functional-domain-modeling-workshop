import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { moonbaseFixture } from "../../../fixtures/moonbase.js";
import { createStaticSpaceWeather } from "../../src/adaptor/staticSpaceWeather.js";
import { createFixtureCrewDoseResolver } from "../../src/adaptor/fixtureCrewDoseResolver.js";
import { createApp } from "../../src/app.js";

const inertiaHeaders = {
  Accept: "application/json",
  "X-Inertia": "true",
  "X-Inertia-Version": "1",
} as const;
type App = ReturnType<typeof createApp>;
const approveBody = {
  segmentId: moonbaseFixture.segmentId,
  equipmentChecks: moonbaseFixture.crew.map((workerId) => ({
    workerId,
    oxygenMinutes: moonbaseFixture.oxygenMinutes,
    checkedAt: moonbaseFixture.checkedAt,
  })),
  approvedBy: "base-commander",
} as const;
const post = (
  app: App,
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
const page = async (app: App) => {
  const response = await app.request("/", { headers: inertiaHeaders });
  expect(response.status).toBe(200);
  return response.json();
};
const permitUrl = `/permits/${moonbaseFixture.permitId}`;

describe("Session 08 Web application", () => {
  let app: App;

  beforeEach(() => {
    app = createApp();
  });

  afterEach(() => {
    app.close();
  });

  it("原子的なイベント保存use caseから完了まで進む", async () => {
    await post(app, `${permitUrl}/approve`);
    await post(app, `${permitUrl}/egress`);
    await post(app, `${permitUrl}/return`);
    await post(app, `${permitUrl}/close`);

    expect(await page(app)).toMatchObject({
      props: {
        sessionLabel: "Session 08",
        permit: { kind: "Closed" },
      },
    });
  });

  it("予期可能な状態エラーを固定noticeへ変換する", async () => {
    await post(app, `${permitUrl}/approve`);
    const response = await post(app, `${permitUrl}/approve`);

    expect(response.headers.get("location")).toBe("/?notice=invalid-state");
  });

  it("許可なしを専用noticeへ変換する", async () => {
    const response = await post(app, "/permits/EVA-9999/approve");

    expect(response.headers.get("location")).toBe("/?notice=not-found");
  });

  it("線量上限、フレア警報、夜間をそれぞれ専用noticeへ変換する", async () => {
    const doseApp = createApp({
      doses: createFixtureCrewDoseResolver({ "W-03": 31_500, "W-04": 49_900 }),
    });
    const flareApp = createApp({
      spaceWeather: createStaticSpaceWeather({
        kind: "Active",
        level: "S2",
        issuedAt: moonbaseFixture.requestedAt,
      }),
    });
    const nightApp = createApp({
      clock: { now: () => moonbaseFixture.approvedAt, lunarDay: () => 15 },
    });
    try {
      expect(
        (await post(doseApp, `${permitUrl}/approve`)).headers.get("location"),
      ).toBe("/?notice=dose-limit");
      expect(
        (await post(flareApp, `${permitUrl}/approve`)).headers.get("location"),
      ).toBe("/?notice=flare-alert");
      expect(
        (await post(nightApp, `${permitUrl}/approve`)).headers.get("location"),
      ).toBe("/?notice=night");
    } finally {
      doseApp.close();
      flareApp.close();
      nightApp.close();
    }
  });

  it("未実装操作とresetを共通URLで扱う", async () => {
    expect(
      (await post(app, "/reports/roll-call")).headers.get("location"),
    ).toBe("/?notice=not-implemented");
    await post(app, `${permitUrl}/approve`);
    await post(app, "/demo/reset");
    expect(await page(app)).toMatchObject({
      props: { permit: { kind: "Requested" } },
    });
  });
});
