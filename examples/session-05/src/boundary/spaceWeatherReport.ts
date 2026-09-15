import type { FlareAlert } from "../domain/spaceWeather/index.js";
import { ok, type Result } from "../shared/schemaResult.js";

export type SpaceWeatherReport = Readonly<{
  issuedAt: string;
  alertLevel: "none" | "S1" | "S2" | "S3" | "S4" | "S5";
  stations: ReadonlyArray<string>;
}>;

export const SpaceWeatherReport = {
  parse: (raw: any): Result<SpaceWeatherReport> =>
    ok({
      issuedAt: raw.issuedAt,
      alertLevel: raw.alertLevel ?? "none",
      stations: raw.stations ?? [],
    }),
} as const;

export const toFlareAlert = (report: SpaceWeatherReport): FlareAlert =>
  report.alertLevel === "none"
    ? { kind: "Clear" }
    : { kind: "Active", level: report.alertLevel, issuedAt: report.issuedAt };
