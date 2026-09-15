import { FlareAlert } from "../domain/spaceWeather/index.js";

export type SpaceWeather = Readonly<{
  currentAlert: () => FlareAlert;
}>;

export const createStaticSpaceWeather = (
  alert: FlareAlert = FlareAlert.clear,
): SpaceWeather => ({
  currentAlert: () => alert,
});
