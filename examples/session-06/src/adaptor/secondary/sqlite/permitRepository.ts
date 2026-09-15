import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import type {
  Approved,
  EvaPermit,
  Requested,
} from "../../../domain/permit/index.js";
import type {
  ApprovedStore,
  PermitResolver,
} from "../../../useCase/dependencies.js";
import type { SqliteDatabase } from "./db.js";
import { parsePersistedPermit } from "./persistedPermit.js";
import { PermitPersistenceError } from "./permitPersistenceError.js";
import { permitsTable, workLogsTable } from "./schema.js";

export const INITIAL_WORK_LOG_EVENT_ID = "00000000-0000-4000-8000-000000000000";

export type EvaApprovedWorkLogPayload = Readonly<{
  permitId: string;
  zoneId: string;
  segmentId: string;
  crew: readonly string[];
  approvedAt: string;
  approvedBy: string;
}>;

export type WorkLog = Readonly<{
  eventId: string;
  permitId: string;
  eventName: string;
  payload: unknown;
  occurredAt: string;
  lunarDay: number;
}>;

export type PermitRepository = PermitResolver &
  ApprovedStore &
  Readonly<{
    find: (permitId: string) => EvaPermit | undefined;
    reset: (initialPermit: Requested) => void;
    save: (permit: EvaPermit) => void;
    seedIfEmpty: (initialPermit: Requested) => void;
    listWorkLogs: () => WorkLog[];
  }>;

const toPermitRow = (permit: EvaPermit) => ({
  permitId: permit.permitId,
  zoneId: permit.zoneId,
  status: permit.kind,
  state: JSON.stringify(permit),
});

const toEvaApprovedWorkLogPayload = (
  permit: Approved,
): EvaApprovedWorkLogPayload => ({
  permitId: permit.permitId,
  zoneId: permit.zoneId,
  segmentId: permit.segmentId,
  crew: permit.crew,
  approvedAt: permit.approvedAt,
  approvedBy: permit.approvedBy,
});

export const createPermitRepository = (
  database: SqliteDatabase,
): PermitRepository => {
  const find = (permitId: string): EvaPermit | undefined => {
    let row: Readonly<{ state: string }> | undefined;
    try {
      row = database
        .select({ state: permitsTable.state })
        .from(permitsTable)
        .where(sql`${permitsTable.permitId} = ${permitId}`)
        .get();
    } catch (cause) {
      throw new PermitPersistenceError("resolve", cause);
    }

    return row === undefined ? undefined : parsePersistedPermit(row.state);
  };

  const saveState = (permit: EvaPermit): void => {
    const row = toPermitRow(permit);
    try {
      database
        .insert(permitsTable)
        .values(row)
        .onConflictDoUpdate({ target: permitsTable.permitId, set: row })
        .run();
    } catch (cause) {
      throw new PermitPersistenceError("save-state", cause);
    }
  };

  const appendWorkLog = (
    eventId: string,
    eventName: string,
    occurredAt: string,
    payload: unknown,
    permitId: string,
  ): void => {
    try {
      database
        .insert(workLogsTable)
        .values({ eventId, eventName, occurredAt, payload, permitId, lunarDay: 1 })
        .run();
    } catch (cause) {
      throw new PermitPersistenceError("append-work-log", cause);
    }
  };

  const appendEvaApprovedWorkLog = (permit: Approved): void => {
    const payload = toEvaApprovedWorkLogPayload(permit);
    appendWorkLog(
      randomUUID(),
      "EvaApproved",
      payload.approvedAt,
      payload,
      payload.permitId,
    );
  };

  const save = (permit: EvaPermit): void => {
    saveState(permit);
    if (permit.kind === "Approved") {
      appendEvaApprovedWorkLog(permit);
    }
  };

  const reset = (initialPermit: Requested): void => {
    database.transaction((transaction) => {
      try {
        transaction.delete(workLogsTable).run();
        transaction.delete(permitsTable).run();
        transaction.insert(permitsTable).values(toPermitRow(initialPermit)).run();
      } catch (cause) {
        throw new PermitPersistenceError("save-state", cause);
      }

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
    });
  };

  return {
    find,
    resolveById: find,
    save,
    reset,
    seedIfEmpty: (initialPermit) => {
      let row: Readonly<{ permitId: string }> | undefined;
      try {
        row = database
          .select({ permitId: permitsTable.permitId })
          .from(permitsTable)
          .get();
      } catch (cause) {
        throw new PermitPersistenceError("resolve", cause);
      }
      if (row === undefined) reset(initialPermit);
    },
    listWorkLogs: () => {
      try {
        return database
          .select()
          .from(workLogsTable)
          .orderBy(sql`rowid`)
          .all();
      } catch (cause) {
        throw new PermitPersistenceError("resolve", cause);
      }
    },
  };
};
