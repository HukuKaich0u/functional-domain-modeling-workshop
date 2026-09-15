import type {
  AbortReason,
  Aborted,
  Approved,
  ApproveInput,
  Approver,
  CloseInput,
  Closed,
  Outside,
  Requested,
  ReturnRecord,
  Returned,
} from "./permit.js";

export const approve = (
  permit: Requested,
  input: ApproveInput,
  approvedAt: string,
): Approved =>
  ({ ...permit, ...input, kind: "Approved", approvedAt }) as const satisfies Approved;

export const egress = (permit: Approved, egressAt: string): Outside =>
  ({ ...permit, kind: "Outside", egressAt }) as const satisfies Outside;

export const returnToBase = (
  permit: Outside,
  returnRecord: ReturnRecord,
  returnedAt: string,
): Returned =>
  ({ ...permit, kind: "Returned", returnRecord, returnedAt }) as const satisfies Returned;

export const close = (
  permit: Returned,
  input: CloseInput,
  closedAt: string,
): Closed =>
  ({ ...permit, ...input, kind: "Closed", closedAt }) as const satisfies Closed;

export const abort = (
  permit: Requested | Approved,
  reason: AbortReason,
  abortedAt: string,
  abortedBy: Approver,
): Aborted =>
  ({
    kind: "Aborted",
    permitId: permit.permitId,
    zoneId: permit.zoneId,
    crew: permit.crew,
    plannedMinutes: permit.plannedMinutes,
    requestedAt: permit.requestedAt,
    reason,
    abortedAt,
    abortedBy,
  }) as const satisfies Aborted;
