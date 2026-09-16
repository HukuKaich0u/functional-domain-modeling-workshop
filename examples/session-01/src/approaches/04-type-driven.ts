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
  type FlareAlert,
  type Verdict,
} from "../approval/request.js";

/**
 * 型駆動。「承認を判定できる形」を型で定義し、その形へ変換（parse）できた入力だけを判定関数へ渡す。
 * 2名分の装備点検（1）、相方（5）、遮断済みの系統区間（6）は型の構造で表す。
 * 酸素（2）、被ばく量（3）、フレア警報（4）、夜間（7）は値に依存するため実行時に判定する。
 */
declare const brand: unique symbol;
type Brand<T, Name extends string> = T & { readonly [brand]: Name };

export type WorkerId = Brand<string, "WorkerId">;
export type LockedOutSegmentId = Brand<string, "LockedOutSegmentId">;

/** 相方が登録されている乗員。要素は互いに異なる */
export type Crew = readonly [WorkerId, WorkerId];

/** 乗員と同じ順に並んだ2名分の装備点検 */
export type CrewEquipmentChecks = readonly [EquipmentCheck, EquipmentCheck];

export type ApprovalCandidate = Readonly<{
  permitId: string;
  crew: Crew;
  equipmentChecks: CrewEquipmentChecks;
  lockedOutSegmentId: LockedOutSegmentId;
  plannedMinutes: number;
}>;

export type Environment = Readonly<{
  radiationExposureOf: (workerId: WorkerId) => number | undefined;
  flareAlert: FlareAlert;
  lunarDay: number;
}>;

export type StructuralReason =
  | "EquipmentCheckMissing"
  | "BuddyMissing"
  | "SegmentNotLockedOut";

export type RuntimeReason =
  | "InsufficientOxygen"
  | "ExposureLimitExceeded"
  | "FlareAlertActive"
  | "NightTime";

export type ParseResult =
  | Readonly<{ ok: true; candidate: ApprovalCandidate }>
  | Readonly<{ ok: false; reasons: readonly StructuralReason[] }>;

const toWorkerId = (value: string): WorkerId => value as WorkerId;

const parseCrew = (crew: readonly string[]): Crew | undefined => {
  const [first, second, ...rest] = [...new Set(crew)];
  return first === undefined || second === undefined || rest.length > 0
    ? undefined
    : [toWorkerId(first), toWorkerId(second)];
};

const parseChecks = (
  crew: Crew,
  checks: readonly EquipmentCheck[],
): CrewEquipmentChecks | undefined => {
  const [first, second] = crew.map((workerId) =>
    checks.find((check) => check.workerId === workerId),
  );
  return first === undefined || second === undefined ? undefined : [first, second];
};

const parseLockedOutSegment = (
  request: ApprovalRequest,
): LockedOutSegmentId | undefined => {
  const segmentId = segmentFor(request.zoneId);
  return request.lockedOutSegmentIds.includes(segmentId)
    ? (segmentId as LockedOutSegmentId)
    : undefined;
};

/** 構造の条件をここで一度だけ確かめる。通った値は型が証明になる */
export const parseCandidate = (request: ApprovalRequest): ParseResult => {
  const reasons: StructuralReason[] = [];
  if (
    !request.crew.every((workerId) =>
      request.equipmentChecks.some((check) => check.workerId === workerId),
    )
  ) {
    reasons.push("EquipmentCheckMissing");
  }
  const crew = parseCrew(request.crew);
  if (crew === undefined) reasons.push("BuddyMissing");
  const lockedOutSegmentId = parseLockedOutSegment(request);
  if (lockedOutSegmentId === undefined) reasons.push("SegmentNotLockedOut");

  const equipmentChecks =
    crew === undefined ? undefined : parseChecks(crew, request.equipmentChecks);
  if (crew === undefined || equipmentChecks === undefined || lockedOutSegmentId === undefined) {
    return { ok: false, reasons };
  }

  return {
    ok: true,
    candidate: {
      permitId: request.permitId,
      crew,
      equipmentChecks,
      lockedOutSegmentId,
      plannedMinutes: request.plannedMinutes,
    },
  };
};

/** 型が保証する条件はここで確かめない。引数が ApprovalCandidate であること自体が証明になる */
export const approve = (
  candidate: ApprovalCandidate,
  environment: Environment,
): Verdict => {
  const reasons: RuntimeReason[] = [];
  const required = requiredOxygenMinutes(candidate.plannedMinutes);
  const expectedIncrease = expectedExposureIncreaseMicroSv(candidate.plannedMinutes);

  if (!candidate.equipmentChecks.every((check) => check.oxygenMinutes >= required)) {
    reasons.push("InsufficientOxygen");
  }
  if (
    !candidate.crew.every((workerId) => {
      const exposure = environment.radiationExposureOf(workerId);
      return exposure !== undefined && exposure + expectedIncrease <= EXPOSURE_LIMIT_MICRO_SV;
    })
  ) {
    reasons.push("ExposureLimitExceeded");
  }
  if (environment.flareAlert !== "Clear") reasons.push("FlareAlertActive");
  if (environment.lunarDay > LAST_DAYLIGHT_LUNAR_DAY) reasons.push("NightTime");

  return verdictFrom(reasons);
};

export const crewSize: typeof CREW_SIZE = CREW_SIZE;

export const typeDriven: Approach = {
  id: "type-driven",
  name: "型駆動",
  tier: "主題",
  reporting: "structural-first",
  summary:
    "判定できる形を型で決め、parse を通った値だけを判定関数に渡す。構造の条件は型が、値の条件は実行時が守る。",
  decide: (request) => {
    const parsed = parseCandidate(request);
    if (!parsed.ok) return verdictFrom(parsed.reasons);
    return approve(parsed.candidate, {
      radiationExposureOf: (workerId) => request.crewExposureMicroSv[workerId],
      flareAlert: request.flareAlert,
      lunarDay: request.lunarDay,
    });
  },
};
