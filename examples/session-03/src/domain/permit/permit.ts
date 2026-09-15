export type AbortReason = string;
export type Approver = "base-commander" | "ground-control";

export type EquipmentCheck = Readonly<{
  workerId: string;
  oxygenMinutes: number;
  checkedAt: string;
}>;

export type Crew = readonly [string, string];
export type EquipmentChecks = readonly [EquipmentCheck, EquipmentCheck];

export type ReturnRecord =
  | Readonly<{ kind: "Planned" }>
  | Readonly<{ kind: "Emergency"; reason: string }>;

export type Requested = Readonly<{
  kind: "Requested";
  permitId: string;
  zoneId: string;
  crew: Crew;
  plannedMinutes: number;
  requestedAt: string;
}>;

export type Approved = Readonly<{
  kind: "Approved";
  permitId: string;
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
  permitId: string;
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
  permitId: string;
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
  permitId: string;
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
  permitId: string;
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
