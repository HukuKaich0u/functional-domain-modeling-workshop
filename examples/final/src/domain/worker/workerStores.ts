import type { ResultAsync } from "neverthrow";

import type { AggregateStore } from "../aggregate/aggregateStore.js";
import type { WorkerDeleted, WorkerRegistered, WorkerUpdated } from "./workerEvent.js";
import type { WorkerId } from "./workerId.js";

export type WorkerAlreadyExists = Readonly<{ kind: "WorkerAlreadyExists"; workerId: WorkerId }>;
export type WorkerRegisteredStore = Readonly<{
  store: (event: WorkerRegistered) => ResultAsync<void, WorkerAlreadyExists>;
}>;
export type WorkerUpdatedStore = AggregateStore<WorkerUpdated>;
export type WorkerHasActivePermitStoreError = Readonly<{
  kind: "WorkerHasActivePermit";
  workerId: WorkerId;
}>;
export type WorkerNotFoundStoreError = Readonly<{ kind: "WorkerNotFound"; workerId: WorkerId }>;
export type WorkerDeletedStoreError = WorkerHasActivePermitStoreError | WorkerNotFoundStoreError;
export type WorkerDeletedStore = Readonly<{
  store: (event: WorkerDeleted) => ResultAsync<void, WorkerDeletedStoreError>;
}>;
