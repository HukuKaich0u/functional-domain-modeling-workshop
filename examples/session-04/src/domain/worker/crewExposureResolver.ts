import type { RadiationExposure } from "./radiationExposure.js";
import type { WorkerId } from "./workerId.js";

export type CrewExposureResolver = Readonly<{
  resolve: (workerId: WorkerId) => RadiationExposure;
}>;
