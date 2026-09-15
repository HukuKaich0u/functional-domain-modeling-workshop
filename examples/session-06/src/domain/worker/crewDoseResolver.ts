import type { CumulativeDose } from "./cumulativeDose.js";
import type { WorkerId } from "./workerId.js";

export type CrewDoseResolver = Readonly<{
  resolve: (workerId: WorkerId) => CumulativeDose;
}>;
