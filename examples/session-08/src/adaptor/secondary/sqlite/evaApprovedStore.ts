import { sql } from "drizzle-orm";
import { err, ok, ResultAsync } from "neverthrow";

import {
  EvaPermit,
  type EvaApproved,
  type EvaPermit as EvaPermitState,
  type PermitId,
  type Requested,
} from "../../../domain/permit/index.js";
import type {
  EvaApprovedStore as EvaApprovedStorePort,
  PermitResolver,
} from "../../../useCase/dependencies.js";
import type { SqliteDatabase } from "./db.js";
import { parsePersistedPermit } from "./persistedPermit.js";
import { PermitPersistenceError } from "./permitPersistenceError.js";
import { permitsTable, workLogsTable } from "./schema.js";

export const INITIAL_WORK_LOG_EVENT_ID = "00000000-0000-4000-8000-000000000000";

type SqliteTransaction = Parameters<
  Parameters<SqliteDatabase["transaction"]>[0]
>[0];
type SqliteExecutor = SqliteDatabase | SqliteTransaction;

export type SqliteEvaApprovedStore = PermitResolver &
  EvaApprovedStorePort &
  Readonly<{
    find: (permitId: string) => EvaPermitState | undefined;
    reset: () => Requested;
    save: (permit: EvaPermitState) => void;
    seedIfEmpty: () => void;
  }>;

const toPermitRow = (permit: EvaPermitState) => ({
  permitId: permit.permitId,
  zoneId: permit.zoneId,
  status: permit.kind,
  state: JSON.stringify(permit),
});

// 作業記録の payload には点呼に必要な最小限だけを残す。
// 装備点検の生データと被ばく量は入れない（規程第8条）。
const toWorkLogRow = (event: EvaApproved) => ({
  permitId: event.permitId,
  eventId: event.eventId,
  eventName: event.kind,
  occurredAt: event.occurredAt,
  lunarDay: event.lunarDay,
  payload: {
    permitId: event.permitId,
    zoneId: event.aggregateState.zoneId,
    segmentId: event.aggregateState.segmentId,
    crew: event.aggregateState.crew,
    approvedAt: event.aggregateState.approvedAt,
    approvedBy: event.aggregateState.approvedBy,
  },
});

export const createEvaApprovedStore = (
  database: SqliteDatabase,
  initialPermit: Requested,
): SqliteEvaApprovedStore => {
  const findWith = (
    executor: SqliteExecutor,
    permitId: string,
  ): EvaPermitState | undefined => {
    let row: Readonly<{ state: string }> | undefined;
    try {
      row = executor
        .select({ state: permitsTable.state })
        .from(permitsTable)
        .where(sql`${permitsTable.permitId} = ${permitId}`)
        .get();
    } catch (cause) {
      throw new PermitPersistenceError("resolve", cause);
    }

    return row === undefined ? undefined : parsePersistedPermit(row.state);
  };

  const find = (permitId: string): EvaPermitState | undefined =>
    findWith(database, permitId);

  const saveState = (executor: SqliteExecutor, permit: EvaPermitState): void => {
    const row = toPermitRow(permit);
    try {
      executor
        .insert(permitsTable)
        .values(row)
        .onConflictDoUpdate({ target: permitsTable.permitId, set: row })
        .run();
    } catch (cause) {
      throw new PermitPersistenceError("save-state", cause);
    }
  };

  const appendWorkLog = (executor: SqliteExecutor, event: EvaApproved): void => {
    try {
      executor.insert(workLogsTable).values(toWorkLogRow(event)).run();
    } catch (cause) {
      throw new PermitPersistenceError("append-work-log", cause);
    }
  };

  const reset = (): Requested =>
    database.transaction((transaction) => {
      try {
        transaction.delete(workLogsTable).run();
        transaction.delete(permitsTable).run();
      } catch (cause) {
        throw new PermitPersistenceError("save-state", cause);
      }

      saveState(transaction, initialPermit);
      try {
        transaction
          .insert(workLogsTable)
          .values({
            permitId: initialPermit.permitId,
            eventId: INITIAL_WORK_LOG_EVENT_ID,
            eventName: "PermitRequested",
            occurredAt: initialPermit.requestedAt,
            lunarDay: 1,
            payload: {
              permitId: initialPermit.permitId,
              zoneId: initialPermit.zoneId,
              crew: initialPermit.crew,
            },
          })
          .run();
      } catch (cause) {
        throw new PermitPersistenceError("append-work-log", cause);
      }
      return initialPermit;
    });

  const storeAtomically = (event: EvaApproved) =>
    database.transaction((transaction) => {
      const current = findWith(transaction, event.permitId);
      if (current === undefined || current.kind !== "Requested") {
        return err({
          kind: "PermitConflict",
          permitId: event.permitId as PermitId,
        } as const);
      }

      const committedEvent = EvaPermit.approve({
        eventId: event.eventId,
        occurredAt: event.occurredAt,
        lunarDay: event.lunarDay,
      })(current, {
        segmentId: event.aggregateState.segmentId,
        equipmentChecks: event.aggregateState.equipmentChecks,
        approvedBy: event.aggregateState.approvedBy,
      });

      saveState(transaction, committedEvent.aggregateState);
      appendWorkLog(transaction, committedEvent);
      return ok(undefined);
    });

  return {
    find,
    resolveById: find,
    reset,
    save: (permit) => saveState(database, permit),
    seedIfEmpty: () => {
      let row: Readonly<{ permitId: string }> | undefined;
      try {
        row = database
          .select({ permitId: permitsTable.permitId })
          .from(permitsTable)
          .get();
      } catch (cause) {
        throw new PermitPersistenceError("resolve", cause);
      }
      if (row === undefined) reset();
    },
    store: (event) =>
      ResultAsync.fromSafePromise(
        Promise.resolve().then(() => storeAtomically(event)),
      ).andThen((result) => result),
  };
};
