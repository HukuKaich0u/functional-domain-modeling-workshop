import { err, ok, type Result } from "neverthrow";

import type {
  EquipmentChecks,
  EvaPermit,
  PermitId,
  Requested,
} from "../domain/permit/index.js";
import type { FlareAlert } from "../domain/spaceWeather/index.js";
import {
  hasEnoughOxygen,
  isExposureWithinLimit,
  type CrewExposureResolver,
  type WorkerId,
} from "../domain/worker/index.js";

export const ensurePermitFound = (
  permit: EvaPermit | undefined,
  permitId: PermitId,
): EvaPermit => {
  if (permit === undefined) {
    throw new Error(`Permit ${permitId} was not found`);
  }

  return permit;
};

export const ensureRequested = (permit: EvaPermit): Requested => {
  if (permit.kind !== "Requested") {
    throw new Error(`Permit state was ${permit.kind}`);
  }

  return permit;
};

// 以下の判定は先に Result を返す形へ書き換え済み。ユースケース側は
// まだ Err を例外へ変換している。

export const LAST_DAYLIGHT_LUNAR_DAY = 14;

export type InsufficientOxygen = Readonly<{
  kind: "InsufficientOxygen";
  workerId: WorkerId;
}>;

export type ExposureLimitExceeded = Readonly<{
  kind: "ExposureLimitExceeded";
  workerId: WorkerId;
}>;

export type FlareAlertActive = Readonly<{
  kind: "FlareAlertActive";
}>;

export type NightTime = Readonly<{
  kind: "NightTime";
  lunarDay: number;
}>;

export const ensureDaytime = (
  permit: Requested,
  lunarDay: number,
): Result<Requested, NightTime> =>
  lunarDay <= LAST_DAYLIGHT_LUNAR_DAY
    ? ok(permit)
    : err({ kind: "NightTime", lunarDay });

export const ensureNoFlareAlert = (
  permit: Requested,
  alert: FlareAlert,
): Result<Requested, FlareAlertActive> =>
  alert.kind === "Clear" ? ok(permit) : err({ kind: "FlareAlertActive" });

export const ensureOxygen = (
  permit: Requested,
  checks: EquipmentChecks,
): Result<Requested, InsufficientOxygen> => {
  const short = checks.find(
    (check) => !hasEnoughOxygen(check, permit.plannedMinutes),
  );
  return short === undefined
    ? ok(permit)
    : err({ kind: "InsufficientOxygen", workerId: short.workerId });
};

export const ensureExposureWithinLimit = (
  permit: Requested,
  exposures: CrewExposureResolver,
): Result<Requested, ExposureLimitExceeded> => {
  const exceeded = permit.crew.find(
    (workerId) =>
      !isExposureWithinLimit(exposures.resolve(workerId), permit.plannedMinutes),
  );
  return exceeded === undefined
    ? ok(permit)
    : err({ kind: "ExposureLimitExceeded", workerId: exceeded });
};
