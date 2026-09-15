import type { ResultAsync } from "neverthrow";

import type { SegmentListResolver } from "../domain/segment/index.js";
import type { UserId } from "../domain/user/userId.js";
import type { UserByIdResolver } from "../domain/user/userResolver.js";
import { ensureUserFound, type UnauthorizedError } from "./errors.js";
import { toSegmentView, type SegmentView } from "./segmentView.js";

export type { SegmentView } from "./segmentView.js";
export type UseCaseInput = Readonly<{ actorUserId: UserId }>;
export type UseCaseOk = Readonly<{ segments: readonly SegmentView[] }>;
export type UseCaseError = UnauthorizedError;
export type UseCaseOutput = ResultAsync<UseCaseOk, UseCaseError>;
export type Dependencies = Readonly<{
  userResolver: UserByIdResolver;
  segmentResolver: SegmentListResolver;
}>;
export type ListSegmentsUseCase = Readonly<{
  run: (input: UseCaseInput) => UseCaseOutput;
}>;

/** 遮断状態は全員が見る。電力盤（遮断盤）の projection に当たる */
const run =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): UseCaseOutput =>
    dependencies.userResolver
      .resolveById(input.actorUserId)
      .andThen(ensureUserFound(input.actorUserId))
      .andThen(() => dependencies.segmentResolver.resolveAll())
      .map((segments) => ({ segments: segments.map(toSegmentView) }));

export const ListSegmentsUseCase = {
  create: (dependencies: Dependencies): ListSegmentsUseCase => ({
    run: run(dependencies),
  }),
} as const;
