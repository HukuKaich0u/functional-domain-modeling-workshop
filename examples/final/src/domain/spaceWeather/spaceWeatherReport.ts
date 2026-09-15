import type { EventContext } from "../aggregate/eventContext.js";
import type { Timestamp } from "../aggregate/timestamp.js";
import type { FlareAlert, FlareAlertLevel } from "./flareAlertLevel.js";
import { createSpaceWeatherReported, type SpaceWeatherReported } from "./spaceWeatherEvent.js";
import type { SpaceWeatherReportId } from "./spaceWeatherReportId.js";

export type SpaceWeatherReport = Readonly<{
  reportId: SpaceWeatherReportId;
  issuedAt: Timestamp;
  alertLevel: FlareAlertLevel;
  stations: readonly string[];
}>;

const report = (context: EventContext) => (weather: SpaceWeatherReport): SpaceWeatherReported =>
  createSpaceWeatherReported(context, weather);

/** 最新の報告からフレア警報の有無を導く。報告がなければ警報なしとは見なさず、呼び出し側が判断する */
export const toFlareAlert = (weather: SpaceWeatherReport): FlareAlert =>
  weather.alertLevel === "none"
    ? { kind: "Clear" }
    : { kind: "Active", level: weather.alertLevel, issuedAt: weather.issuedAt };

export const SpaceWeatherReport = {
  report,
} as const;
