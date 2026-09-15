import type { SegmentId } from "../lockout/index.js";
import type { EquipmentCheck, WorkerId } from "../worker/index.js";
import type { PermitId } from "./permitId.js";
import type { ZoneId } from "./zoneId.js";

export type Crew = readonly [WorkerId, WorkerId];
export type EquipmentChecks = readonly [EquipmentCheck, EquipmentCheck];
export type Approver = "base-commander" | "ground-control";
export type AbortReason = string;

export type ReturnRecord =
  | Readonly<{ kind: "Planned" }>
  | Readonly<{ kind: "Emergency"; reason: string }>;

export type Requested = Readonly<{
  kind: "Requested";
  permitId: PermitId;
  zoneId: ZoneId;
  crew: Crew;
  plannedMinutes: number;
  requestedAt: string;
}>;

export type Approved = Readonly<{
  kind: "Approved";
  permitId: PermitId;
  zoneId: ZoneId;
  crew: Crew;
  plannedMinutes: number;
  requestedAt: string;
  segmentId: SegmentId;
  equipmentChecks: EquipmentChecks;
  approvedAt: string;
  approvedBy: Approver;
}>;

export type Outside = Readonly<{
  kind: "Outside";
  permitId: PermitId;
  zoneId: ZoneId;
  crew: Crew;
  plannedMinutes: number;
  requestedAt: string;
  segmentId: SegmentId;
  equipmentChecks: EquipmentChecks;
  approvedAt: string;
  approvedBy: Approver;
  egressAt: string;
}>;

export type Returned = Readonly<{
  kind: "Returned";
  permitId: PermitId;
  zoneId: ZoneId;
  crew: Crew;
  plannedMinutes: number;
  requestedAt: string;
  segmentId: SegmentId;
  equipmentChecks: EquipmentChecks;
  approvedAt: string;
  approvedBy: Approver;
  egressAt: string;
  returnedAt: string;
  returnRecord: ReturnRecord;
}>;

export type Closed = Readonly<{
  kind: "Closed";
  permitId: PermitId;
  zoneId: ZoneId;
  crew: Crew;
  plannedMinutes: number;
  requestedAt: string;
  segmentId: SegmentId;
  equipmentChecks: EquipmentChecks;
  approvedAt: string;
  approvedBy: Approver;
  egressAt: string;
  returnedAt: string;
  returnRecord: ReturnRecord;
  lockoutRemovedAt: string;
  closedAt: string;
}>;

export type Aborted = Readonly<{
  kind: "Aborted";
  permitId: PermitId;
  zoneId: ZoneId;
  crew: Crew;
  plannedMinutes: number;
  requestedAt: string;
  reason: AbortReason;
  abortedAt: string;
  abortedBy: Approver;
}>;

export type EvaPermit =
  | Requested
  | Approved
  | Outside
  | Returned
  | Closed
  | Aborted;

export type ApproveInput = Readonly<{
  segmentId: SegmentId;
  equipmentChecks: EquipmentChecks;
  approvedBy: Approver;
}>;

export type CloseInput = Readonly<{ lockoutRemovedAt: string }>;
