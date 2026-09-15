import type { ApprovalRequest, Verdict } from "./approval/request.js";

/** 教材での扱い。主題は解説と演習、比較は S1 と各回のコラム、展望は S1 の例示のみ */
export type ApproachTier = "主題" | "比較" | "展望";

/**
 * 複数の条件が同時に破れたとき、どこまで報告するか。
 * - all: 破れた条件をすべて返す
 * - first: 最初に見つけた1件で止まる
 * - structural-first: 型で表した条件（1, 5, 6）で止まり、実行時の条件は評価しない
 */
export type Reporting = "all" | "first" | "structural-first";

export type Approach = Readonly<{
  id: string;
  name: string;
  tier: ApproachTier;
  reporting: Reporting;
  summary: string;
  decide: (request: ApprovalRequest) => Verdict;
}>;
