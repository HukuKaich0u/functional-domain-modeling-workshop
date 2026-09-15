import type { EquipmentCheck, WorkerId } from "../worker/index.js";
import type { PermitId } from "./permitId.js";

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
  zoneId: string;
  crew: Crew;
  plannedMinutes: number;
  requestedAt: string;
}>;

export type Approved = Readonly<{
  kind: "Approved";
  permitId: PermitId;
  zoneId: string;
  crew: Crew;
  plannedMinutes: number;
  requestedAt: string;
  segmentId: string;
  equipmentChecks: EquipmentChecks;
  approvedAt: string;
  approvedBy: Approver;
}>;

export type Outside = Readonly<{
  kind: "Outside";
  permitId: PermitId;
  zoneId: string;
  crew: Crew;
  plannedMinutes: number;
  requestedAt: string;
  segmentId: string;
  equipmentChecks: EquipmentChecks;
  approvedAt: string;
  approvedBy: Approver;
  egressAt: string;
}>;

export type Returned = Readonly<{
  kind: "Returned";
  permitId: PermitId;
  zoneId: string;
  crew: Crew;
  plannedMinutes: number;
  requestedAt: string;
  segmentId: string;
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
  zoneId: string;
  crew: Crew;
  plannedMinutes: number;
  requestedAt: string;
  segmentId: string;
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
  zoneId: string;
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
  segmentId: string;
  equipmentChecks: EquipmentChecks;
  approvedBy: Approver;
}>;

export type CloseInput = Readonly<{ lockoutRemovedAt: string }>;
