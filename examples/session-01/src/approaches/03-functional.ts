import type { Approach } from "../approach.js";
import {
  CREW_SIZE,
  DOSE_LIMIT_MICRO_SV,
  LAST_DAYLIGHT_LUNAR_DAY,
  predictedDoseMicroSv,
  requiredOxygenMinutes,
  segmentFor,
  verdictFrom,
  type ApprovalRequest,
  type EquipmentCheck,
  type RejectionReason,
  type Verdict,
  type WorkerId,
} from "../approval/request.js";

/**
 * 関数型。判定を「入力から理由の一覧を返す純粋関数」の合成で書く。
 * 各条件は状態を持たない小さな関数で、順序に依存せず、単独で試せる。判定全体は関数の並べ方で決まる。
 */
export type Condition = (request: ApprovalRequest) => readonly RejectionReason[];

const violates =
  (reason: RejectionReason) =>
  (holds: boolean): readonly RejectionReason[] => (holds ? [] : [reason]);

const distinct = <T>(values: readonly T[]): readonly T[] => [...new Set(values)];

const checkFor = (
  request: ApprovalRequest,
  workerId: WorkerId,
): EquipmentCheck | undefined =>
  request.equipmentChecks.find((check) => check.workerId === workerId);

const crewChecks = (request: ApprovalRequest): readonly EquipmentCheck[] =>
  request.crew.flatMap((workerId) => {
    const check = checkFor(request, workerId);
    return check === undefined ? [] : [check];
  });

export const equipmentChecked: Condition = (request) =>
  violates("EquipmentCheckMissing")(
    request.crew.every((workerId) => checkFor(request, workerId) !== undefined),
  );

export const enoughOxygen: Condition = (request) =>
  violates("InsufficientOxygen")(
    crewChecks(request).every(
      (check) => check.oxygenMinutes >= requiredOxygenMinutes(request.plannedMinutes),
    ),
  );

export const withinDoseLimit: Condition = (request) =>
  violates("DoseLimitExceeded")(
    request.crew.every((workerId) => {
      const dose = request.crewDoseMicroSv[workerId];
      return (
        dose !== undefined &&
        dose + predictedDoseMicroSv(request.plannedMinutes) <= DOSE_LIMIT_MICRO_SV
      );
    }),
  );

export const noFlareAlert: Condition = (request) =>
  violates("FlareAlertActive")(request.flareAlert === "Clear");

export const buddyRegistered: Condition = (request) =>
  violates("BuddyMissing")(distinct(request.crew).length === CREW_SIZE);

export const segmentLockedOut: Condition = (request) =>
  violates("SegmentNotLockedOut")(
    request.lockedOutSegmentIds.includes(segmentFor(request.zoneId)),
  );

export const daylight: Condition = (request) =>
  violates("NightTime")(request.lunarDay <= LAST_DAYLIGHT_LUNAR_DAY);

/** 条件の合成。個々の関数を変えずに、並べ方だけで判定全体を組み立てる */
export const all =
  (...conditions: readonly Condition[]): Condition =>
  (request) =>
    conditions.flatMap((condition) => condition(request));

export const approvalConditions: Condition = all(
  equipmentChecked,
  enoughOxygen,
  withinDoseLimit,
  noFlareAlert,
  buddyRegistered,
  segmentLockedOut,
  daylight,
);

export const canApprove = (request: ApprovalRequest): Verdict =>
  verdictFrom(approvalConditions(request));

export const functional: Approach = {
  id: "functional",
  name: "関数型",
  tier: "主題",
  reporting: "all",
  summary:
    "条件を純粋関数にし、合成して判定にする。入力と出力だけで振る舞いが決まり、単独で試せる。",
  decide: canApprove,
};
