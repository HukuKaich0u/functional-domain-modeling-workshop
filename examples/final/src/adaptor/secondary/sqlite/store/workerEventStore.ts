import { and, eq, inArray, or } from "drizzle-orm";
import { err, ok, ResultAsync } from "neverthrow";

import type {
  Worker,
  WorkerDeleted,
  WorkerDeletedStore,
  WorkerRegistered,
  WorkerRegisteredStore,
  WorkerUpdated,
  WorkerUpdatedStore,
} from "../../../../domain/worker/index.js";
import type { SqliteDatabase } from "../db.js";
import { toEventRecord } from "../eventRecord.js";
import { domainEventsTable, permitsTable, workersTable } from "../schema.js";

const activeStatuses = ["Requested", "Approved", "Outside", "Returned"] as const;

/** 作業記録に残す状態。累積線量は含めない（規程第8条） */
export const safeWorkerState = (worker: Worker): Readonly<Record<string, unknown>> => ({
  workerId: worker.workerId,
  qualification: worker.qualification,
});

/** 現在状態の projection。医務の値はこの表にだけ平文で置く */
export const workerRowValues = (worker: Worker) => ({
  workerId: worker.workerId,
  qualification: worker.qualification,
  cumulativeDoseMicroSv: worker.cumulativeDoseMicroSv.unwrap(),
});

const appendEvent = (
  tx: Parameters<Parameters<SqliteDatabase["transaction"]>[0]>[0],
  event: WorkerRegistered | WorkerUpdated,
): void => {
  tx.insert(domainEventsTable)
    .values(toEventRecord(event, safeWorkerState(event.aggregateState), event.eventPayload))
    .run();
};

export const createWorkerRegisteredStore = (db: SqliteDatabase): WorkerRegisteredStore => ({
  store: (event) =>
    ResultAsync.fromSafePromise(
      Promise.resolve().then(() =>
        db.transaction((tx) => {
          const inserted = tx
            .insert(workersTable)
            .values(workerRowValues(event.aggregateState))
            .onConflictDoNothing({ target: workersTable.workerId })
            .run();
          if (inserted.changes !== 1) {
            return err({ kind: "WorkerAlreadyExists", workerId: event.aggregateId } as const);
          }
          appendEvent(tx, event);
          return ok(undefined);
        }),
      ),
    ).andThen((result) => result),
});

export const createWorkerUpdatedStore = (db: SqliteDatabase): WorkerUpdatedStore => ({
  store: (...events) =>
    ResultAsync.fromSafePromise(
      Promise.resolve().then(() =>
        db.transaction((tx) => {
          events.forEach((event) => {
            const values = workerRowValues(event.aggregateState);
            tx.insert(workersTable)
              .values(values)
              .onConflictDoUpdate({ target: workersTable.workerId, set: values })
              .run();
            appendEvent(tx, event);
          });
        }),
      ),
    ),
});

/** 進行中の作業許可に登録されている隊員は削除できない */
export const createWorkerDeletedStore = (db: SqliteDatabase): WorkerDeletedStore => ({
  store: (event: WorkerDeleted) =>
    ResultAsync.fromSafePromise(
      Promise.resolve().then(() =>
        db.transaction((tx) => {
          const blockingPermit = tx
            .select({ permitId: permitsTable.permitId })
            .from(permitsTable)
            .where(
              and(
                or(eq(permitsTable.crewA, event.aggregateId), eq(permitsTable.crewB, event.aggregateId)),
                inArray(permitsTable.status, activeStatuses),
              ),
            )
            .get();
          if (blockingPermit !== undefined) {
            return err({ kind: "WorkerHasActivePermit", workerId: event.aggregateId } as const);
          }

          const result = tx.delete(workersTable).where(eq(workersTable.workerId, event.aggregateId)).run();
          if (result.changes !== 1) {
            return err({ kind: "WorkerNotFound", workerId: event.aggregateId } as const);
          }

          tx.insert(domainEventsTable)
            .values(toEventRecord(event, undefined, event.eventPayload))
            .run();
          return ok(undefined);
        }),
      ),
    ).andThen((result) => result),
});
