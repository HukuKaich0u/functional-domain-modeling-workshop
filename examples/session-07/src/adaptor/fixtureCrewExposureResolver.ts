import { RadiationExposure } from "../domain/worker/index.js";
import type { CrewExposureResolver } from "../useCase/dependencies.js";

export const createFixtureCrewExposureResolver = (
  exposuresMicroSv: Readonly<Record<string, number>>,
): CrewExposureResolver => ({
  resolve: (workerId) => RadiationExposure.of(exposuresMicroSv[workerId] ?? 0),
});
