import type { EvaPermit } from "./permit.js";

const assertNever = (value: never): never => {
  throw new Error(`Unknown permit status: ${JSON.stringify(value)}`);
};

export const toStatusLabel = (permit: EvaPermit): string => {
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
      return assertNever(permit);
  }
};
