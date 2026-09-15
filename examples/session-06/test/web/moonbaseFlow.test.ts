import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { moonbaseFixture } from "../../../fixtures/moonbase.js";
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

describe("Session 06 Web application", () => {
  let app: App;

  beforeEach(() => {
    app = createApp();
  });

  afterEach(() => {
    app.close();
  });

  it("例外ベースの開始承認use caseを通って完了まで進む", async () => {
    expect(await page(app)).toMatchObject({
      props: { sessionLabel: "Session 06", permit: { kind: "Requested" } },
    });
    await post(app, `${permitUrl}/approve`);
    await post(app, `${permitUrl}/egress`);
    await post(app, `${permitUrl}/return`);
    await post(app, `${permitUrl}/close`);

    expect(await page(app)).toMatchObject({
      props: { permit: { kind: "Closed" } },
    });
  });

  it("古い端末から送られた状態不正をcatchし損ねて500になる", async () => {
    await post(app, `${permitUrl}/approve`);
    const invalidState = await post(app, `${permitUrl}/approve`);

    expect(invalidState.status).toBe(500);
    expect(await invalidState.text()).toBe("Internal Server Error");
  });

  it("書式に合わない系統区間を境界で拒否する", async () => {
    const response = await post(app, `${permitUrl}/approve`, {
      ...approveBody,
      segmentId: "PV7",
    });

    expect(response.status).toBe(500);
    expect(await page(app)).toMatchObject({
      props: { permit: { kind: "Requested" } },
    });
  });

  it("starterが例外メッセージで許可なしだけをnoticeへ変換する", async () => {
    const missing = await post(app, "/permits/EVA-9999/approve");

    expect(missing.headers.get("location")).toBe("/?notice=not-found");
  });

  it("未実装操作とresetを扱う", async () => {
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
