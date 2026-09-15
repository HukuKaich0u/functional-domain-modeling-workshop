import { isDeepStrictEqual } from "node:util";

import type { IncidentScenario, MoonbasePageProps } from "@moonbase/base-web";
import { moonbaseNoticeFromCode } from "@moonbase/base-web/server";

import type { WorkLog } from "../adaptor/secondary/sqlite/permitRepository.js";
import type { EvaPermit } from "../domain/permit/permit.js";
import { toStatusLabel } from "../domain/permit/statusLabel.js";

const statusKinds: Readonly<Record<string, string>> = {
  requested: "Requested",
  approved: "Approved",
  outside: "Outside",
  returned: "Returned",
  closed: "Closed",
  aborted: "Aborted",
};

const toStatusKind = (status: string): string => {
  const kind = Object.hasOwn(statusKinds, status)
    ? statusKinds[status]
    : undefined;

  return kind ?? status;
};

const incidentScenarios: readonly IncidentScenario[] = [
  {
    title: "想定外の作業許可の状態を保存",
    description: "システムで定義していない waiting-for-sunrise という状態を保存します。",
    action: {
      kind: "Available",
      href: "/demo/incidents/unknown-status",
      method: "post",
    },
  },
  {
    title: "系統区間を取り違えて保存",
    description: "作業区画 PV-07 の許可に、遮断した系統区間として PV-01 を保存します。",
    action: {
      kind: "Available",
      href: "/demo/incidents/swap-identifiers",
      method: "post",
    },
  },
  {
    title: "不正な宇宙天気の報告を保存",
    description: "警報レベルと観測局が不正な報告を、検査せず作業許可へ保存します。",
    action: {
      kind: "Available",
      href: "/demo/incidents/malformed-space-weather",
      method: "post",
    },
  },
  {
    title: "存在しない作業許可で開始承認",
    description: "許可なしの失敗を状態不正として誤って表示します。",
    action: {
      kind: "Available",
      href: "/demo/incidents/missing-permit",
      method: "post",
    },
  },
  {
    title: "開始承認を繰り返す",
    description: "開始承認のたびに別の時刻と記録 ID が作られる様子を表示します。",
    action: {
      kind: "Available",
      href: "/demo/incidents/repeat-approve",
      method: "post",
    },
  },
];

const inspectionWarnings = (
  permit: EvaPermit,
  workLogs: readonly WorkLog[],
): readonly string[] => {
  const warnings: string[] = [];

  if (!Object.hasOwn(statusKinds, permit.status)) {
    warnings.push("想定外の作業許可の状態が保存されています");
  }
  if (permit.segmentId !== undefined && permit.segmentId !== permit.zoneId) {
    warnings.push("遮断した系統区間と作業区画が一致しません");
  }

  const latestLog = workLogs.at(-1);
  if (latestLog === undefined || !isDeepStrictEqual(latestLog.payload, permit)) {
    warnings.push("現在の作業許可に対応する作業記録がありません");
  }
  if (workLogs.some(({ payload }) => payload.crewDose !== undefined)) {
    warnings.push("作業記録に作業員の累積線量が含まれています");
  }

  return warnings;
};

export const toPageProps = (
  permit: EvaPermit,
  workLogs: readonly WorkLog[],
  noticeCode: string | undefined,
): MoonbasePageProps => {
  const action = (href: string) =>
    ({ kind: "Available", href, method: "post" }) as const;
  const permitUrl = `/permits/${permit.permitId}`;

  return {
    sessionLabel: "Session 00",
    learningFocus: "型で守られていない業務事故を観察する",
    permit: {
      permitId: permit.permitId,
      kind: toStatusKind(permit.status),
      zoneId: permit.zoneId,
      crew: permit.crew,
      requestedAt: permit.requestedAt,
      statusLabel: toStatusLabel(permit),
    },
    actions: {
      approve: action(`${permitUrl}/approve`),
      egress: action(`${permitUrl}/egress`),
      returnToBase: action(`${permitUrl}/return`),
      close: action(`${permitUrl}/close`),
      abort: action(`${permitUrl}/abort`),
      exportRollCall: {
        kind: "NotImplemented",
        href: "/reports/roll-call",
        method: "post",
      },
    },
    notice: moonbaseNoticeFromCode(noticeCode),
    incidentLab: {
      scenarios: incidentScenarios,
      inspection: {
        permitJson: JSON.stringify(permit, null, 2),
        workLogJson: JSON.stringify(workLogs, null, 2),
        warnings: inspectionWarnings(permit, workLogs),
      },
    },
  };
};
