import type { AnyDomainEvent } from "../../../domain/aggregate/domainEvent.js";

export type EventRecord = Readonly<{
  eventId: string;
  aggregateId: string;
  aggregateName: string;
  aggregateState: unknown | null;
  eventName: string;
  eventPayload: Readonly<Record<string, unknown>>;
  occurredAt: string;
  lunarDay: number;
  actorUserId: string;
}>;

/** 作業記録の1行。aggregateState と eventPayload には呼び出し側が選んだ安全な値だけを渡す */
export const toEventRecord = (
  event: AnyDomainEvent,
  aggregateState: unknown,
  eventPayload: Readonly<Record<string, unknown>>,
): EventRecord => ({
  eventId: String(event.eventId),
  aggregateId: String(event.aggregateId),
  aggregateName: event.aggregateName,
  aggregateState: aggregateState ?? null,
  eventName: event.eventName,
  eventPayload,
  occurredAt: String(event.occurredAt),
  lunarDay: Number(event.lunarDay),
  actorUserId: String(event.actorUserId),
});
