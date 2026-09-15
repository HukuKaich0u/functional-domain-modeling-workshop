import type { ResultAsync } from "neverthrow";

import type { SegmentByIdResolver, SegmentId } from "../domain/segment/index.js";
import type { UserId } from "../domain/user/userId.js";
import type { UserByIdResolver } from "../domain/user/userResolver.js";
import {
  ensureSegmentFound,
  ensureUserFound,
  type SegmentNotFound,
  type UnauthorizedError,
} from "./errors.js";
import { toSegmentView, type SegmentView } from "./segmentView.js";

export type UseCaseInput = Readonly<{ actorUserId: UserId; segmentId: SegmentId }>;
export type UseCaseOk = Readonly<{ segment: SegmentView }>;
export type UseCaseError = UnauthorizedError | SegmentNotFound;
export type UseCaseOutput = ResultAsync<UseCaseOk, UseCaseError>;
export type Dependencies = Readonly<{
  userResolver: UserByIdResolver;
  segmentResolver: SegmentByIdResolver;
}>;
export type GetSegmentUseCase = Readonly<{
  run: (input: UseCaseInput) => UseCaseOutput;
}>;

const run =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): UseCaseOutput =>
    dependencies.userResolver
      .resolveById(input.actorUserId)
      .andThen(ensureUserFound(input.actorUserId))
      .andThen(() => dependencies.segmentResolver.resolveById(input.segmentId))
      .andThen(ensureSegmentFound(input.segmentId))
      .map((segment) => ({ segment: toSegmentView(segment) }));

export const GetSegmentUseCase = {
  create: (dependencies: Dependencies): GetSegmentUseCase => ({
    run: run(dependencies),
  }),
} as const;
