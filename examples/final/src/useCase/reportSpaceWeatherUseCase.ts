import type { ResultAsync as UseResultAsync } from "neverthrow";

import type { Clock } from "../domain/aggregate/clock.js";
import type { EventIdGenerator } from "../domain/aggregate/eventIdGenerator.js";
import type { Timestamp } from "../domain/aggregate/timestamp.js";
import { SpaceWeatherReport } from "../domain/spaceWeather/index.js";
import type {
  FlareAlertLevel,
  SpaceWeatherReport as SpaceWeatherState,
  SpaceWeatherReportId,
  SpaceWeatherReportedStore,
} from "../domain/spaceWeather/index.js";
import type { UserId } from "../domain/user/userId.js";
import type { UserByIdResolver } from "../domain/user/userResolver.js";
import { ensureCanManageOperations } from "./authorization.js";
import {
  ensureUserFound,
  type IdentityGenerationFailed,
  type UnauthorizedError,
} from "./errors.js";
import { createEvent, createEventContext } from "./eventContext.js";

export type UseCaseInput = Readonly<{
  actorUserId: UserId;
  issuedAt: Timestamp;
  alertLevel: FlareAlertLevel;
  stations: readonly string[];
}>;
export type UseCaseOk = Readonly<{ report: SpaceWeatherState }>;
export type UseCaseError = UnauthorizedError | IdentityGenerationFailed;
export type UseCaseOutput = UseResultAsync<UseCaseOk, UseCaseError>;
export type SpaceWeatherReportIdGenerator = Readonly<{ generate: () => SpaceWeatherReportId }>;
export type Dependencies = Readonly<{
  userResolver: UserByIdResolver;
  spaceWeatherReportedStore: SpaceWeatherReportedStore;
  reportIdGenerator: SpaceWeatherReportIdGenerator;
  clock: Clock;
  eventIdGenerator: EventIdGenerator;
}>;
export type ReportSpaceWeatherUseCase = Readonly<{
  run: (input: UseCaseInput) => UseCaseOutput;
}>;

/** 地上管制が宇宙天気を報告する。外部JSONの検証は route の境界で済ませてある */
const run =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): UseCaseOutput =>
    dependencies.userResolver
      .resolveById(input.actorUserId)
      .andThen(ensureUserFound(input.actorUserId))
      .andThen(ensureCanManageOperations)
      .andThen(() =>
        createEvent(() =>
          SpaceWeatherReport.report(createEventContext(dependencies, input.actorUserId))({
            reportId: dependencies.reportIdGenerator.generate(),
            issuedAt: input.issuedAt,
            alertLevel: input.alertLevel,
            stations: input.stations,
          }),
        ),
      )
      .andThrough((event) => dependencies.spaceWeatherReportedStore.store(event))
      .map((event) => ({ report: event.aggregateState }));

export const ReportSpaceWeatherUseCase = {
  create: (dependencies: Dependencies): ReportSpaceWeatherUseCase => ({
    run: run(dependencies),
  }),
} as const;
