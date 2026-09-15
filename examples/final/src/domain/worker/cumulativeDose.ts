import { z } from "zod";

import { schemaResult } from "../shared/schemaResult.js";
import { Sensitive } from "../shared/sensitive.js";

/** 滞在1回あたりの上限 50 mSv */
export const DOSE_LIMIT_MICRO_SV = 50_000;
/** 月面の線量率。予測線量の計算に使う */
export const SURFACE_DOSE_RATE_MICRO_SV_PER_HOUR = 60;

/**
 * 累積線量（µSv）。医務が管理し、承認の判定にのみ用いる（規程第8条）。
 * Sensitive で包み、JSON、文字列化、inspect では値を出さない。
 */
const CumulativeDoseBrand = Symbol();
const CumulativeDoseSchema = z
  .number()
  .int()
  .nonnegative()
  .brand<typeof CumulativeDoseBrand>()
  .transform(Sensitive.of);

export type CumulativeDose = z.infer<typeof CumulativeDoseSchema>;

export const CumulativeDose = {
  schema: CumulativeDoseSchema,
  parse: schemaResult(CumulativeDoseSchema),
} as const;

export const predictedDoseMicroSv = (plannedMinutes: number): number =>
  Math.ceil((plannedMinutes / 60) * SURFACE_DOSE_RATE_MICRO_SV_PER_HOUR);

/** 判定の中だけで unwrap する */
export const isWithinDoseLimit = (
  cumulative: CumulativeDose,
  plannedMinutes: number,
): boolean =>
  cumulative.unwrap() + predictedDoseMicroSv(plannedMinutes) <= DOSE_LIMIT_MICRO_SV;
