import type { EventContext } from "../aggregate/eventContext.js";
import type { LunarDay } from "../aggregate/lunarDay.js";
import type { Timestamp } from "../aggregate/timestamp.js";
import type { SegmentId } from "../segment/index.js";
import type { UserId } from "../user/userId.js";
import type { WorkerId } from "../worker/index.js";
import type { AbortReason } from "./abortReason.js";
import type { EmergencyReason } from "./emergencyReason.js";
import {
  PermitEvent,
  type CrewEgressed,
  type CrewReturned,
  type EvaApproved,
  type PermitAborted,
  type PermitClosed,
  type PermitRequested,
} from "./permitEvent.js";
import type { PermitId } from "./permitId.js";
import type { PermitPurpose } from "./permitPurpose.js";
import type { PlannedMinutes } from "./plannedMinutes.js";
import type { ZoneId } from "./zoneId.js";

/** 2名1組（規程第4条）。長さ2のタプルで表す */
export type Crew = readonly [WorkerId, WorkerId];

export type ReturnRecord =
  | Readonly<{ kind: "Planned" }>
  | Readonly<{ kind: "Emergency"; reason: EmergencyReason }>;

export type Requested = Readonly<{
  kind: "Requested";
  permitId: PermitId;
  zoneId: ZoneId;
  crew: Crew;
  plannedMinutes: PlannedMinutes;
  purpose: PermitPurpose;
  requestedAt: Timestamp;
}>;

export type Approved = Readonly<{
  kind: "Approved";
  permitId: PermitId;
  zoneId: ZoneId;
  crew: Crew;
  plannedMinutes: PlannedMinutes;
  purpose: PermitPurpose;
  requestedAt: Timestamp;
  segmentId: SegmentId;
  approvedBy: UserId;
  approvedAt: Timestamp;
  approvalLunarDay: LunarDay;
}>;

export type Outside = Readonly<{
  kind: "Outside";
  permitId: PermitId;
  zoneId: ZoneId;
  crew: Crew;
  plannedMinutes: PlannedMinutes;
  purpose: PermitPurpose;
  requestedAt: Timestamp;
  segmentId: SegmentId;
  approvedBy: UserId;
  approvedAt: Timestamp;
  approvalLunarDay: LunarDay;
  egressAt: Timestamp;
}>;

export type Returned = Readonly<{
  kind: "Returned";
  permitId: PermitId;
  zoneId: ZoneId;
  crew: Crew;
  plannedMinutes: PlannedMinutes;
  purpose: PermitPurpose;
  requestedAt: Timestamp;
  segmentId: SegmentId;
  approvedBy: UserId;
  approvedAt: Timestamp;
  approvalLunarDay: LunarDay;
  egressAt: Timestamp;
  returnedAt: Timestamp;
  returnRecord: ReturnRecord;
}>;

export type Closed = Readonly<{
  kind: "Closed";
  permitId: PermitId;
  zoneId: ZoneId;
  crew: Crew;
  plannedMinutes: PlannedMinutes;
  purpose: PermitPurpose;
  requestedAt: Timestamp;
  segmentId: SegmentId;
  approvedBy: UserId;
  approvedAt: Timestamp;
  approvalLunarDay: LunarDay;
  egressAt: Timestamp;
  returnedAt: Timestamp;
  returnRecord: ReturnRecord;
  lockoutRemovedAt: Timestamp;
  closedAt: Timestamp;
}>;

export type Aborted = Readonly<{
  kind: "Aborted";
  permitId: PermitId;
  zoneId: ZoneId;
  crew: Crew;
  plannedMinutes: PlannedMinutes;
  purpose: PermitPurpose;
  requestedAt: Timestamp;
  abortReason: AbortReason;
  abortedBy: UserId;
  abortedAt: Timestamp;
}>;

export type EvaPermit = Requested | Approved | Outside | Returned | Closed | Aborted;
export type RequestPermitInput = Readonly<Omit<Requested, "kind">>;
export type ApproveInput = Readonly<{ segmentId: SegmentId }>;

