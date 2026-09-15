import type { EvaPermit } from "./permit.js";

export const toStatusLabel = (permit: Readonly<{ kind: string }>): string => {
  switch (permit.kind) {
    case "Requested":
      return "申請済";
    case "Approved":
      return "承認済";
    case "Outside":
      return "作業中";
    case "Returned":
      return "帰還済";
    case "Closed":
      return "完了";
    case "Aborted":
      return "中止";
    default:
      return "不明";
  }
};

export type StatusLabelPermit = EvaPermit;
