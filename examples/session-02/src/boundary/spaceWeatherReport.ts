export type SpaceWeatherReport = any;

export const SpaceWeatherReport = {
  parse: (raw: any): SpaceWeatherReport => raw,
} as const;
