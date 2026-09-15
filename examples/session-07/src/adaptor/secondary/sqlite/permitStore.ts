import { sql } from "drizzle-orm";
import { err, ok, ResultAsync } from "neverthrow";

import type {
  Approved,
  EvaApproved,
  EvaPermit,
  PermitId,
  Requested,
} from "../../../domain/permit/index.js";
import type { PermitResolver } from "../../../useCase/dependencies.js";
import type { PermitConflict } from "../../../useCase/errors.js";
import type { SqliteDatabase } from "./db.js";
import { parsePersistedPermit } from "./persistedPermit.js";
import { PermitPersistenceError } from "./permitPersistenceError.js";
import { permitsTable, workLogsTable } from "./schema.js";

export const INITIAL_WORK_LOG_EVENT_ID = "00000000-0000-4000-8000-000000000000";

type SqliteTransaction = Parameters<
  Parameters<SqliteDatabase["transaction"]>[0]
>[0];
type SqliteExecutor = SqliteDatabase | SqliteTransaction;

export type PermitStore = PermitResolver &
  Readonly<{
    atomicStore: Readonly<{
      store: (event: EvaApproved) => ResultAsync<void, PermitConflict>;
    }>;
    workLog: Readonly<{
      append: (event: EvaApproved) => Promise<void>;
    }>;
    find: (permitId: string) => EvaPermit | undefined;
    reset: () => Requested;
    save: (permit: EvaPermit) => void;
    seedIfEmpty: () => void;
    stateStore: Readonly<{
      save: (permit: Approved) => Promise<void>;
    }>;
  }>;

const toPermitRow = (permit: EvaPermit) => ({
  permitId: permit.permitId,
  zoneId: permit.zoneId,
  status: permit.kind,
  state: JSON.stringify(permit),
});

const toWorkLogRow = (event: EvaApproved) => ({
  permitId: event.permitId,
  eventId: event.eventId,
  eventName: event.kind,
  occurredAt: event.occurredAt,
  lunarDay: event.lunarDay,
  payload: event,
});

export const createPermitStore = (
  database: SqliteDatabase,
  initialPermit: Requested,
): PermitStore => {
  const findWith = (
    executor: SqliteExecutor,
    permitId: string,
  ): EvaPermit | undefined => {
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

  const find = (permitId: string): EvaPermit | undefined =>
    findWith(database, permitId);

  const saveState = (executor: SqliteExecutor, permit: EvaPermit): void => {
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

      saveState(transaction, event.aggregateState);
      appendWorkLog(transaction, event);
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
    stateStore: {
      save: async (permit) => saveState(database, permit),
    },
    workLog: {
      append: async (event) => appendWorkLog(database, event),
    },
    atomicStore: {
      store: (event) =>
        ResultAsync.fromSafePromise(
          Promise.resolve().then(() => storeAtomically(event)),
        ).andThen((result) => result),
    },
  };
};
