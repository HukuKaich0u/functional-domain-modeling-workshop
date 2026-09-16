import type { EventContext } from "../../src/domain/aggregate/eventContext.js";
import { EventId } from "../../src/domain/aggregate/eventId.js";
import { LunarDay } from "../../src/domain/aggregate/lunarDay.js";
import { Timestamp } from "../../src/domain/aggregate/timestamp.js";
import { EquipmentCheckId, EquipmentNote, OxygenMinutes } from "../../src/domain/equipmentCheck/index.js";
import type { EquipmentCheck } from "../../src/domain/equipmentCheck/index.js";
import { PermitId, PermitPurpose, PlannedMinutes, ZoneId } from "../../src/domain/permit/index.js";
import type { Approved, Outside, Requested, Returned } from "../../src/domain/permit/index.js";
import { SegmentId, SegmentLabel } from "../../src/domain/segment/index.js";
import type { EnergizedSegment, LockedOutSegment } from "../../src/domain/segment/index.js";
import { FlareAlertLevel, SpaceWeatherReportId } from "../../src/domain/spaceWeather/index.js";
import type { SpaceWeatherReport } from "../../src/domain/spaceWeather/index.js";
import { PasswordHash } from "../../src/domain/user/passwordHash.js";
import type { User } from "../../src/domain/user/user.js";
import { UserEmail } from "../../src/domain/user/userEmail.js";
import { UserId } from "../../src/domain/user/userId.js";
import { UserName } from "../../src/domain/user/userName.js";
import { RadiationExposure, WorkerId } from "../../src/domain/worker/index.js";
import type { Worker } from "../../src/domain/worker/index.js";

/** テスト用の固定値。個人名は出さず、役割と番号で呼ぶ */
export const ids = {
  admin: UserId.schema.parse("00000000-0000-4000-8000-000000000001"),
  groundControl: UserId.schema.parse("00000000-0000-4000-8000-000000000002"),
  baseCommander: UserId.schema.parse("00000000-0000-4000-8000-000000000003"),
  electrician: UserId.schema.parse("00000000-0000-4000-8000-000000000004"),
  electricianB: UserId.schema.parse("00000000-0000-4000-8000-000000000005"),
  permit: PermitId.schema.parse("EVA-0412"),
  otherPermit: PermitId.schema.parse("EVA-0413"),
  zone: ZoneId.schema.parse("PV-07"),
  segment: SegmentId.schema.parse("PV-07"),
  otherSegment: SegmentId.schema.parse("PV-08"),
  workerA: WorkerId.schema.parse("W-01"),
  workerB: WorkerId.schema.parse("W-02"),
  workerC: WorkerId.schema.parse("W-03"),
  checkA: EquipmentCheckId.schema.parse("10000000-0000-4000-8000-000000000001"),
  checkB: EquipmentCheckId.schema.parse("10000000-0000-4000-8000-000000000002"),
  report: SpaceWeatherReportId.schema.parse("20000000-0000-4000-8000-000000000001"),
} as const;

export const passwordHash = PasswordHash.schema.parse(
  `scrypt$${"A".repeat(22)}==$${"B".repeat(86)}==`,
);

export const userOf = <TKind extends User["kind"]>(
  kind: TKind,
  userId: UserId,
): Extract<User, { kind: TKind }> =>
  ({
    kind,
    userId,
    email: UserEmail.schema.parse(`${kind.toLowerCase()}@moonbase.test`),
    name: UserName.schema.parse(kind),
    passwordHash,
  }) as Extract<User, { kind: TKind }>;
export const admin = userOf("Admin", ids.admin);
export const groundControl = userOf("GroundControl", ids.groundControl);
export const baseCommander = userOf("BaseCommander", ids.baseCommander);
export const electrician = userOf("Electrician", ids.electrician);
export const electricianB = userOf("Electrician", ids.electricianB);

export const at = (iso: string) => Timestamp.schema.parse(iso);
export const day = (value: number) => LunarDay.schema.parse(value);

export const eventContext = (
  sequence: number,
  overrides: Partial<EventContext> = {},
): EventContext => ({
  eventId: EventId.schema.parse(`30000000-0000-4000-8000-${sequence.toString().padStart(12, "0")}`),
  occurredAt: at(new Date(Date.parse("2026-09-15T00:00:00.000Z") + sequence * 60_000).toISOString()),
  lunarDay: day(7),
  actorUserId: ids.baseCommander,
  ...overrides,
});

export const requested: Requested = {
  kind: "Requested",
  permitId: ids.permit,
  zoneId: ids.zone,
  crew: [ids.workerA, ids.workerB],
  plannedMinutes: PlannedMinutes.schema.parse(120),
  purpose: PermitPurpose.schema.parse("PV-07 の接続箱を交換する"),
  requestedAt: at("2026-09-15T00:00:00.000Z"),
};
export const approved: Approved = {
  ...requested,
  kind: "Approved",
  segmentId: ids.segment,
  approvedBy: ids.baseCommander,
  approvedAt: at("2026-09-15T00:10:00.000Z"),
  approvalLunarDay: day(7),
};
export const outside: Outside = {
  ...approved,
  kind: "Outside",
  egressAt: at("2026-09-15T00:20:00.000Z"),
};
export const returned: Returned = {
  ...outside,
  kind: "Returned",
  returnedAt: at("2026-09-15T02:00:00.000Z"),
  returnRecord: { kind: "Planned" },
};

export const energizedSegment: EnergizedSegment = {
  segmentId: ids.segment,
  label: SegmentLabel.schema.parse("PV-07 給電区間"),
  lockout: { kind: "Energized" },
};
export const lockedOutSegment: LockedOutSegment = {
  ...energizedSegment,
  lockout: {
    kind: "LockedOut",
    permitId: ids.permit,
    taggedBy: ids.electrician,
    taggedAt: at("2026-09-15T00:05:00.000Z"),
  },
};

export const worker = (workerId: WorkerId, exposureMicroSv = 10_000): Worker => ({
  workerId,
  qualification: "General",
  radiationExposureMicroSv: RadiationExposure.schema.parse(exposureMicroSv),
});

export const equipmentCheck = (
  checkId: EquipmentCheckId,
  workerId: WorkerId,
  oxygenMinutes = 200,
): EquipmentCheck => ({
  checkId,
  permitId: ids.permit,
  workerId,
  checkedAt: at("2026-09-15T00:03:00.000Z"),
  oxygenMinutes: OxygenMinutes.schema.parse(oxygenMinutes),
  note: EquipmentNote.schema.parse("左グローブのシールを交換済み"),
  needsMaintenance: false,
});

export const weather = (alertLevel: SpaceWeatherReport["alertLevel"] = "none"): SpaceWeatherReport => ({
  reportId: ids.report,
  issuedAt: at("2026-09-14T23:00:00.000Z"),
  alertLevel: FlareAlertLevel.schema.parse(alertLevel),
  stations: ["GOES-19", "ACE"],
});
