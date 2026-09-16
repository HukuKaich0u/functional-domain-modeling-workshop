import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { moonbaseFixture } from "../../../fixtures/moonbase.js";
import { createFixtureCrewExposureResolver } from "../../src/adaptor/fixtureCrewExposureResolver.js";
import { createStaticSpaceWeather } from "../../src/adaptor/staticSpaceWeather.js";
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

describe("Session 07 Web application", () => {
  let app: App;

  beforeEach(() => {
    app = createApp();
  });

  afterEach(() => {
    app.close();
  });

  it("非決定値と2回保存を含むuse caseを画面操作から実行する", async () => {
    expect((await post(app, `${permitUrl}/approve`)).status).toBe(303);

    expect(await page(app)).toMatchObject({
      props: {
        sessionLabel: "Session 07",
        permit: { kind: "Approved" },
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

  it("被ばく量が安全上限を超えた場合とフレア警報をそれぞれ専用noticeへ変換する", async () => {
    const exposureApp = createApp({
      exposures: createFixtureCrewExposureResolver({ "W-03": 31_500, "W-04": 49_900 }),
    });
    const flareApp = createApp({
      spaceWeather: createStaticSpaceWeather({
        kind: "Active",
        level: "S2",
        issuedAt: moonbaseFixture.requestedAt,
      }),
    });
    try {
      expect(
        (await post(exposureApp, `${permitUrl}/approve`)).headers.get("location"),
      ).toBe("/?notice=exposure-limit");
      expect(
        (await post(flareApp, `${permitUrl}/approve`)).headers.get("location"),
      ).toBe("/?notice=flare-alert");
    } finally {
      exposureApp.close();
      flareApp.close();
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
