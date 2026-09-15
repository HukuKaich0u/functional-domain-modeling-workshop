import type { DomainEvent } from "../aggregate/domainEvent.js";
import type { EventContext } from "../aggregate/eventContext.js";
import type { Worker } from "./worker.js";
import type { WorkerId } from "./workerId.js";

type WorkerDomainEvent<
  TAggregateState extends Worker | undefined,
  TKind extends string,
  TEventName extends string,
> = Readonly<
  Omit<
    DomainEvent<WorkerId, "Worker", TAggregateState, TKind, TEventName, Readonly<{ workerId: WorkerId }>>,
    "aggregateState"
  > & {
    aggregateState: TAggregateState;
  }
>;

export type WorkerRegistered = WorkerDomainEvent<Worker, "WorkerRegistered", "worker.registered">;
export type WorkerUpdated = WorkerDomainEvent<Worker, "WorkerUpdated", "worker.updated">;
export type WorkerDeleted = WorkerDomainEvent<undefined, "WorkerDeleted", "worker.deleted">;

export type WorkerEvent = WorkerRegistered | WorkerUpdated | WorkerDeleted;

const create = <
  TAggregateState extends Worker | undefined,
  TKind extends string,
  TEventName extends string,
>(
  context: EventContext,
  aggregateId: WorkerId,
  aggregateState: TAggregateState,
  kind: TKind,
  eventName: TEventName,
): WorkerDomainEvent<TAggregateState, TKind, TEventName> => ({
  kind,
  eventId: context.eventId,
  aggregateId,
  aggregateName: "Worker",
  aggregateState,
  eventName,
  eventPayload: { workerId: aggregateId },
  occurredAt: context.occurredAt,
  lunarDay: context.lunarDay,
  actorUserId: context.actorUserId,
});

export const createWorkerRegistered = (context: EventContext, worker: Worker): WorkerRegistered =>
  create(context, worker.workerId, worker, "WorkerRegistered", "worker.registered");

export const createWorkerUpdated = (context: EventContext, worker: Worker): WorkerUpdated =>
  create(context, worker.workerId, worker, "WorkerUpdated", "worker.updated");

export const createWorkerDeleted = (context: EventContext, workerId: WorkerId): WorkerDeleted =>
  create(context, workerId, undefined, "WorkerDeleted", "worker.deleted");
