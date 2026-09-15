import type {
  Approved,
  EvaPermit,
  PermitId,
  Requested,
} from "../domain/permit/index.js";
import type { FlareAlert } from "../domain/spaceWeather/index.js";
import type { CrewDoseResolver } from "../domain/worker/index.js";

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

export type PermitStore = PermitResolver &
  Readonly<{
    find: (permitId: string) => EvaPermit | undefined;
    reset: () => Requested;
    save: (permit: EvaPermit) => void;
  }>;

export type Dependencies = Readonly<{
  resolver: PermitResolver;
  doses: CrewDoseResolver;
  spaceWeather: SpaceWeather;
  store: ApprovedStore;
}>;
