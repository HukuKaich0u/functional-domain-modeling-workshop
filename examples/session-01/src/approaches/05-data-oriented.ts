import { z } from "zod";

import type { Approach } from "../approach.js";
import {
  CREW_SIZE,
  DOSE_LIMIT_MICRO_SV,
  LAST_DAYLIGHT_LUNAR_DAY,
  predictedDoseMicroSv,
  requiredOxygenMinutes,
  segmentFor,
  verdictFrom,
  type RejectionReason,
  type Verdict,
} from "../approval/request.js";

/**
 * データ指向プログラミング（Data-Oriented Programming）。
 * データをクラスではなく汎用のデータ構造（オブジェクト、配列、マップ）で表し、境界でスキーマ検証し、
 * 変更せず（イミュータブル）、汎用の関数で処理する。判定に使う事実も、条件も、結果も JSON にできるデータ。
 * メモリ配置を最適化する Data-Oriented Design とは別の考え方。
 */
export const ApprovalRequestSchema = z
  .object({
    permitId: z.string().regex(/^EVA-\d{4}$/),
    zoneId: z.string().regex(/^PV-\d{2}$/),
    crew: z.array(z.string().regex(/^W-\d{2}$/)),
    plannedMinutes: z.number().int().positive(),
    equipmentChecks: z.array(
      z.object({
        workerId: z.string(),
        oxygenMinutes: z.number().int().nonnegative(),
        checkedAt: z.string(),
      }),
    ),
    crewDoseMicroSv: z.record(z.string(), z.number().nonnegative()),
    flareAlert: z.enum(["Clear", "Warning"]),
    lockedOutSegmentIds: z.array(z.string()),
    lunarDay: z.number().int().min(1).max(29),
  })
  .readonly();

export type ApprovalData = z.infer<typeof ApprovalRequestSchema>;

/** 判定に使う事実。名前と数値・真偽値の平らなマップで、そのまま記録や画面に出せる */
export type Facts = Readonly<Record<string, number | boolean>>;

export const deriveFacts = (data: ApprovalData): Facts => {
  const checks = data.crew.flatMap((workerId) => {
    const check = data.equipmentChecks.find((candidate) => candidate.workerId === workerId);
    return check === undefined ? [] : [check];
  });
  const projectedDoses = data.crew.map(
    (workerId) =>
      (data.crewDoseMicroSv[workerId] ?? Number.POSITIVE_INFINITY) +
      predictedDoseMicroSv(data.plannedMinutes),
  );

  return Object.freeze({
    "crew.distinctCount": new Set(data.crew).size,
    "crew.requiredCount": CREW_SIZE,
    "equipment.checkedCount": checks.length,
    "equipment.requiredCount": data.crew.length,
    "oxygen.minMinutes": Math.min(...checks.map((check) => check.oxygenMinutes)),
    "oxygen.requiredMinutes": requiredOxygenMinutes(data.plannedMinutes),
    "dose.maxProjectedMicroSv": Math.max(...projectedDoses),
    "dose.limitMicroSv": DOSE_LIMIT_MICRO_SV,
    "spaceWeather.clear": data.flareAlert === "Clear",
    "lockout.segmentLockedOut": data.lockedOutSegmentIds.includes(segmentFor(data.zoneId)),
    "calendar.lunarDay": data.lunarDay,
    "calendar.lastDaylightDay": LAST_DAYLIGHT_LUNAR_DAY,
  });
};

/** 条件もデータ。左の事実を、右の事実または定数と比べる */
export type Constraint = Readonly<{
  reason: RejectionReason;
  left: string;
  operator: ">=" | "<=" | "==";
  right: string | number | boolean;
}>;

export const constraints: readonly Constraint[] = [
  { reason: "EquipmentCheckMissing", left: "equipment.checkedCount", operator: "==", right: "equipment.requiredCount" },
  { reason: "InsufficientOxygen", left: "oxygen.minMinutes", operator: ">=", right: "oxygen.requiredMinutes" },
  { reason: "DoseLimitExceeded", left: "dose.maxProjectedMicroSv", operator: "<=", right: "dose.limitMicroSv" },
  { reason: "FlareAlertActive", left: "spaceWeather.clear", operator: "==", right: true },
  { reason: "BuddyMissing", left: "crew.distinctCount", operator: "==", right: "crew.requiredCount" },
  { reason: "SegmentNotLockedOut", left: "lockout.segmentLockedOut", operator: "==", right: true },
  { reason: "NightTime", left: "calendar.lunarDay", operator: "<=", right: "calendar.lastDaylightDay" },
];

const resolve = (facts: Facts, operand: string | number | boolean): number | boolean | undefined =>
  typeof operand === "string" ? facts[operand] : operand;

/** 汎用の比較。事実の意味を知らず、名前と演算子だけで動く */
export const holds = (facts: Facts, constraint: Constraint): boolean => {
  const left = facts[constraint.left];
  const right = resolve(facts, constraint.right);
  if (left === undefined || right === undefined) return false;
  switch (constraint.operator) {
    case ">=":
      return Number(left) >= Number(right);
    case "<=":
      return Number(left) <= Number(right);
    case "==":
      return left === right;
  }
};

export const evaluate = (raw: unknown): Verdict => {
  const data = ApprovalRequestSchema.parse(raw);
  const facts = deriveFacts(data);
  return verdictFrom(
    constraints.filter((constraint) => !holds(facts, constraint)).map(({ reason }) => reason),
  );
};

export const dataOriented: Approach = {
  id: "data-oriented",
  name: "データ指向（DOP）",
  tier: "比較",
  reporting: "all",
  summary:
    "入力をスキーマで検証し、汎用データの事実へ写し、データとして書いた条件を汎用関数で比べる。",
  decide: evaluate,
};
