import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  MoonbaseDashboard,
  type MoonbasePageProps,
} from "../src/index.js";

const available = {
  kind: "Available",
  href: "/available",
  method: "post",
} as const;

const hidden = { kind: "Hidden" } as const;

const notImplemented = {
  kind: "NotImplemented",
  href: "/reports/roll-call",
  method: "post",
} as const;

const props: MoonbasePageProps = {
  sessionLabel: "Session 03",
  learningFocus: "状態遷移を型で守る",
  permit: {
    permitId: "EVA-0412",
    kind: "Requested",
    zoneId: "PV-07",
    crew: ["W-03", "W-04"],
    requestedAt: "2026-09-15T00:00:00.000Z",
    statusLabel: "申請済",
  },
  actions: {
    approve: available,
    egress: hidden,
    returnToBase: hidden,
    close: hidden,
    abort: hidden,
    exportRollCall: notImplemented,
  },
  notice: null,
};

describe("MoonbaseDashboard", () => {
  it("未実装操作を区別し、Hidden操作を描画しない", () => {
    const html = renderToStaticMarkup(<MoonbaseDashboard {...props} />);

    expect(html).toContain("開始を承認する");
    expect(html).toContain("未実装");
    expect(html).toContain("点呼表を出力する");
    expect(html).not.toContain("中止する");
    expect(html).toContain("MoonBase 作業管理");
    expect(html).toContain("W-03 / W-04");
  });

  it("既知の業務失敗を固定メッセージへ変換する", () => {
    const html = renderToStaticMarkup(
      <MoonbaseDashboard {...props} notice={{ kind: "DoseLimitExceeded" }} />,
    );

    expect(html).toContain('<dialog class="notice-dialog" open="">');
    expect(html).toContain("累積線量が上限を超えるため承認できません");
  });

  it("事故再現用propsがあると作業許可と作業記録の内容を表示する", () => {
    const html = renderToStaticMarkup(
      <MoonbaseDashboard
        {...props}
        incidentLab={{
          scenarios: [
            {
              title: "未知の状態を保存する",
              description: "statusへ定義されていない文字列を保存します。",
              action: {
                kind: "Available",
                href: "/demo/incidents/unknown-status",
                method: "post",
              },
            },
          ],
          inspection: {
            permitJson: '{"status":"waiting-for-sunrise"}',
            workLogJson: '[{"eventName":"permit.updated"}]',
            warnings: ["未知の状態が保存されています"],
          },
        }}
      />,
    );

    expect(html).toContain("事故再現");
    expect(html).toContain("現在の作業許可");
    expect(html).toContain("作業記録");
    expect(html).toContain("未知の状態が保存されています");
  });
});
