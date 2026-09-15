import { sql } from "drizzle-orm";

import type { EvaPermit } from "../../../domain/permit/permit.js";
import type { SqliteDatabase } from "./db.js";
import { permitsTable, workLogsTable } from "./schema.js";

export const INITIAL_WORK_LOG_EVENT_ID = "00000000-0000-4000-8000-000000000000";

export type WorkLog = Readonly<{
  eventId: string;
  permitId: string;
  eventName: string;
  payload: EvaPermit;
  occurredAt: string;
}>;

type WorkLogEvent = Readonly<{
  eventId: string;
  eventName: string;
  occurredAt: string;
  permit: EvaPermit;
}>;

export type PermitRepository = Readonly<{
  find: (permitId: string) => EvaPermit | undefined;
  save: (permit: EvaPermit) => void;
  appendWorkLog: (event: WorkLogEvent) => void;
  listWorkLogs: () => WorkLog[];
  reset: (initialPermit: EvaPermit) => void;
  seedIfEmpty: (initialPermit: EvaPermit) => void;
}>;

const toPermitRow = (permit: EvaPermit) => ({
  permitId: permit.permitId,
  zoneId: permit.zoneId,
  status: permit.status,
  state: permit,
});

const toInitialWorkLog = (permit: EvaPermit): WorkLog => ({
  eventId: INITIAL_WORK_LOG_EVENT_ID,
  permitId: permit.permitId,
  eventName: "permit.requested",
  payload: permit,
  occurredAt: permit.requestedAt,
});

export const createPermitRepository = (
  db: SqliteDatabase,
): PermitRepository => {
  const save = (permit: EvaPermit): void => {
    const row = toPermitRow(permit);

    db.insert(permitsTable)
      .values(row)
      .onConflictDoUpdate({
        target: permitsTable.permitId,
        set: row,
      })
      .run();
  };

  const appendWorkLog = ({ permit, ...event }: WorkLogEvent): void => {
    db.insert(workLogsTable)
      .values({
        ...event,
        permitId: permit.permitId,
        payload: permit,
      })
      .run();
  };

  const reset = (initialPermit: EvaPermit): void => {
    db.transaction((transaction) => {
      transaction.delete(workLogsTable).run();
      transaction.delete(permitsTable).run();
      transaction
        .insert(permitsTable)
        .values(toPermitRow(initialPermit))
        .run();
      transaction
        .insert(workLogsTable)
        .values(toInitialWorkLog(initialPermit))
        .run();
    });
  };

  return {
    find: (permitId) => {
      const row = db
        .select({ state: permitsTable.state })
        .from(permitsTable)
        .where(sql`${permitsTable.permitId} = ${permitId}`)
        .get();

      return row === undefined ? undefined : (row.state as EvaPermit);
    },
    save,
    appendWorkLog,
    listWorkLogs: () =>
      db
        .select()
        .from(workLogsTable)
        .orderBy(sql`rowid`)
        .all()
        .map((log) => ({ ...log, payload: log.payload as EvaPermit })),
    reset,
    seedIfEmpty: (initialPermit) => {
      const permit = db
        .select({ permitId: permitsTable.permitId })
        .from(permitsTable)
        .get();

      if (permit === undefined) {
        reset(initialPermit);
      }
    },
  };
};
