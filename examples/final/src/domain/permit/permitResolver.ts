import type { ResultAsync } from "neverthrow";

import type { WorkerId } from "../worker/index.js";
import type { EvaPermit } from "./permit.js";
import type { PermitId } from "./permitId.js";
import type { ZoneId } from "./zoneId.js";

export type PermitByIdResolver = Readonly<{
  resolveById: (permitId: PermitId) => ResultAsync<EvaPermit | undefined, never>;
}>;

export type PermitByWorkerIdResolver = Readonly<{
  resolveByWorkerId: (workerId: WorkerId) => ResultAsync<readonly EvaPermit[], never>;
}>;

export type PermitByZoneIdResolver = Readonly<{
  resolveByZoneId: (zoneId: ZoneId) => ResultAsync<readonly EvaPermit[], never>;
}>;

export type PermitListResolver = Readonly<{
  resolveAll: () => ResultAsync<readonly EvaPermit[], never>;
}>;
