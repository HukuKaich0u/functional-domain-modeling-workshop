import { approaches } from "./approaches/index.js";
import { sampleRequest, type ApprovalRequest, type Verdict } from "./approval/request.js";
import { multipleViolations, singleViolations } from "./approval/variants.js";

const describe = (verdict: Verdict): string =>
  verdict.kind === "Approved" ? "承認" : `却下: ${verdict.reasons.join(", ")}`;

const columns: readonly (readonly [string, ApprovalRequest])[] = [
  ["承認できる申請", sampleRequest],
  ...singleViolations.map(([reason, request]) => [`${reason} だけ`, request] as const),
  ["4条件が同時に破れた申請", multipleViolations],
];

console.log("船外作業規程 第2条・第10条 開始承認の7条件を10通りに書いた結果");
console.table(
  approaches.map((approach) => ({
    扱い: approach.tier,
    書き方: approach.name,
    報告: approach.reporting,
    ...Object.fromEntries(
      columns.map(([label, request]) => [label, describe(approach.decide(request))]),
    ),
  })),
);
