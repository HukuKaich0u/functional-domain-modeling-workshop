import { CumulativeDose } from "../domain/worker/index.js";
import type { CrewDoseResolver } from "../useCase/dependencies.js";

export const createFixtureCrewDoseResolver = (
  dosesMicroSv: Readonly<Record<string, number>>,
): CrewDoseResolver => ({
  resolve: (workerId) => CumulativeDose.of(dosesMicroSv[workerId] ?? 0),
});
