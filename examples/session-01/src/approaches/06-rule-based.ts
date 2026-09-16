import type { Approach } from "../approach.js";
import {
  CREW_SIZE,
  EXPOSURE_LIMIT_MICRO_SV,
  LAST_DAYLIGHT_LUNAR_DAY,
  expectedExposureIncreaseMicroSv,
  requiredOxygenMinutes,
  segmentFor,
  verdictFrom,
  type ApprovalRequest,
  type EquipmentCheck,
  type RejectionReason,
  type Verdict,
} from "../approval/request.js";

/**
 * 宣言型・ルールベース。規程の条文を「成り立つべきこと」の宣言として並べ、評価の手順は汎用の評価器に任せる。
 * 規則を足すときは配列に1件足すだけで評価器は変えない。規則の一覧はそのまま判定の説明（explain）になる。
 */
export type Rule = Readonly<{
  id: string;
  /** 船外作業規程の条番号 */
  article: string;
  /** 成り立つべきこと */
  statement: string;
  reason: RejectionReason;
  holds: (request: ApprovalRequest) => boolean;
}>;

const crewChecks = (request: ApprovalRequest): readonly EquipmentCheck[] =>
  request.crew.flatMap((workerId) => {
    const check = request.equipmentChecks.find((candidate) => candidate.workerId === workerId);
    return check === undefined ? [] : [check];
  });

export const regulations: readonly Rule[] = [
  {
    id: "equipment-checked",
    article: "第2条",
    statement: "2名分の装備点検が記録済みである",
    reason: "EquipmentCheckMissing",
    holds: (request) =>
      request.crew.every((workerId) =>
        request.equipmentChecks.some((check) => check.workerId === workerId),
      ),
  },
  {
    id: "oxygen-reserve",
    article: "第2条",
    statement: "酸素残時間が予定作業時間と予備60分の合計以上である",
    reason: "InsufficientOxygen",
    holds: (request) =>
      crewChecks(request).every(
        (check) => check.oxygenMinutes >= requiredOxygenMinutes(request.plannedMinutes),
      ),
  },
  {
    id: "exposure-limit",
    article: "第2条・第8条",
    statement: "今回の作業後も各作業員の被ばく量が安全上限以内である",
    reason: "ExposureLimitExceeded",
    holds: (request) =>
      request.crew.every((workerId) => {
        const exposure = request.crewExposureMicroSv[workerId];
        return (
          exposure !== undefined &&
          exposure + expectedExposureIncreaseMicroSv(request.plannedMinutes) <= EXPOSURE_LIMIT_MICRO_SV
        );
      }),
  },
  {
    id: "no-flare-alert",
    article: "第5条",
    statement: "フレア警報が発令されていない",
    reason: "FlareAlertActive",
    holds: (request) => request.flareAlert === "Clear",
  },
  {
    id: "buddy",
    article: "第4条",
    statement: "相方が同じ許可に登録されている",
    reason: "BuddyMissing",
    holds: (request) => new Set(request.crew).size === CREW_SIZE,
  },
  {
    id: "lockout",
    article: "第3条",
    statement: "作業区画に対応する系統区間に遮断札が掛かっている",
    reason: "SegmentNotLockedOut",
    holds: (request) => request.lockedOutSegmentIds.includes(segmentFor(request.zoneId)),
  },
  {
    id: "daylight",
    article: "第10条",
    statement: "月面日が第14日以前である",
    reason: "NightTime",
    holds: (request) => request.lunarDay <= LAST_DAYLIGHT_LUNAR_DAY,
  },
];

export type RuleOutcome = Readonly<{ rule: Rule; holds: boolean }>;

/** 評価器。規則の意味を知らず、宣言を一つずつ当てるだけ */
export const evaluate =
  (rules: readonly Rule[]) =>
  (request: ApprovalRequest): readonly RuleOutcome[] =>
    rules.map((rule) => ({ rule, holds: rule.holds(request) }));

export const verdictOf = (outcomes: readonly RuleOutcome[]): Verdict =>
  verdictFrom(outcomes.filter((outcome) => !outcome.holds).map(({ rule }) => rule.reason));

/** 判定の根拠を条文ごとに並べる。規則が宣言なので、説明は評価結果を読み上げるだけでよい */
export const explain = (request: ApprovalRequest): readonly string[] =>
  evaluate(regulations)(request).map(
    ({ rule, holds }) => `${holds ? "○" : "×"} ${rule.article} ${rule.statement}`,
  );

export const ruleBased: Approach = {
  id: "rule-based",
  name: "宣言型・ルールベース",
  tier: "比較",
  reporting: "all",
  summary:
    "条文を成り立つべきことの宣言として並べ、汎用の評価器が当てる。規則の追加は宣言の追加で、説明も同じ宣言から出る。",
  decide: (request) => verdictOf(evaluate(regulations)(request)),
};
