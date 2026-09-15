import type { DomainEvent } from "../aggregate/domainEvent.js";
import type { EventContext } from "../aggregate/eventContext.js";
import type { PermitId } from "../permit/index.js";
import type { EnergizedSegment, LockedOutSegment, Segment } from "./segment.js";
import type { SegmentId } from "./segmentId.js";

type SegmentDomainEvent<
  TAggregateState extends Segment | undefined,
  TKind extends string,
  TEventName extends string,
  TEventPayload extends Readonly<Record<string, unknown>>,
> = Readonly<
  Omit<
    DomainEvent<SegmentId, "Segment", TAggregateState, TKind, TEventName, TEventPayload>,
    "aggregateState"
  > & {
    aggregateState: TAggregateState;
  }
>;

type SegmentPayload = Readonly<{ segmentId: SegmentId }>;
type LockoutPayload = Readonly<{ segmentId: SegmentId; permitId: PermitId }>;

export type SegmentRegistered = SegmentDomainEvent<Segment, "SegmentRegistered", "segment.registered", SegmentPayload>;
export type SegmentUpdated = SegmentDomainEvent<Segment, "SegmentUpdated", "segment.updated", SegmentPayload>;
export type SegmentDeleted = SegmentDomainEvent<undefined, "SegmentDeleted", "segment.deleted", SegmentPayload>;
export type LockoutTagged = SegmentDomainEvent<LockedOutSegment, "LockoutTagged", "segment.lockout-tagged", LockoutPayload>;
export type LockoutRemoved = SegmentDomainEvent<EnergizedSegment, "LockoutRemoved", "segment.lockout-removed", LockoutPayload>;

export type SegmentEvent =
  | SegmentRegistered
  | SegmentUpdated
  | SegmentDeleted
  | LockoutTagged
  | LockoutRemoved;

const create = <
  TAggregateState extends Segment | undefined,
  TKind extends string,
  TEventName extends string,
  TEventPayload extends Readonly<Record<string, unknown>>,
>(
  context: EventContext,
  aggregateId: SegmentId,
  aggregateState: TAggregateState,
  kind: TKind,
  eventName: TEventName,
  eventPayload: TEventPayload,
): SegmentDomainEvent<TAggregateState, TKind, TEventName, TEventPayload> => ({
  kind,
  eventId: context.eventId,
  aggregateId,
  aggregateName: "Segment",
  aggregateState,
  eventName,
  eventPayload,
  occurredAt: context.occurredAt,
  lunarDay: context.lunarDay,
  actorUserId: context.actorUserId,
});

export const createSegmentRegistered = (context: EventContext, segment: Segment): SegmentRegistered =>
  create(context, segment.segmentId, segment, "SegmentRegistered", "segment.registered", {
    segmentId: segment.segmentId,
  });

export const createSegmentUpdated = (context: EventContext, segment: Segment): SegmentUpdated =>
  create(context, segment.segmentId, segment, "SegmentUpdated", "segment.updated", {
    segmentId: segment.segmentId,
  });

export const createSegmentDeleted = (context: EventContext, segmentId: SegmentId): SegmentDeleted =>
  create(context, segmentId, undefined, "SegmentDeleted", "segment.deleted", { segmentId });

export const createLockoutTagged = (context: EventContext, segment: LockedOutSegment): LockoutTagged =>
  create(context, segment.segmentId, segment, "LockoutTagged", "segment.lockout-tagged", {
    segmentId: segment.segmentId,
    permitId: segment.lockout.permitId,
  });

export const createLockoutRemoved = (
  context: EventContext,
  segment: EnergizedSegment,
  permitId: PermitId,
): LockoutRemoved =>
  create(context, segment.segmentId, segment, "LockoutRemoved", "segment.lockout-removed", {
    segmentId: segment.segmentId,
    permitId,
  });
