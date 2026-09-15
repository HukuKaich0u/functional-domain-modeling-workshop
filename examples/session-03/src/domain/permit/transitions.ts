import type {
  AbortReason,
  ApproveInput,
  Approver,
  CloseInput,
  EvaPermit,
  ReturnRecord,
} from "./permit.js";

const requireKind = (permit: EvaPermit, allowedKinds: ReadonlyArray<EvaPermit["kind"]>): void => {
  if (!allowedKinds.includes(permit.kind)) {
    throw new Error(`Cannot transition from ${permit.kind}`);
  }
};

export const approve = (
  permit: EvaPermit,
  input: ApproveInput,
  approvedAt: string,
): EvaPermit => {
  requireKind(permit, ["Requested"]);
  return ({ ...permit, ...input, kind: "Approved", approvedAt }) as EvaPermit;
};

export const egress = (permit: EvaPermit, egressAt: string): EvaPermit => {
  requireKind(permit, ["Approved"]);
  return ({ ...permit, kind: "Outside", egressAt }) as EvaPermit;
};

export const returnToBase = (
  permit: EvaPermit,
  returnRecord: ReturnRecord,
  returnedAt: string,
): EvaPermit => {
  requireKind(permit, ["Outside"]);
  return ({ ...permit, kind: "Returned", returnRecord, returnedAt }) as EvaPermit;
};

export const close = (
  permit: EvaPermit,
  input: CloseInput,
  closedAt: string,
): EvaPermit => {
  requireKind(permit, ["Returned"]);
  return ({ ...permit, ...input, kind: "Closed", closedAt }) as EvaPermit;
};

export const abort = (
  permit: EvaPermit,
  reason: AbortReason | undefined,
  abortedAt: string,
  abortedBy: Approver,
): EvaPermit => {
  requireKind(permit, ["Requested", "Approved"]);
  if (reason === undefined) throw new Error("Abort reason is required");
  return ({
    kind: "Aborted",
    permitId: permit.permitId,
    zoneId: permit.zoneId,
    crew: permit.crew,
    plannedMinutes: permit.plannedMinutes,
    requestedAt: permit.requestedAt,
    reason,
    abortedAt,
    abortedBy,
  }) as EvaPermit;
};
