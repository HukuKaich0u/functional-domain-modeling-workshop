import type { DomainEvent } from "../aggregate/domainEvent.js";
import type { EventContext } from "../aggregate/eventContext.js";
import type { FlareAlertLevel } from "./flareAlertLevel.js";
import type { SpaceWeatherReport } from "./spaceWeatherReport.js";
import type { SpaceWeatherReportId } from "./spaceWeatherReportId.js";

export type SpaceWeatherReported = Readonly<
  Omit<
    DomainEvent<
      SpaceWeatherReportId,
      "SpaceWeather",
      SpaceWeatherReport,
      "SpaceWeatherReported",
      "space-weather.reported",
      Readonly<{ reportId: SpaceWeatherReportId; alertLevel: FlareAlertLevel }>
    >,
    "aggregateState"
  > & {
    aggregateState: SpaceWeatherReport;
  }
>;

export type SpaceWeatherEvent = SpaceWeatherReported;

export const createSpaceWeatherReported = (
  context: EventContext,
  weather: SpaceWeatherReport,
): SpaceWeatherReported => ({
  kind: "SpaceWeatherReported",
  eventId: context.eventId,
  aggregateId: weather.reportId,
  aggregateName: "SpaceWeather",
  aggregateState: weather,
  eventName: "space-weather.reported",
  eventPayload: { reportId: weather.reportId, alertLevel: weather.alertLevel },
  occurredAt: context.occurredAt,
  lunarDay: context.lunarDay,
  actorUserId: context.actorUserId,
});
