import { z } from "zod";

import type { FlareAlert } from "../domain/spaceWeather/index.js";
import { schemaResult } from "../shared/schemaResult.js";

const SpaceWeatherReportSchema = z
  .object({
    issuedAt: z.string().min(1),
    alertLevel: z.enum(["none", "S1", "S2", "S3", "S4", "S5"]),
    stations: z.array(z.string().min(1)).readonly(),
  })
  .readonly();

export type SpaceWeatherReport = z.infer<typeof SpaceWeatherReportSchema>;

export const SpaceWeatherReport = {
  schema: SpaceWeatherReportSchema,
  parse: schemaResult(SpaceWeatherReportSchema),
} as const;

export const toFlareAlert = (report: SpaceWeatherReport): FlareAlert =>
  report.alertLevel === "none"
    ? { kind: "Clear" }
    : { kind: "Active", level: report.alertLevel, issuedAt: report.issuedAt };
