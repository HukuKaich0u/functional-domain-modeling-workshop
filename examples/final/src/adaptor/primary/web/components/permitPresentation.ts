import type { StatusTone } from "@moonbase/base-web";

import type { PermitPageView } from "../routes/permitRoutes.js";
import type { SegmentPageView } from "../routes/segmentRoutes.js";

export type StatusPresentation = Readonly<{
  canonical: string;
  label: string;
  tone: StatusTone;
}>;

/** 6状態の表示。canonical は型の kind をそのまま見せ、教材上の対応を取りやすくする */
export const permitPresentation = (kind: PermitPageView["kind"]): StatusPresentation => {
  switch (kind) {
    case "Requested":
      return { canonical: kind, label: "申請済", tone: "neutral" };
    case "Approved":
      return { canonical: kind, label: "承認済", tone: "info" };
    case "Outside":
      return { canonical: kind, label: "作業中", tone: "warning" };
    case "Returned":
      return { canonical: kind, label: "帰還済", tone: "info" };
    case "Closed":
      return { canonical: kind, label: "完了", tone: "success" };
    case "Aborted":
      return { canonical: kind, label: "中止", tone: "danger" };
    default:
      return kind satisfies never;
  }
};

export const lockoutPresentation = (
  kind: SegmentPageView["lockout"]["kind"],
): StatusPresentation => {
  switch (kind) {
    case "Energized":
      return { canonical: kind, label: "通電中", tone: "warning" };
    case "LockedOut":
      return { canonical: kind, label: "遮断中（札あり）", tone: "success" };
    default:
      return kind satisfies never;
  }
};

export const alertLevelPresentation = (level: string): StatusPresentation =>
  level === "none"
    ? { canonical: level, label: "警報なし", tone: "success" }
    : { canonical: level, label: `フレア警報 ${level}`, tone: "danger" };
