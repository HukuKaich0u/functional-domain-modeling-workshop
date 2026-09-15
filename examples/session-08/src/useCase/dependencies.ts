import type { ResultAsync } from "neverthrow";

import type { Clock } from "../domain/aggregate/clock.js";
import type { EventIdGenerator } from "../domain/aggregate/eventIdGenerator.js";
import type {
  Approved,
  EvaApproved,
  EvaPermit,
  PermitId,
} from "../domain/permit/index.js";
import type { FlareAlert } from "../domain/spaceWeather/index.js";
import type { CrewDoseResolver } from "../domain/worker/index.js";
import type { PermitConflict } from "./errors.js";

export type PermitResolver = Readonly<{
  resolveById: (permitId: PermitId) => EvaPermit | undefined;
}>;

export type { CrewDoseResolver };

export type SpaceWeather = Readonly<{
  currentAlert: () => FlareAlert;
}>;

export type ApprovedStore = Readonly<{
  save: (permit: Approved) => void;
}>;

export type Dependencies = Readonly<{
  resolver: PermitResolver;
  doses: CrewDoseResolver;
  spaceWeather: SpaceWeather;
  store: ApprovedStore;
}>;

export type EventContextDependencies = Readonly<{
  clock: Clock;
  eventIdGenerator: EventIdGenerator;
}>;

export type EvaApprovedStore = Readonly<{
  store: (event: EvaApproved) => ResultAsync<void, PermitConflict>;
}>;

export type EffectsDependencies = Readonly<{
  resolver: PermitResolver;
  doses: CrewDoseResolver;
  spaceWeather: SpaceWeather;
  store: EvaApprovedStore;
}> &
  EventContextDependencies;
