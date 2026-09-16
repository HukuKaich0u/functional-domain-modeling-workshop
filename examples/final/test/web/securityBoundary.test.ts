import { createElement, type ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import Dashboard from "../../src/adaptor/primary/web/pages/Dashboard.js";
import EventsIndex from "../../src/adaptor/primary/web/pages/Events/Index.js";
import PermitsIndex from "../../src/adaptor/primary/web/pages/Permits/Index.js";
import PermitNew from "../../src/adaptor/primary/web/pages/Permits/New.js";
import PermitShow from "../../src/adaptor/primary/web/pages/Permits/Show.js";
import SegmentForm from "../../src/adaptor/primary/web/pages/Segments/Form.js";
import SpaceWeatherIndex from "../../src/adaptor/primary/web/pages/SpaceWeather/Index.js";
import WorkersIndex from "../../src/adaptor/primary/web/pages/Workers/Index.js";
import type { PermitPageView } from "../../src/adaptor/primary/web/routes/permitRoutes.js";
import { toPermitView } from "../../src/useCase/permitView.js";
import type { User } from "../../src/domain/user/user.js";
import { approved, at, ids, outside, requested, returned } from "../support/fixtures.js";

const renderPage = async <TProps extends object>(component: ComponentType<TProps>, props: TProps): Promise<string> =>
  renderToString(createElement(component, props));
const shared = (role: User["kind"]) => ({
  auth: { user: { userId: ids.admin, role } },
  flash: {},
  errors: {},
});
const requestedView = toPermitView(requested);
const noActions = { recordEquipmentCheck: false, approve: false, egress: false, returnToBase: false, close: false, abort: false };

describe("Permit page view の型", () => {
  test("画面向けの表現に作業内容や理由は含まれない", () => {
    const view = toPermitView(returned);
    expect(view).not.toHaveProperty("purpose");
    expect(view).not.toHaveProperty("returnRecord");
    expect(view).toMatchObject({ kind: "Returned", returnKind: "Planned" });
    const invalid = {
      ...toPermitView(requested),
      kind: "Requested",
      // @ts-expect-error Requested の表現は approvedBy を持たない
      approvedBy: ids.baseCommander,
    } as const satisfies PermitPageView;
    expect(invalid.kind).toBe("Requested");
  });
});

describe("MoonBase page SSR", () => {
  test("役割ごとのナビゲーションだけを描く", async () => {
    const dashboardProps = {
      counts: { segments: 0, lockedOutSegments: 0, workers: 0, permits: 0, activePermits: 0 },
      activePermits: [],
      lockedOutSegments: [],
      flareAlert: null,
    };
    const adminHtml = await renderPage(Dashboard, { ...shared("Admin"), ...dashboardProps });
    expect(adminHtml).toContain('href="/permits"');
    expect(adminHtml).toContain('href="/segments"');
    expect(adminHtml).toContain('href="/workers"');
    expect(adminHtml).toContain('href="/space-weather"');
    expect(adminHtml).toContain('href="/users"');
    expect(adminHtml).toContain('href="/events"');
    expect(adminHtml).toContain("MoonBase 日の出基地");
    expect(adminHtml).not.toContain("どうぶつ病院");

    const groundControlHtml = await renderPage(Dashboard, { ...shared("GroundControl"), ...dashboardProps });
    expect(groundControlHtml).toContain('href="/workers"');
    expect(groundControlHtml).not.toContain('href="/users"');
    expect(groundControlHtml).not.toContain('href="/events"');

    const commanderHtml = await renderPage(Dashboard, { ...shared("BaseCommander"), ...dashboardProps });
    expect(commanderHtml).toContain('href="/permits"');
    expect(commanderHtml).not.toContain('href="/workers"');

    const electricianHtml = await renderPage(Dashboard, { ...shared("Electrician"), ...dashboardProps });
    expect(electricianHtml).toContain('href="/segments"');
    expect(electricianHtml).not.toContain('href="/workers"');
    expect(electricianHtml).not.toContain('href="/events"');
  });

  test("作業状況ボードは進行中の許可、遮断中の区間、フレア警報だけを描く", async () => {
    const html = await renderPage(Dashboard, {
      ...shared("Admin"),
      counts: { segments: 3, lockedOutSegments: 1, workers: 4, permits: 2, activePermits: 1 },
      activePermits: [toPermitView(outside)],
      lockedOutSegments: [
        {
          segmentId: ids.segment,
          label: "PV-07 給電区間" as never,
          lockout: { kind: "LockedOut", permitId: ids.permit, taggedBy: ids.electrician, taggedAt: at("2026-09-15T00:05:00.000Z") },
        },
      ],
      flareAlert: { kind: "Active", level: "S2", issuedAt: at("2026-09-15T00:00:00.000Z") },
    });
    expect(html).toContain("<dt>系統区間</dt><dd>3</dd>");
    expect(html).toContain("<dt>遮断中</dt><dd>1</dd>");
    expect(html).toContain("作業中");
    expect(html).toContain("Outside");
    expect(html).toContain("フレア警報 S2 発令中");
    expect(html).toContain('href="/segments/PV-07"');
    expect(html).not.toContain("接続箱");
  });

  test("作業許可の一覧と申請フォームは役割に応じた導線とエラー表示を持つ", async () => {
    const groundControlList = await renderPage(PermitsIndex, { ...shared("GroundControl"), permits: [requestedView], canRequest: true });
    expect(groundControlList).toContain('href="/permits/new"');
    expect(groundControlList).toContain("申請済");
    expect(groundControlList).toContain("Requested");
    expect(groundControlList).toContain("W-01 / W-02");
    const commanderList = await renderPage(PermitsIndex, { ...shared("BaseCommander"), permits: [requestedView], canRequest: false });
    expect(commanderList).not.toContain('href="/permits/new"');

    const form = await renderPage(PermitNew, {
      ...shared("GroundControl"),
      zones: [{ zoneId: "PV-07", label: "PV-07 給電区間" }],
      workers: [{ workerId: "W-01", qualification: "Electrician" }],
      errors: {
        permitId: "番号を確認してください。",
        zoneId: "区画を確認してください。",
        crewA: "隊員を確認してください。",
        crewB: "相方を確認してください。",
        plannedMinutes: "時間を確認してください。",
        purpose: "内容を確認してください。",
      },
    });
    expect(form).toContain('aria-label="入力エラー"');
    for (const field of ["permitId", "zoneId", "crewA", "crewB", "plannedMinutes", "purpose"]) {
      expect(form).toContain(`aria-describedby="${field}-error"`);
    }
    expect(form).not.toContain("µSv");
  });

  test("作業許可の詳細は状態と役割に合う操作だけを描き、承認条件の準備状況を見せる", async () => {
    const commanderRequested = await renderPage(PermitShow, {
      ...shared("BaseCommander"),
      permit: requestedView,
      equipmentChecks: [
        { checkId: ids.checkA, workerId: ids.workerA, checkedAt: at("2026-09-15T00:03:00.000Z"), oxygenMinutes: 200 as never, needsMaintenance: false },
      ],
      segment: { segmentId: ids.segment, label: "PV-07 給電区間", lockout: { kind: "Energized" } },
      actions: { ...noActions, recordEquipmentCheck: true, approve: true, abort: true },
    });
    expect(commanderRequested).toContain("開始を承認する");
    expect(commanderRequested).toContain("装備点検を記録");
    expect(commanderRequested).toContain("作業許可を中止");
    expect(commanderRequested).toContain("W-01: 記録済み");
    expect(commanderRequested).toContain("W-02: 未記録");
    expect(commanderRequested).toContain("通電中");
    expect(commanderRequested).not.toContain("出発を記録する");
    expect(commanderRequested).not.toContain("札を外して完了にする");
    expect(commanderRequested).not.toContain("グローブ");

    const electricianReturned = await renderPage(PermitShow, {
      ...shared("Electrician"),
      permit: toPermitView(returned),
      equipmentChecks: [],
      segment: {
        segmentId: ids.segment,
        label: "PV-07 給電区間",
        lockout: { kind: "LockedOut", permitId: ids.permit, taggedBy: ids.electrician, taggedAt: at("2026-09-15T00:05:00.000Z") },
      },
      actions: { ...noActions, close: true },
    });
    expect(electricianReturned).toContain("札を外して完了にする");
    expect(electricianReturned).toContain("帰還済");
    expect(electricianReturned).toContain("予定どおり");
    expect(electricianReturned).not.toContain("開始を承認する");

    const groundControlApproved = await renderPage(PermitShow, {
      ...shared("GroundControl"),
      permit: toPermitView(approved),
      equipmentChecks: [],
      segment: null,
      actions: { ...noActions, abort: true },
    });
    expect(groundControlApproved).toContain("月面日 第7日");
    expect(groundControlApproved).toContain("系統区間が未登録");
    expect(groundControlApproved).toContain("作業許可を中止");
    expect(groundControlApproved).not.toContain("出発を記録する");
  });

  test("遮断盤と宇宙天気のフォームは担当の役割にだけ操作を出す", async () => {
    const electricianSegment = await renderPage(SegmentForm, {
      ...shared("Electrician"),
      mode: "edit",
      segment: { segmentId: ids.segment, label: "PV-07 給電区間", lockout: { kind: "Energized" } },
      actions: { edit: false, delete: false, lockout: true, release: false },
    });
    expect(electricianSegment).toContain("遮断して札を掛ける");
    expect(electricianSegment).not.toContain("札を外して通電に戻す");
    expect(electricianSegment).toContain('readOnly=""');

    const groundControlWeather = await renderPage(SpaceWeatherIndex, {
      ...shared("GroundControl"),
      reports: [{ reportId: "r1", issuedAt: "2026-09-15T00:00:00.000Z", alertLevel: "S1", stations: ["GOES-19"] }],
    });
    expect(groundControlWeather).toContain("宇宙天気を報告");
    expect(groundControlWeather).toContain("フレア警報 S1");
    const commanderWeather = await renderPage(SpaceWeatherIndex, { ...shared("BaseCommander"), reports: [] });
    expect(commanderWeather).not.toContain('aria-label="宇宙天気報告"');
    expect(commanderWeather).toContain("報告がありません");
  });

  test("隊員一覧は医務の値を明示して描き、作業記録は伏せた値をそのまま見せる", async () => {
    const workers = await renderPage(WorkersIndex, {
      ...shared("GroundControl"),
      workers: [{ workerId: ids.workerA, qualification: "Electrician", radiationExposureMicroSv: 12_000 }],
    });
    expect(workers).toContain("被ばく量（µSv）");
    expect(workers).toContain("規程第8条");
    expect(workers).toContain("12,000");

    const events = await renderPage(EventsIndex, {
      ...shared("Admin"),
      events: [
        {
          eventId: "30000000-0000-4000-8000-000000000001" as never,
          aggregateId: "W-01",
          aggregateName: "Worker",
          eventName: "worker.registered",
          occurredAt: at("2026-09-15T00:01:00.000Z"),
          lunarDay: 7 as never,
          actorUserId: ids.admin,
          aggregateState: { workerId: "W-01", qualification: "General", radiationExposureMicroSv: "[REDACTED]" },
          eventPayload: { workerId: "W-01" },
        },
      ],
    });
    expect(events).toContain("第7日");
    expect(events).toContain("[REDACTED]");
    expect(events).toContain("worker.registered");
    expect(events).toContain("規程第9条");
  });
});
