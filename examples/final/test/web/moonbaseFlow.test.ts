import { describe, expect, test } from "vitest";

import { domainEventsTable, permitsTable, segmentsTable } from "../../src/adaptor/secondary/sqlite/schema.js";
import {
  createStaffedHarness,
  createUser,
  credentials,
  page,
  post,
  postJson,
  recordEquipmentChecks,
  registerOperations,
  requestPermit,
} from "../support/webHarness.js";

const permitPath = "/permits/EVA-0412";

describe("船外作業許可の業務フロー", () => {
  test("申請から承認、出発、帰還、完了までを役割ごとに進め、状態に合う操作だけを出す", async () => {
    const { harness, adminCookie, groundControlCookie, baseCommanderCookie, electricianCookie } = await createStaffedHarness();
    await registerOperations(harness, groundControlCookie);

    const requestPage = await page(harness, "/permits/new", groundControlCookie);
    await expect(requestPage.json()).resolves.toMatchObject({
      component: "Permits/New",
      props: {
        zones: [{ zoneId: "PV-07", label: "PV-07 給電区間" }],
        workers: [
          { workerId: "W-01", qualification: "Electrician" },
          { workerId: "W-02", qualification: "General" },
        ],
      },
    });
    expect(JSON.stringify(await (await page(harness, "/permits/new", groundControlCookie)).json())).not.toContain("12000");

    await requestPermit(harness, groundControlCookie);
    const requested = await page(harness, permitPath, baseCommanderCookie);
    await expect(requested.json()).resolves.toMatchObject({
      component: "Permits/Show",
      props: {
        permit: { kind: "Requested", permitId: "EVA-0412", zoneId: "PV-07", crew: ["W-01", "W-02"], plannedMinutes: 120 },
        segment: { segmentId: "PV-07", lockout: { kind: "Energized" } },
        equipmentChecks: [],
        actions: { recordEquipmentCheck: true, approve: true, egress: false, returnToBase: false, close: false, abort: true },
      },
    });
    expect(JSON.stringify(await (await page(harness, permitPath, baseCommanderCookie)).json())).not.toContain("接続箱");

    // 条件1: 装備点検がまだない
    const noChecks = await post(harness, `${permitPath}/approve`, {}, baseCommanderCookie);
    expect(noChecks.headers.get("location")).toBe(`${permitPath}?error=equipment-check-missing`);
    await recordEquipmentChecks(harness, baseCommanderCookie);
    await expect((await page(harness, `${permitPath}?error=equipment-check-missing`, baseCommanderCookie)).json()).resolves.toMatchObject({
      props: {
        equipmentChecks: [
          { workerId: "W-01", oxygenMinutes: 200, needsMaintenance: false },
          { workerId: "W-02", oxygenMinutes: 200, needsMaintenance: false },
        ],
        errors: { form: expect.stringContaining("規程第2条") },
      },
    });
    expect(JSON.stringify(await (await page(harness, permitPath, baseCommanderCookie)).json())).not.toContain("スーツを点検した");

    // 条件6: 遮断札がまだない
    const noLockout = await post(harness, `${permitPath}/approve`, {}, baseCommanderCookie);
    expect(noLockout.headers.get("location")).toBe(`${permitPath}?error=segment-not-locked-out`);

    // 電気主任が札を掛ける。区画と区間の食い違いは拒む（事故報告 第3号）
    expect((await post(harness, "/segments", { segmentId: "PV-08", label: "PV-08 給電区間" }, groundControlCookie)).status).toBe(303);
    const mismatch = await post(harness, "/segments/PV-08/lockout", { permitId: "EVA-0412" }, electricianCookie);
    expect(mismatch.headers.get("location")).toBe("/segments/PV-08?error=zone-segment-mismatch");
    const lockedOut = await post(harness, "/segments/PV-07/lockout", { permitId: "EVA-0412" }, electricianCookie);
    expect(lockedOut.headers.get("location")).toBe("/segments/PV-07");
    await expect((await page(harness, "/segments/PV-07", electricianCookie)).json()).resolves.toMatchObject({
      component: "Segments/Form",
      props: {
        segment: { lockout: { kind: "LockedOut", permitId: "EVA-0412" } },
        actions: { lockout: false, release: true, edit: false, delete: false },
      },
    });

    // 条件7: 夜間は承認しない
    harness.setLunarDay(15);
    const night = await post(harness, `${permitPath}/approve`, {}, baseCommanderCookie);
    expect(night.headers.get("location")).toBe(`${permitPath}?error=night-time`);
    harness.setLunarDay(7);

    // 7条件がそろって承認
    harness.setTime("2026-09-15T02:00:00.000Z");
    const approvedResponse = await post(harness, `${permitPath}/approve`, {}, baseCommanderCookie);
    expect(approvedResponse.status).toBe(303);
    expect(approvedResponse.headers.get("location")).toBe(permitPath);
    await expect((await page(harness, permitPath, baseCommanderCookie)).json()).resolves.toMatchObject({
      props: {
        permit: { kind: "Approved", segmentId: "PV-07", approvedAt: "2026-09-15T02:00:00.000Z", approvalLunarDay: 7 },
        actions: { recordEquipmentCheck: false, approve: false, egress: true, returnToBase: false, close: false, abort: true },
      },
    });
    const approvedTwice = await post(harness, `${permitPath}/approve`, {}, baseCommanderCookie);
    expect(approvedTwice.headers.get("location")).toBe(`${permitPath}?error=invalid-state`);

    // 出発と帰還
    expect((await post(harness, `${permitPath}/egress`, {}, baseCommanderCookie)).status).toBe(303);
    await expect((await page(harness, permitPath, groundControlCookie)).json()).resolves.toMatchObject({
      props: {
        permit: { kind: "Outside" },
        actions: { egress: false, returnToBase: false, close: false, abort: false },
      },
    });
    const abortAfterEgress = await post(harness, `${permitPath}/abort`, { reason: "遅すぎる中止" }, groundControlCookie);
    expect(abortAfterEgress.headers.get("location")).toBe(`${permitPath}?error=invalid-state`);
    const releaseWhileOutside = await post(harness, "/segments/PV-07/release", {}, electricianCookie);
    expect(releaseWhileOutside.headers.get("location")).toBe("/segments/PV-07?error=permit-requires-lockout");

    const emergencyWithoutReason = await post(harness, `${permitPath}/return`, { returnKind: "Emergency", reason: "" }, baseCommanderCookie);
    await expect(emergencyWithoutReason.json()).resolves.toMatchObject({
      component: "Permits/Show",
      props: { errors: { reason: expect.any(String) } },
    });
    const returnedResponse = await post(harness, `${permitPath}/return`, { returnKind: "Emergency", reason: "スーツの圧力低下" }, baseCommanderCookie);
    expect(returnedResponse.status).toBe(303);
    const returnedPage = await (await page(harness, permitPath, electricianCookie)).json();
    expect(returnedPage).toMatchObject({
      props: {
        permit: { kind: "Returned", returnKind: "Emergency" },
        actions: { close: true, abort: false },
      },
    });
    expect(JSON.stringify(returnedPage)).not.toContain("圧力低下");

    // 完了。札を掛けた電気主任だけが外せる
    const electricianBCookie = await createUser(harness, adminCookie, credentials.electricianB, "Electrician");
    const closeByOther = await post(harness, `${permitPath}/close`, {}, electricianBCookie);
    expect(closeByOther.headers.get("location")).toBe(`${permitPath}?error=lockout-tagged-by-another-user`);
    const closeByCommander = await post(harness, `${permitPath}/close`, {}, baseCommanderCookie);
    expect(closeByCommander.status).toBe(403);
    const eventsBeforeClose = harness.database.select().from(domainEventsTable).all().length;
    const closed = await post(harness, `${permitPath}/close`, {}, electricianCookie);
    expect(closed.status).toBe(303);
    await expect((await page(harness, permitPath, adminCookie)).json()).resolves.toMatchObject({
      props: {
        permit: { kind: "Closed", segmentId: "PV-07" },
        segment: { lockout: { kind: "Energized" } },
        actions: { recordEquipmentCheck: false, approve: false, egress: false, returnToBase: false, close: false, abort: false },
      },
    });
    expect(harness.database.select().from(permitsTable).get()?.status).toBe("Closed");
    expect(harness.database.select().from(segmentsTable).all().map(({ lockoutStatus }) => lockoutStatus)).toEqual(["Energized", "Energized"]);
    const events = harness.database.select().from(domainEventsTable).all();
    expect(events.length).toBe(eventsBeforeClose + 2);
    expect(events.slice(-2).map(({ eventName }) => eventName)).toEqual(["segment.lockout-removed", "permit.closed"]);

    // 作業状況ボードと作業記録
    await expect((await page(harness, "/", groundControlCookie)).json()).resolves.toMatchObject({
      component: "Dashboard",
      props: {
        counts: { segments: 2, lockedOutSegments: 0, workers: 2, permits: 1, activePermits: 0 },
        activePermits: [],
        flareAlert: { kind: "Clear" },
      },
    });
    const eventsPage = await (await page(harness, "/events", adminCookie)).json();
    expect(eventsPage).toMatchObject({ component: "Events/Index" });
    const serializedEvents = JSON.stringify(eventsPage);
    expect(serializedEvents).toContain("permit.eva-approved");
    expect(serializedEvents).toContain('"lunarDay":7');
    for (const privateValue of ["12000", "8000", "接続箱", "圧力低下", "スーツを点検した", "moonbase.test"]) {
      expect(serializedEvents).not.toContain(privateValue);
    }
    expect((await page(harness, "/events", groundControlCookie)).status).toBe(403);
  });

  test("フレア警報、被ばく量、酸素残時間の条件はそれぞれの理由で承認を止める", async () => {
    const { harness, groundControlCookie, baseCommanderCookie, electricianCookie } = await createStaffedHarness();
    await registerOperations(harness, groundControlCookie, { exposureB: 49_900, alertLevel: "S2" });
    await requestPermit(harness, groundControlCookie);
    await recordEquipmentChecks(harness, baseCommanderCookie, "EVA-0412", 179);
    expect((await post(harness, "/segments/PV-07/lockout", { permitId: "EVA-0412" }, electricianCookie)).status).toBe(303);

    const oxygen = await post(harness, `${permitPath}/approve`, {}, baseCommanderCookie);
    expect(oxygen.headers.get("location")).toBe(`${permitPath}?error=insufficient-oxygen`);

    // 同じ許可で装備を再点検し、最新の酸素残時間で残りの承認条件を確認する
    await recordEquipmentChecks(harness, baseCommanderCookie, "EVA-0412", 200);

    const exposure = await post(harness, `${permitPath}/approve`, {}, baseCommanderCookie);
    expect(exposure.headers.get("location")).toBe(`${permitPath}?error=exposure-limit-exceeded`);
    await expect((await page(harness, `${permitPath}?error=exposure-limit-exceeded`, baseCommanderCookie)).json()).resolves.toMatchObject({
      props: { errors: { form: expect.stringContaining("規程第8条") } },
    });

    expect(
      (await post(harness, "/workers/W-02", { qualification: "General", radiationExposureMicroSv: "8000" }, groundControlCookie)).status,
    ).toBe(303);
    const flare = await post(harness, `${permitPath}/approve`, {}, baseCommanderCookie);
    expect(flare.headers.get("location")).toBe(`${permitPath}?error=flare-alert-active`);
    await expect((await page(harness, "/", baseCommanderCookie)).json()).resolves.toMatchObject({
      props: { flareAlert: { kind: "Active", level: "S2" } },
    });

    // 地上管制の外部システムが JSON で新しい報告を送る
    const cleared = await postJson(
      harness,
      "/space-weather",
      { issuedAt: "2026-09-15T01:20:00.000Z", alertLevel: "none", stations: ["GOES-19"] },
      groundControlCookie,
    );
    expect(cleared.status).toBe(303);
    const rejected = await postJson(
      harness,
      "/space-weather",
      { issuedAt: "yesterday", alertLevel: "X9", stations: "not-an-array" },
      groundControlCookie,
    );
    await expect(rejected.json()).resolves.toMatchObject({
      component: "SpaceWeather/Index",
      props: { errors: { issuedAt: expect.any(String), alertLevel: expect.any(String) } },
    });
    expect((await post(harness, `${permitPath}/approve`, {}, baseCommanderCookie)).headers.get("location")).toBe(permitPath);
  });

  test.each([
    { initialOxygen: 200, recheckedOxygen: 100, expectedState: "Requested", expectedLocation: `${permitPath}?error=insufficient-oxygen` },
    { initialOxygen: 100, recheckedOxygen: 200, expectedState: "Approved", expectedLocation: permitPath },
  ])("酸素残時間を $initialOxygen 分から $recheckedOxygen 分へ再点検したら最新の記録で承認を判断する", async ({ initialOxygen, recheckedOxygen, expectedState, expectedLocation }) => {
    const { harness, groundControlCookie, baseCommanderCookie, electricianCookie } = await createStaffedHarness();
    await registerOperations(harness, groundControlCookie);
    await requestPermit(harness, groundControlCookie);
    await recordEquipmentChecks(harness, baseCommanderCookie, "EVA-0412", initialOxygen);
    expect((await post(harness, "/segments/PV-07/lockout", { permitId: "EVA-0412" }, electricianCookie)).status).toBe(303);

    harness.setTime("2026-09-15T01:40:00.000Z");
    await recordEquipmentChecks(harness, baseCommanderCookie, "EVA-0412", recheckedOxygen);
    const response = await post(harness, `${permitPath}/approve`, {}, baseCommanderCookie);

    expect(response.headers.get("location")).toBe(expectedLocation);
    expect(harness.database.select().from(permitsTable).get()?.status).toBe(expectedState);
  });

  test("中止は出発前に理由付きでだけ行え、札は掛けた者が外して次の許可に備える", async () => {
    const { harness, groundControlCookie, baseCommanderCookie, electricianCookie } = await createStaffedHarness();
    await registerOperations(harness, groundControlCookie);
    await requestPermit(harness, groundControlCookie);
    expect((await post(harness, "/segments/PV-07/lockout", { permitId: "EVA-0412" }, electricianCookie)).status).toBe(303);

    const withoutReason = await post(harness, `${permitPath}/abort`, { reason: "" }, groundControlCookie);
    await expect(withoutReason.json()).resolves.toMatchObject({
      component: "Permits/Show",
      props: { errors: { reason: expect.any(String) } },
    });
    const byElectrician = await post(harness, `${permitPath}/abort`, { reason: "フレア警報の予報" }, electricianCookie);
    expect(byElectrician.status).toBe(403);
    const aborted = await post(harness, `${permitPath}/abort`, { reason: "フレア警報の予報" }, groundControlCookie);
    expect(aborted.status).toBe(303);
    const abortedPage = await (await page(harness, permitPath, baseCommanderCookie)).json();
    expect(abortedPage).toMatchObject({ props: { permit: { kind: "Aborted" }, actions: { approve: false, abort: false } } });
    expect(JSON.stringify(abortedPage)).not.toContain("予報");

    const released = await post(harness, "/segments/PV-07/release", {}, electricianCookie);
    expect(released.headers.get("location")).toBe("/segments/PV-07");
    expect(harness.database.select().from(segmentsTable).get()?.lockoutStatus).toBe("Energized");
    expect(JSON.stringify(harness.database.select().from(domainEventsTable).all())).not.toContain("予報");
  });
});
