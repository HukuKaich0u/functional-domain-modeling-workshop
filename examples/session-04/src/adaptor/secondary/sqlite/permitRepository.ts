import { sql } from "drizzle-orm";

import type { EvaPermit } from "../../../domain/permit/index.js";
import type { SqliteDatabase } from "./db.js";
import { permitsTable, workLogsTable } from "./schema.js";

export const INITIAL_WORK_LOG_EVENT_ID = "00000000-0000-4000-8000-000000000000";

export type CrewDoseContext = Readonly<Record<string, number>>;

export type PersistenceContext = Readonly<{
  crewDoseMicroSv: CrewDoseContext;
}>;

export type WorkLogEvent = Readonly<{
  eventId: string;
  eventName: string;
  occurredAt: string;
  permit: EvaPermit;
  payload: Readonly<Record<string, unknown>>;
}>;

export type WorkLog = Readonly<{
  eventId: string;
  permitId: string;
  eventName: string;
  payload: Readonly<Record<string, unknown>>;
  occurredAt: string;
  lunarDay: number;
}>;

export type PermitRepository = Readonly<{
  find: (permitId: string) => EvaPermit | undefined;
  save: (permit: EvaPermit) => void;
  appendWorkLog: (event: WorkLogEvent) => void;
  listWorkLogs: () => WorkLog[];
  reset: (initialPermit: EvaPermit, context: PersistenceContext) => void;
  seedIfEmpty: (initialPermit: EvaPermit, context: PersistenceContext) => void;
}>;

const toPermitRow = (permit: EvaPermit, crewDose: CrewDoseContext) => ({
  permitId: permit.permitId,
  zoneId: permit.zoneId,
  status: permit.kind,
  state: permit,
  crewDose,
});

export const createPermitRepository = (
  database: SqliteDatabase,
): PermitRepository => {
  const crewDoseFor = (permitId: string): CrewDoseContext => {
    const row = database
      .select({ crewDose: permitsTable.crewDose })
      .from(permitsTable)
      .where(sql`${permitsTable.permitId} = ${permitId}`)
      .get();

    if (row === undefined) throw new Error("Permit not found");
    return row.crewDose as CrewDoseContext;
  };

  const save = (permit: EvaPermit): void => {
    const row = toPermitRow(permit, crewDoseFor(permit.permitId));

    database
      .insert(permitsTable)
      .values(row)
      .onConflictDoUpdate({ target: permitsTable.permitId, set: row })
      .run();
  };

  const appendWorkLog = ({ permit, payload, ...event }: WorkLogEvent): void => {
    database
      .insert(workLogsTable)
      .values({
        ...event,
        permitId: permit.permitId,
        lunarDay: 1,
        payload: {
          ...payload,
          permit,
          crewDose: crewDoseFor(permit.permitId),
        },
      })
      .run();
  };

  const reset = (initialPermit: EvaPermit, context: PersistenceContext): void => {
    database.transaction((transaction) => {
      transaction.delete(workLogsTable).run();
      transaction.delete(permitsTable).run();
      transaction
        .insert(permitsTable)
        .values(toPermitRow(initialPermit, context.crewDoseMicroSv))
        .run();
      transaction
        .insert(workLogsTable)
        .values({
          eventId: INITIAL_WORK_LOG_EVENT_ID,
          permitId: initialPermit.permitId,
          eventName: "PermitRequested",
          occurredAt: initialPermit.requestedAt,
          lunarDay: 1,
          payload: {
            permit: initialPermit,
            crewDose: context.crewDoseMicroSv,
          },
        })
        .run();
    });
  };

  return {
    find: (permitId) => {
      const row = database
        .select({ state: permitsTable.state })
        .from(permitsTable)
        .where(sql`${permitsTable.permitId} = ${permitId}`)
        .get();
      return row === undefined ? undefined : (row.state as EvaPermit);
    },
    save,
    appendWorkLog,
    listWorkLogs: () =>
      database
        .select()
        .from(workLogsTable)
        .orderBy(sql`rowid`)
        .all()
        .map((log) => ({
          ...log,
          payload: log.payload as Readonly<Record<string, unknown>>,
        })),
    reset,
    seedIfEmpty: (initialPermit, context) => {
      const row = database
        .select({ permitId: permitsTable.permitId })
        .from(permitsTable)
        .get();
      if (row === undefined) reset(initialPermit, context);
    },
  };
};
