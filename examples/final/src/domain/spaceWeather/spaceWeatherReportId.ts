import { z } from "zod";

import { schemaResult } from "../shared/schemaResult.js";

const SpaceWeatherReportIdBrand = Symbol();
const SpaceWeatherReportIdSchema = z.string().uuid().brand<typeof SpaceWeatherReportIdBrand>();

export type SpaceWeatherReportId = z.infer<typeof SpaceWeatherReportIdSchema>;

export const SpaceWeatherReportId = {
  schema: SpaceWeatherReportIdSchema,
  parse: schemaResult(SpaceWeatherReportIdSchema),
} as const;
