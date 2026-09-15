import { FlareAlert } from "../domain/spaceWeather/index.js";
import type { SpaceWeather } from "../useCase/dependencies.js";

export const createStaticSpaceWeather = (
  alert: FlareAlert = FlareAlert.clear,
): SpaceWeather => ({
  currentAlert: () => alert,
});
