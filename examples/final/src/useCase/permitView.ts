import type { LunarDay } from "../domain/aggregate/lunarDay.js";
import type { Timestamp } from "../domain/aggregate/timestamp.js";
import type {
  Crew,
  EvaPermit,
  PermitId,
  PlannedMinutes,
  ReturnRecord,
  ZoneId,
} from "../domain/permit/index.js";
import type { SegmentId } from "../domain/segment/index.js";
import { assertNever } from "../domain/shared/assertNever.js";
import type { UserId } from "../domain/user/userId.js";

type PermitViewBase = Readonly<{
  permitId: PermitId;
  zoneId: ZoneId;
  crew: Crew;
  plannedMinutes: PlannedMinutes;
  requestedAt: Timestamp;
}>;
type ApprovedFields = Readonly<{
  segmentId: SegmentId;
  approvedBy: UserId;
  approvedAt: Timestamp;
  approvalLunarDay: LunarDay;
}>;
type RequestedPermitView = PermitViewBase & Readonly<{ kind: "Requested" }>;
type ApprovedPermitView = PermitViewBase & ApprovedFields & Readonly<{ kind: "Approved" }>;
type OutsidePermitView = PermitViewBase & ApprovedFields & Readonly<{ kind: "Outside"; egressAt: Timestamp }>;
type ReturnedPermitView = PermitViewBase &
  ApprovedFields &
  Readonly<{
    kind: "Returned";
    egressAt: Timestamp;
    returnedAt: Timestamp;
    returnKind: ReturnRecord["kind"];
  }>;
type ClosedPermitView = PermitViewBase &
  ApprovedFields &
  Readonly<{
    kind: "Closed";
    egressAt: Timestamp;
    returnedAt: Timestamp;
    returnKind: ReturnRecord["kind"];
    lockoutRemovedAt: Timestamp;
    closedAt: Timestamp;
  }>;
type AbortedPermitView = PermitViewBase &
  Readonly<{ kind: "Aborted"; abortedBy: UserId; abortedAt: Timestamp }>;

/** 画面向けの表現。作業内容、中止理由、緊急帰還の理由は載せない */
export type PermitView =
  | RequestedPermitView
  | ApprovedPermitView
  | OutsidePermitView
  | ReturnedPermitView
  | ClosedPermitView
  | AbortedPermitView;

export const toPermitView = (permit: EvaPermit): PermitView => {
  const base = {
    permitId: permit.permitId,
    zoneId: permit.zoneId,
    crew: permit.crew,
    plannedMinutes: permit.plannedMinutes,
    requestedAt: permit.requestedAt,
  } as const;
  switch (permit.kind) {
    case "Requested":
      return { ...base, kind: permit.kind };
    case "Approved":
      return {
        ...base,
        kind: permit.kind,
        segmentId: permit.segmentId,
        approvedBy: permit.approvedBy,
        approvedAt: permit.approvedAt,
        approvalLunarDay: permit.approvalLunarDay,
      };
    case "Outside":
      return {
        ...base,
        kind: permit.kind,
        segmentId: permit.segmentId,
        approvedBy: permit.approvedBy,
        approvedAt: permit.approvedAt,
        approvalLunarDay: permit.approvalLunarDay,
        egressAt: permit.egressAt,
      };
    case "Returned":
      return {
        ...base,
        kind: permit.kind,
        segmentId: permit.segmentId,
        approvedBy: permit.approvedBy,
        approvedAt: permit.approvedAt,
        approvalLunarDay: permit.approvalLunarDay,
        egressAt: permit.egressAt,
        returnedAt: permit.returnedAt,
        returnKind: permit.returnRecord.kind,
      };
    case "Closed":
      return {
        ...base,
        kind: permit.kind,
        segmentId: permit.segmentId,
        approvedBy: permit.approvedBy,
        approvedAt: permit.approvedAt,
        approvalLunarDay: permit.approvalLunarDay,
        egressAt: permit.egressAt,
        returnedAt: permit.returnedAt,
        returnKind: permit.returnRecord.kind,
        lockoutRemovedAt: permit.lockoutRemovedAt,
        closedAt: permit.closedAt,
      };
    case "Aborted":
      return { ...base, kind: permit.kind, abortedBy: permit.abortedBy, abortedAt: permit.abortedAt };
    default:
      return assertNever(permit);
  }
};
