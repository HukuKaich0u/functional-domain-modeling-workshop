import { moonbaseFixture } from "../../../fixtures/moonbase.js";

export type WorkerId = string;
export type ZoneId = string;
export type SegmentId = string;
export type FlareAlert = "Clear" | "Warning";

export type EquipmentCheck = Readonly<{
  workerId: WorkerId;
  oxygenMinutes: number;
  checkedAt: string;
}>;

/**
 * 開始承認の判定に必要な事実を一つにまとめた入力。
 * 10通りの書き方はすべてこの型を受け取り、Verdict を返す。
 */
export type ApprovalRequest = Readonly<{
  permitId: string;
  zoneId: ZoneId;
  crew: readonly WorkerId[];
  plannedMinutes: number;
  equipmentChecks: readonly EquipmentCheck[];
  /** 医務から渡された被ばく量（µSv）。判定にだけ使い、記録には出さない */
  crewExposureMicroSv: Readonly<Record<WorkerId, number>>;
  flareAlert: FlareAlert;
  /** 電気主任が遮断札を掛けた系統区間 */
  lockedOutSegmentIds: readonly SegmentId[];
  lunarDay: number;
}>;

/** 船外作業規程 第2条・第10条の7条件に対応する却下理由。並び順は条件の番号 */
export const rejectionReasons = [
  "EquipmentCheckMissing",
  "InsufficientOxygen",
  "ExposureLimitExceeded",
  "FlareAlertActive",
  "BuddyMissing",
  "SegmentNotLockedOut",
  "NightTime",
] as const;

export type RejectionReason = (typeof rejectionReasons)[number];

export type Verdict =
  | Readonly<{ kind: "Approved" }>
  | Readonly<{ kind: "Rejected"; reasons: readonly RejectionReason[] }>;

export const OXYGEN_RESERVE_MINUTES = 60;
export const EXPOSURE_LIMIT_MICRO_SV = 50_000;
export const EXPOSURE_RATE_MICRO_SV_PER_HOUR = 60;
export const LAST_DAYLIGHT_LUNAR_DAY = 14;
export const CREW_SIZE = 2;

export const requiredOxygenMinutes = (plannedMinutes: number): number =>
  plannedMinutes + OXYGEN_RESERVE_MINUTES;

export const expectedExposureIncreaseMicroSv = (plannedMinutes: number): number =>
  Math.ceil((plannedMinutes / 60) * EXPOSURE_RATE_MICRO_SV_PER_HOUR);

/** 教材の簡略化。作業区画 PV-07 へ給電する系統区間は PV-07 とする */
export const segmentFor = (zoneId: ZoneId): SegmentId => zoneId;

export const sortReasons = (
  reasons: Iterable<RejectionReason>,
): readonly RejectionReason[] =>
  [...new Set(reasons)].sort(
    (left, right) =>
      rejectionReasons.indexOf(left) - rejectionReasons.indexOf(right),
  );

export const approved: Verdict = { kind: "Approved" };

export const verdictFrom = (reasons: Iterable<RejectionReason>): Verdict => {
  const sorted = sortReasons(reasons);
  return sorted.length === 0 ? approved : { kind: "Rejected", reasons: sorted };
};

const checkFor = (
  request: ApprovalRequest,
  workerId: WorkerId,
): EquipmentCheck | undefined =>
  request.equipmentChecks.find((check) => check.workerId === workerId);

/**
 * 7条件の参照実装。イベント駆動、Actor、Reactive の例は「事実がどう届くか」を主題にするため、
 * 判定そのものはこの関数を共有する。
 */
export const violatedConditions = (
  request: ApprovalRequest,
): readonly RejectionReason[] => {
  const reasons: RejectionReason[] = [];
  const crewChecks = request.crew.flatMap((workerId) => {
    const check = checkFor(request, workerId);
    return check === undefined ? [] : [check];
  });
  const expectedIncrease = expectedExposureIncreaseMicroSv(request.plannedMinutes);

  if (crewChecks.length !== request.crew.length) reasons.push("EquipmentCheckMissing");
  if (
    !crewChecks.every(
      (check) => check.oxygenMinutes >= requiredOxygenMinutes(request.plannedMinutes),
    )
  ) {
    reasons.push("InsufficientOxygen");
  }
  if (
    !request.crew.every((workerId) => {
      const exposure = request.crewExposureMicroSv[workerId];
      return exposure !== undefined && exposure + expectedIncrease <= EXPOSURE_LIMIT_MICRO_SV;
    })
  ) {
    reasons.push("ExposureLimitExceeded");
  }
  if (request.flareAlert !== "Clear") reasons.push("FlareAlertActive");
  if (new Set(request.crew).size !== CREW_SIZE) reasons.push("BuddyMissing");
  if (!request.lockedOutSegmentIds.includes(segmentFor(request.zoneId))) {
    reasons.push("SegmentNotLockedOut");
  }
  if (request.lunarDay > LAST_DAYLIGHT_LUNAR_DAY) reasons.push("NightTime");

  return reasons;
};

export const sampleRequest: ApprovalRequest = {
  permitId: moonbaseFixture.permitId,
  zoneId: moonbaseFixture.zoneId,
  crew: [...moonbaseFixture.crew],
  plannedMinutes: moonbaseFixture.plannedMinutes,
  equipmentChecks: moonbaseFixture.crew.map((workerId) => ({
    workerId,
    oxygenMinutes: moonbaseFixture.oxygenMinutes,
    checkedAt: moonbaseFixture.checkedAt,
  })),
  crewExposureMicroSv: moonbaseFixture.crewExposureMicroSv,
  flareAlert: "Clear",
  lockedOutSegmentIds: [moonbaseFixture.segmentId],
  lunarDay: moonbaseFixture.lunarDay,
};
