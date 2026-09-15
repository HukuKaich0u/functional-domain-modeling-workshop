import type { EvaPermit } from "./permit.js";

const statusLabels: Record<string, string> = {
  requested: "申請済",
  approved: "承認済",
  outside: "作業中",
  returned: "帰還済",
  closed: "完了",
  aborted: "中止",
};

export const toStatusLabel = (permit: EvaPermit): string => {
  const label = Object.hasOwn(statusLabels, permit.status)
    ? statusLabels[permit.status]
    : undefined;

  return label ?? permit.status;
};
