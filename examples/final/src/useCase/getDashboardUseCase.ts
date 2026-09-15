import { ok, safeTry, type ResultAsync } from "neverthrow";

import { EvaPermit } from "../domain/permit/index.js";
import type { EvaPermit as PermitState, PermitListResolver } from "../domain/permit/index.js";
import { Segment } from "../domain/segment/index.js";
import type { Segment as SegmentState, SegmentListResolver } from "../domain/segment/index.js";
import { toFlareAlert } from "../domain/spaceWeather/index.js";
import type {
  CurrentSpaceWeatherResolver,
  FlareAlert,
  SpaceWeatherReport,
} from "../domain/spaceWeather/index.js";
import type { UserId } from "../domain/user/userId.js";
import type { UserByIdResolver } from "../domain/user/userResolver.js";
import type { WorkerListResolver } from "../domain/worker/index.js";
import { ensureUserFound, type UnauthorizedError } from "./errors.js";
import { toPermitView, type PermitView } from "./permitView.js";
import { toSegmentView, type SegmentView } from "./segmentView.js";

export type DashboardCounts = Readonly<{
  segments: number;
  lockedOutSegments: number;
  workers: number;
  permits: number;
  activePermits: number;
}>;
export type UseCaseInput = Readonly<{ actorUserId: UserId }>;
/** 作業状況ボード。進行中の許可、遮断中の区間、現在のフレア警報を一望する */
export type UseCaseOk = Readonly<{
  counts: DashboardCounts;
  activePermits: readonly PermitView[];
  lockedOutSegments: readonly SegmentView[];
  flareAlert: FlareAlert | undefined;
}>;
export type UseCaseError = UnauthorizedError;
export type UseCaseOutput = ResultAsync<UseCaseOk, UseCaseError>;
export type Dependencies = Readonly<{
  userResolver: UserByIdResolver;
  permitListResolver: PermitListResolver;
  segmentListResolver: SegmentListResolver;
  workerListResolver: WorkerListResolver;
  spaceWeatherResolver: CurrentSpaceWeatherResolver;
}>;
export type GetDashboardUseCase = Readonly<{
  run: (input: UseCaseInput) => UseCaseOutput;
}>;

type DashboardSources = Readonly<{
  permits: readonly PermitState[];
  segments: readonly SegmentState[];
  workerCount: number;
  weather: SpaceWeatherReport | undefined;
}>;

const loadSources =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): ResultAsync<DashboardSources, UnauthorizedError> =>
    safeTry<DashboardSources, UnauthorizedError>(async function* () {
      const actor = yield* dependencies.userResolver.resolveById(input.actorUserId);
      yield* ensureUserFound(input.actorUserId)(actor);
      const permits = yield* dependencies.permitListResolver.resolveAll();
      const segments = yield* dependencies.segmentListResolver.resolveAll();
      const workers = yield* dependencies.workerListResolver.resolveAll();
      const weather = yield* dependencies.spaceWeatherResolver.resolveCurrent();
      return ok({ permits, segments, workerCount: workers.length, weather });
    });

const toDashboard = ({ permits, segments, workerCount, weather }: DashboardSources): UseCaseOk => {
  const activePermits = permits.filter(EvaPermit.isActive);
  const lockedOutSegments = segments.filter(Segment.isLockedOut);
  return {
    counts: {
      segments: segments.length,
      lockedOutSegments: lockedOutSegments.length,
      workers: workerCount,
      permits: permits.length,
      activePermits: activePermits.length,
    },
    activePermits: activePermits.map(toPermitView),
    lockedOutSegments: lockedOutSegments.map(toSegmentView),
    flareAlert: weather === undefined ? undefined : toFlareAlert(weather),
  };
};

const run =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): UseCaseOutput =>
    loadSources(dependencies)(input).map(toDashboard);

export const GetDashboardUseCase = {
  create: (dependencies: Dependencies): GetDashboardUseCase => ({
    run: run(dependencies),
  }),
} as const;
