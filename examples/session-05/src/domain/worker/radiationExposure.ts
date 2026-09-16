export type RadiationExposure = number;

export const EXPOSURE_LIMIT_MICRO_SV = 50_000;
export const SURFACE_EXPOSURE_RATE_MICRO_SV_PER_HOUR = 60;

export const RadiationExposure = {
  of: (microSv: number): RadiationExposure => microSv,
} as const;

export const expectedExposureIncreaseMicroSv = (plannedMinutes: number): number =>
  (plannedMinutes / 60) * SURFACE_EXPOSURE_RATE_MICRO_SV_PER_HOUR;

export const isExposureWithinLimit = (
  currentExposure: RadiationExposure,
  plannedMinutes: number,
): boolean =>
  currentExposure + expectedExposureIncreaseMicroSv(plannedMinutes) <= EXPOSURE_LIMIT_MICRO_SV;
