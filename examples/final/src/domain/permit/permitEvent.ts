import type { DomainEvent } from "../aggregate/domainEvent.js";
import type { EventContext } from "../aggregate/eventContext.js";
import type { SegmentId } from "../segment/index.js";
import type { UserId } from "../user/userId.js";
import type {
  Aborted,
  Approved,
  Closed,
  EvaPermit,
  Outside,
  Requested,
  Returned,
  ReturnRecord,
} from "./permit.js";
import type { PermitId } from "./permitId.js";
import type { ZoneId } from "./zoneId.js";

type PermitDomainEvent<
  TAggregateState extends EvaPermit,
  TKind extends string,
  TEventName extends string,
  TEventPayload extends Readonly<Record<string, unknown>>,
> = Readonly<
  Omit<
    DomainEvent<PermitId, "EvaPermit", TAggregateState, TKind, TEventName, TEventPayload>,
    "aggregateState"
  > & {
    aggregateState: TAggregateState;
  }
>;

export type PermitRequested = PermitDomainEvent<
  Requested,
  "PermitRequested",
  "permit.requested",
  Readonly<{ permitId: PermitId; zoneId: ZoneId }>
>;

export type EvaApproved = PermitDomainEvent<
  Approved,
  "EvaApproved",
  "permit.eva-approved",
  Readonly<{ permitId: PermitId; segmentId: SegmentId; approvedBy: UserId }>
>;

export type CrewEgressed = PermitDomainEvent<
  Outside,
  "CrewEgressed",
  "permit.crew-egressed",
  Readonly<{ permitId: PermitId }>
>;

export type CrewReturned = PermitDomainEvent<
  Returned,
  "CrewReturned",
  "permit.crew-returned",
  Readonly<{ permitId: PermitId; returnKind: ReturnRecord["kind"] }>
>;

export type PermitClosed = PermitDomainEvent<
  Closed,
  "PermitClosed",
  "permit.closed",
  Readonly<{ permitId: PermitId; segmentId: SegmentId }>
>;

export type PermitAborted = PermitDomainEvent<
  Aborted,
  "PermitAborted",
  "permit.aborted",
  Readonly<{ permitId: PermitId; abortedBy: UserId }>
>;

export type PermitEvent =
  | PermitRequested
  | EvaApproved
  | CrewEgressed
  | CrewReturned
  | PermitClosed
  | PermitAborted;

const create = <
  TAggregateState extends EvaPermit,
  TKind extends string,
  TEventName extends string,
  TEventPayload extends Readonly<Record<string, unknown>>,
>(
  context: EventContext,
  aggregateId: PermitId,
  aggregateState: TAggregateState,
  kind: TKind,
  eventName: TEventName,
  eventPayload: TEventPayload,
): PermitDomainEvent<TAggregateState, TKind, TEventName, TEventPayload> => ({
  kind,
  eventId: context.eventId,
  aggregateId,
  aggregateName: "EvaPermit",
  aggregateState,
  eventName,
  eventPayload,
  occurredAt: context.occurredAt,
  lunarDay: context.lunarDay,
  actorUserId: context.actorUserId,
});

export const PermitEvent = { create } as const;
