import { Sensitive } from "../../shared/sensitive.js";

export type CumulativeDose = Sensitive<number>;

export const DOSE_LIMIT_MICRO_SV = 50_000;
export const SURFACE_DOSE_RATE_MICRO_SV_PER_HOUR = 60;

export const CumulativeDose = {
  of: (microSv: number): CumulativeDose => Sensitive.of(microSv),
} as const;

export const predictedDoseMicroSv = (plannedMinutes: number): number =>
  (plannedMinutes / 60) * SURFACE_DOSE_RATE_MICRO_SV_PER_HOUR;

export const isWithinDoseLimit = (
  cumulative: CumulativeDose,
  plannedMinutes: number,
): boolean =>
  cumulative.unwrap() + predictedDoseMicroSv(plannedMinutes) <=
  DOSE_LIMIT_MICRO_SV;
