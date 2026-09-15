import type { ResultAsync } from "neverthrow";

import type { SpaceWeatherListResolver, SpaceWeatherReport } from "../domain/spaceWeather/index.js";
import type { UserId } from "../domain/user/userId.js";
import type { UserByIdResolver } from "../domain/user/userResolver.js";
import { ensureUserFound, type UnauthorizedError } from "./errors.js";

export type UseCaseInput = Readonly<{ actorUserId: UserId }>;
export type UseCaseOk = Readonly<{ reports: readonly SpaceWeatherReport[] }>;
export type UseCaseError = UnauthorizedError;
export type UseCaseOutput = ResultAsync<UseCaseOk, UseCaseError>;
export type Dependencies = Readonly<{
  userResolver: UserByIdResolver;
  spaceWeatherResolver: SpaceWeatherListResolver;
}>;
export type ListSpaceWeatherUseCase = Readonly<{
  run: (input: UseCaseInput) => UseCaseOutput;
}>;

const run =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): UseCaseOutput =>
    dependencies.userResolver
      .resolveById(input.actorUserId)
      .andThen(ensureUserFound(input.actorUserId))
      .andThen(() => dependencies.spaceWeatherResolver.resolveAll())
      .map((reports) => ({ reports }));

export const ListSpaceWeatherUseCase = {
  create: (dependencies: Dependencies): ListSpaceWeatherUseCase => ({
    run: run(dependencies),
  }),
} as const;
