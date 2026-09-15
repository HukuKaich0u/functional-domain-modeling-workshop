import Database from "better-sqlite3";

export type WorkLogObservation = Readonly<{
  permitId: string;
  eventId: string;
  eventName: string;
  occurredAt: string;
  payload: unknown;
}>;

export type PermitObservation = Readonly<{
  state: unknown;
  workLogs: readonly WorkLogObservation[];
}>;

const parseJson = (value: string, column: string): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error(`Could not parse SQLite ${column} JSON`, { cause: error });
  }
};

export const observePermit = (
  databasePath: string,
  permitId: string,
): PermitObservation => {
  const database = new Database(databasePath, { readonly: true });

  try {
    const permit = database
      .prepare("SELECT state FROM permits WHERE permit_id = ?")
      .get(permitId) as Readonly<{ state: string }> | undefined;
    if (permit === undefined) {
      throw new Error(`Permit was not persisted: ${permitId}`);
    }

    const workLogs = database
      .prepare(
        "SELECT permit_id AS permitId, event_id AS eventId, event_name AS eventName, occurred_at AS occurredAt, payload FROM work_logs ORDER BY rowid",
      )
      .all() as ReadonlyArray<Readonly<{
        permitId: string;
        eventId: string;
        eventName: string;
        occurredAt: string;
        payload: string;
      }>>;

    return {
      state: parseJson(permit.state, "permits.state"),
      workLogs: workLogs.map((workLog) => ({
        permitId: workLog.permitId,
        eventId: workLog.eventId,
        eventName: workLog.eventName,
        occurredAt: workLog.occurredAt,
        payload: parseJson(workLog.payload, "work_logs.payload"),
      })),
    };
  } finally {
    database.close();
  }
};