const request =
  (context: EventContext) =>
  (input: RequestPermitInput): PermitRequested => {
    const aggregateState = { kind: "Requested", ...input } as const satisfies Requested;

    return PermitEvent.create(
      context,
      aggregateState.permitId,
      aggregateState,
      "PermitRequested",
      "permit.requested",
      { permitId: aggregateState.permitId, zoneId: aggregateState.zoneId },
    );
  };

/** 開始承認。承認者、地球時、月面日は実行コンテキストから一度だけ取る */
const approve =
  (context: EventContext) =>
  (requested: Requested, input: ApproveInput): EvaApproved => {
    const aggregateState = {
      ...requested,
      kind: "Approved",
      segmentId: input.segmentId,
      approvedBy: context.actorUserId,
      approvedAt: context.occurredAt,
      approvalLunarDay: context.lunarDay,
    } as const satisfies Approved;

    return PermitEvent.create(
      context,
      aggregateState.permitId,
      aggregateState,
      "EvaApproved",
      "permit.eva-approved",
      {
        permitId: aggregateState.permitId,
        segmentId: aggregateState.segmentId,
        approvedAt: aggregateState.approvedAt,
        approvedBy: aggregateState.approvedBy,
      },
    );
  };

const egress =
  (context: EventContext) =>
  (approved: Approved): CrewEgressed => {
    const aggregateState = {
      ...approved,
      kind: "Outside",
      egressAt: context.occurredAt,
    } as const satisfies Outside;

    return PermitEvent.create(
      context,
      aggregateState.permitId,
      aggregateState,
      "CrewEgressed",
      "permit.crew-egressed",
      { permitId: aggregateState.permitId },
    );
  };

const returnToBase =
  (context: EventContext) =>
  (outside: Outside, returnRecord: ReturnRecord): CrewReturned => {
    const aggregateState = {
      ...outside,
      kind: "Returned",
      returnedAt: context.occurredAt,
      returnRecord,
    } as const satisfies Returned;

    return PermitEvent.create(
      context,
      aggregateState.permitId,
      aggregateState,
      "CrewReturned",
      "permit.crew-returned",
      { permitId: aggregateState.permitId, returnKind: returnRecord.kind },
    );
  };

/** 完了。電気主任が遮断札を外し、作業記録を確認した時刻を記録する */
const close =
  (context: EventContext) =>
  (returned: Returned): PermitClosed => {
    const aggregateState = {
      ...returned,
      kind: "Closed",
      lockoutRemovedAt: context.occurredAt,
      closedAt: context.occurredAt,
    } as const satisfies Closed;

    return PermitEvent.create(
      context,
      aggregateState.permitId,
      aggregateState,
      "PermitClosed",
      "permit.closed",
      { permitId: aggregateState.permitId, segmentId: aggregateState.segmentId },
    );
  };

/** 中止。出発前（申請済・承認済）だけ受け取り、理由を必須にする */
const abort =
  (context: EventContext) =>
  (permit: Requested | Approved, abortReason: AbortReason): PermitAborted => {
    const aggregateState = {
      kind: "Aborted",
      permitId: permit.permitId,
      zoneId: permit.zoneId,
      crew: permit.crew,
      plannedMinutes: permit.plannedMinutes,
      purpose: permit.purpose,
      requestedAt: permit.requestedAt,
      abortReason,
      abortedBy: context.actorUserId,
      abortedAt: context.occurredAt,
    } as const satisfies Aborted;

    return PermitEvent.create(
      context,
      aggregateState.permitId,
      aggregateState,
      "PermitAborted",
      "permit.aborted",
      { permitId: aggregateState.permitId, abortedBy: aggregateState.abortedBy },
    );
  };

export const EvaPermit = {
  request,
  approve,
  egress,
  returnToBase,
  close,
  abort,
  /** 完了と中止以外は進行中。系統区間や隊員の削除を止める判定に使う */
  isActive: (permit: EvaPermit) =>
    permit.kind === "Requested" ||
    permit.kind === "Approved" ||
    permit.kind === "Outside" ||
    permit.kind === "Returned",
  /** 出発後（作業中・帰還済）は遮断札を外せない */
  isOutside: (permit: EvaPermit) => permit.kind === "Outside" || permit.kind === "Returned",
} as const;
