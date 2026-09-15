import type {
  Approved,
  EvaApproved,
  EvaPermit,
  PermitId,
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

export type Dependencies = Readonly<{
  resolver: PermitResolver;
  doses: CrewDoseResolver;
  spaceWeather: SpaceWeather;
  store: ApprovedStore;
}>;

export type EffectsDependencies = Readonly<{
  resolver: PermitResolver;
  doses: CrewDoseResolver;
  spaceWeather: SpaceWeather;
  stateStore: Readonly<{
    save: (permit: Approved) => Promise<void>;
  }>;
  workLog: Readonly<{
    append: (event: EvaApproved) => Promise<void>;
  }>;
}>;
