import type { ResultAsync } from "neverthrow";

import type { SpaceWeatherReport } from "./spaceWeatherReport.js";

/** 最新の報告。まだ報告がなければ undefined */
export type CurrentSpaceWeatherResolver = Readonly<{
  resolveCurrent: () => ResultAsync<SpaceWeatherReport | undefined, never>;
}>;

export type SpaceWeatherListResolver = Readonly<{
  resolveAll: () => ResultAsync<readonly SpaceWeatherReport[], never>;
}>;
