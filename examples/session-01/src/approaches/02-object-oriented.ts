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
  type RejectionReason,
  type SegmentId,
  type Verdict,
  type WorkerId,
} from "../approval/request.js";

/**
 * オブジェクト指向。判定に関わる知識を、役割を持つオブジェクトへ閉じ込める（カプセル化）。
 * 各条件は ApprovalRule を継承したクラスで、ApprovalPolicy は種類を知らずに同じ手順で問い合わせる（多態）。
 * 医務、地上管制、電気主任の知識は協力者オブジェクトとして注入する。
 */
export interface MedicalOfficer {
  radiationExposureOf(workerId: WorkerId): number | undefined;
}

export interface SpaceWeatherDesk {
  currentAlert(): FlareAlert;
}

export interface LockoutBoard {
  isLockedOut(segmentId: SegmentId): boolean;
}

export interface LunarCalendar {
  today(): number;
}

export class PermitCandidate {
  constructor(
    readonly permitId: string,
    readonly zoneId: string,
    private readonly crew: readonly WorkerId[],
    readonly plannedMinutes: number,
    private readonly equipmentChecks: readonly EquipmentCheck[],
  ) {}

  crewMembers(): readonly WorkerId[] {
    return this.crew;
  }

  distinctCrew(): readonly WorkerId[] {
    return [...new Set(this.crew)];
  }

  checkFor(workerId: WorkerId): EquipmentCheck | undefined {
    return this.equipmentChecks.find((check) => check.workerId === workerId);
  }

  crewChecks(): readonly EquipmentCheck[] {
    return this.crew.flatMap((workerId) => {
      const check = this.checkFor(workerId);
      return check === undefined ? [] : [check];
    });
  }
}

export abstract class ApprovalRule {
  constructor(readonly reason: RejectionReason) {}

  abstract isSatisfiedBy(candidate: PermitCandidate): boolean;
}

export class EquipmentCheckedRule extends ApprovalRule {
  constructor() {
    super("EquipmentCheckMissing");
  }

  isSatisfiedBy(candidate: PermitCandidate): boolean {
    return candidate
      .crewMembers()
      .every((workerId) => candidate.checkFor(workerId) !== undefined);
  }
}

export class OxygenReserveRule extends ApprovalRule {
  constructor() {
    super("InsufficientOxygen");
  }

  isSatisfiedBy(candidate: PermitCandidate): boolean {
    const required = requiredOxygenMinutes(candidate.plannedMinutes);
    return candidate.crewChecks().every((check) => check.oxygenMinutes >= required);
  }
}

export class ExposureLimitRule extends ApprovalRule {
  constructor(private readonly medicalOfficer: MedicalOfficer) {
    super("ExposureLimitExceeded");
  }

  isSatisfiedBy(candidate: PermitCandidate): boolean {
    const expectedIncrease = expectedExposureIncreaseMicroSv(candidate.plannedMinutes);
    return candidate.crewMembers().every((workerId) => {
      const exposure = this.medicalOfficer.radiationExposureOf(workerId);
      return exposure !== undefined && exposure + expectedIncrease <= EXPOSURE_LIMIT_MICRO_SV;
    });
  }
}

export class FlareAlertRule extends ApprovalRule {
  constructor(private readonly desk: SpaceWeatherDesk) {
    super("FlareAlertActive");
  }

  isSatisfiedBy(): boolean {
    return this.desk.currentAlert() === "Clear";
  }
}

export class BuddyRule extends ApprovalRule {
  constructor() {
    super("BuddyMissing");
  }

  isSatisfiedBy(candidate: PermitCandidate): boolean {
    return candidate.distinctCrew().length === CREW_SIZE;
  }
}

export class LockoutRule extends ApprovalRule {
  constructor(private readonly board: LockoutBoard) {
    super("SegmentNotLockedOut");
  }

  isSatisfiedBy(candidate: PermitCandidate): boolean {
    return this.board.isLockedOut(segmentFor(candidate.zoneId));
  }
}

export class DaylightRule extends ApprovalRule {
  constructor(private readonly calendar: LunarCalendar) {
    super("NightTime");
  }

  isSatisfiedBy(): boolean {
    return this.calendar.today() <= LAST_DAYLIGHT_LUNAR_DAY;
  }
}

export class ApprovalPolicy {
  constructor(private readonly rules: readonly ApprovalRule[]) {}

  get ruleCount(): number {
    return this.rules.length;
  }

  with(rule: ApprovalRule): ApprovalPolicy {
    return new ApprovalPolicy([...this.rules, rule]);
  }

  evaluate(candidate: PermitCandidate): Verdict {
    return verdictFrom(
      this.rules
        .filter((rule) => !rule.isSatisfiedBy(candidate))
        .map((rule) => rule.reason),
    );
  }
}

/** 協力者を組み立てる。実務では DI コンテナや composition root がこの役を持つ */
export const policyFor = (request: ApprovalRequest): ApprovalPolicy =>
  new ApprovalPolicy([
    new EquipmentCheckedRule(),
    new OxygenReserveRule(),
    new ExposureLimitRule({ radiationExposureOf: (workerId) => request.crewExposureMicroSv[workerId] }),
    new FlareAlertRule({ currentAlert: () => request.flareAlert }),
    new BuddyRule(),
    new LockoutRule({
      isLockedOut: (segmentId) => request.lockedOutSegmentIds.includes(segmentId),
    }),
    new DaylightRule({ today: () => request.lunarDay }),
  ]);

export const candidateFor = (request: ApprovalRequest): PermitCandidate =>
  new PermitCandidate(
    request.permitId,
    request.zoneId,
    request.crew,
    request.plannedMinutes,
    request.equipmentChecks,
  );

export const objectOriented: Approach = {
  id: "object-oriented",
  name: "オブジェクト指向",
  tier: "比較",
  reporting: "all",
  summary:
    "条件を規則オブジェクトに、事実の持ち主を協力者オブジェクトにして、方針オブジェクトが多態で問い合わせる。",
  decide: (request) => policyFor(request).evaluate(candidateFor(request)),
};
