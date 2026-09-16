import { z } from "zod";

import { schemaResult } from "../shared/schemaResult.js";
import { Sensitive } from "../shared/sensitive.js";

/** 滞在1回あたりの上限 50 mSv */
export const EXPOSURE_LIMIT_MICRO_SV = 50_000;
/** 月面での船外作業1時間あたりに増える被ばく量 */
export const SURFACE_EXPOSURE_RATE_MICRO_SV_PER_HOUR = 60;

/**
 * 被ばく量（µSv）。医務が管理し、承認の判定にのみ用いる（規程第8条）。
 * Sensitive で包み、JSON、文字列化、inspect では値を出さない。
 */
const RadiationExposureBrand = Symbol();
const RadiationExposureSchema = z
  .number()
  .int()
  .nonnegative()
  .brand<typeof RadiationExposureBrand>()
  .transform(Sensitive.of);

export type RadiationExposure = z.infer<typeof RadiationExposureSchema>;

export const RadiationExposure = {
  schema: RadiationExposureSchema,
  parse: schemaResult(RadiationExposureSchema),
} as const;

export const expectedExposureIncreaseMicroSv = (plannedMinutes: number): number =>
  Math.ceil((plannedMinutes / 60) * SURFACE_EXPOSURE_RATE_MICRO_SV_PER_HOUR);

/** 判定の中だけで unwrap する */
export const isExposureWithinLimit = (
  currentExposure: RadiationExposure,
  plannedMinutes: number,
): boolean =>
  currentExposure.unwrap() + expectedExposureIncreaseMicroSv(plannedMinutes) <= EXPOSURE_LIMIT_MICRO_SV;
