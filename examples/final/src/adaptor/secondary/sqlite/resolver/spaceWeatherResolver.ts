import { desc } from "drizzle-orm";
import { ResultAsync } from "neverthrow";
import { z } from "zod";

import { Timestamp } from "../../../../domain/aggregate/timestamp.js";
import { FlareAlertLevel, SpaceWeatherReportId } from "../../../../domain/spaceWeather/index.js";
import type {
  CurrentSpaceWeatherResolver,
  SpaceWeatherListResolver,
  SpaceWeatherReport,
} from "../../../../domain/spaceWeather/index.js";
import type { SqliteDatabase } from "../db.js";
import { spaceWeatherReportsTable } from "../schema.js";

const SpaceWeatherStateSchema = z.object({
  reportId: SpaceWeatherReportId.schema,
  issuedAt: Timestamp.schema,
  alertLevel: FlareAlertLevel.schema,
  stations: z.array(z.string()).readonly(),
});
const SpaceWeatherRowSchema = z.object({
  reportId: SpaceWeatherReportId.schema,
  issuedAt: Timestamp.schema,
  alertLevel: FlareAlertLevel.schema,
  state: SpaceWeatherStateSchema,
});

export const parseSpaceWeatherRow = (raw: unknown): SpaceWeatherReport => {
  const row = SpaceWeatherRowSchema.parse(raw);
  if (
    row.reportId !== row.state.reportId ||
    row.issuedAt !== row.state.issuedAt ||
    row.alertLevel !== row.state.alertLevel
  ) {
    throw new TypeError("Corrupt space weather projection");
  }
  return row.state;
};

/** 発令時刻が最新の報告を現在の宇宙天気とする */
export const createCurrentSpaceWeatherResolver = (
  db: SqliteDatabase,
): CurrentSpaceWeatherResolver => ({
  resolveCurrent: () =>
    ResultAsync.fromSafePromise(
      Promise.resolve().then(() => {
        const row = db
          .select()
          .from(spaceWeatherReportsTable)
          .orderBy(desc(spaceWeatherReportsTable.issuedAt))
          .limit(1)
          .get();
        return row === undefined ? undefined : parseSpaceWeatherRow(row);
      }),
    ),
});

export const createSpaceWeatherListResolver = (
  db: SqliteDatabase,
): SpaceWeatherListResolver => ({
  resolveAll: () =>
    ResultAsync.fromSafePromise(
      Promise.resolve().then(() =>
        db
          .select()
          .from(spaceWeatherReportsTable)
          .orderBy(desc(spaceWeatherReportsTable.issuedAt))
          .all()
          .map(parseSpaceWeatherRow),
      ),
    ),
});
