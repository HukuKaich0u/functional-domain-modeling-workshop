import { ResultAsync } from "neverthrow";

import type {
  SpaceWeatherReported,
  SpaceWeatherReportedStore,
} from "../../../../domain/spaceWeather/index.js";
import type { SqliteDatabase } from "../db.js";
import { toEventRecord } from "../eventRecord.js";
import { domainEventsTable, spaceWeatherReportsTable } from "../schema.js";

export const createSpaceWeatherEventStore = (db: SqliteDatabase): SpaceWeatherReportedStore => ({
  store: (...events: readonly SpaceWeatherReported[]) =>
    ResultAsync.fromSafePromise(
      Promise.resolve().then(() =>
        db.transaction((tx) => {
          events.forEach((event) => {
            const weather = event.aggregateState;
            tx.insert(spaceWeatherReportsTable)
              .values({
                reportId: weather.reportId,
                issuedAt: weather.issuedAt,
                alertLevel: weather.alertLevel,
                state: weather,
              })
              .run();
            tx.insert(domainEventsTable)
              .values(toEventRecord(event, weather, event.eventPayload))
              .run();
          });
        }),
      ),
    ),
});
