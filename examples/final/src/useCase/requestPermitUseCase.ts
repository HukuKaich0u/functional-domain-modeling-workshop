import { err, ok, safeTry, type Result, type ResultAsync } from "neverthrow";

import type { Clock } from "../domain/aggregate/clock.js";
import type { EventIdGenerator } from "../domain/aggregate/eventIdGenerator.js";
import { EvaPermit } from "../domain/permit/index.js";
import type {
  PermitConflict,
  PermitId,
  PermitPurpose,
  PermitRequested,
  PermitRequestedStore,
  PlannedMinutes,
  Requested,
  ZoneId,
} from "../domain/permit/index.js";
import { segmentIdForZone, type SegmentByIdResolver } from "../domain/segment/index.js";
import type { UserId } from "../domain/user/userId.js";
import type { UserByIdResolver } from "../domain/user/userResolver.js";
import type { WorkerByIdResolver, WorkerId } from "../domain/worker/index.js";
import { ensureCanManageOperations } from "./authorization.js";
import {
  ensureSegmentFound,
  ensureUserFound,
  ensureWorkerFound,
  type IdentityGenerationFailed,
  type SegmentNotFound,
  type UnauthorizedError,
  type WorkerNotFound,
} from "./errors.js";
import { createEvent, createEventContext } from "./eventContext.js";
import { toPermitView, type PermitView } from "./permitView.js";

export type UseCaseInput = Readonly<{
  actorUserId: UserId;
  permitId: PermitId;
  zoneId: ZoneId;
  crew: readonly [WorkerId, WorkerId];
  plannedMinutes: PlannedMinutes;
  purpose: PermitPurpose;
}>;
export type UseCaseOk = Readonly<{ permit: PermitView }>;
/** 同じ隊員を2回登録した。相方がいない（規程第4条） */
export type BuddyMissing = Readonly<{ kind: "BuddyMissing"; workerId: WorkerId }>;
export type UseCaseError =
  | UnauthorizedError
  | BuddyMissing
  | WorkerNotFound
  | SegmentNotFound
  | PermitConflict
  | IdentityGenerationFailed;
export type UseCaseOutput = ResultAsync<UseCaseOk, UseCaseError>;
export type Dependencies = Readonly<{
  userResolver: UserByIdResolver;
  workerResolver: WorkerByIdResolver;
  segmentResolver: SegmentByIdResolver;
  permitRequestedStore: PermitRequestedStore;
  clock: Clock;
  eventIdGenerator: EventIdGenerator;
}>;
export type RequestPermitUseCase = Readonly<{
  run: (input: UseCaseInput) => UseCaseOutput;
}>;

const ensureBuddy = (crew: readonly [WorkerId, WorkerId]): Result<void, BuddyMissing> =>
  crew[0] === crew[1] ? err({ kind: "BuddyMissing", workerId: crew[0] }) : ok(undefined);

const validate =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): ResultAsync<PermitRequested, UseCaseError> =>
    safeTry<PermitRequested, UseCaseError>(async function* () {
      const resolvedActor = yield* dependencies.userResolver.resolveById(input.actorUserId);
      const actor = yield* ensureUserFound(input.actorUserId)(resolvedActor);
      yield* ensureCanManageOperations(actor);
      yield* ensureBuddy(input.crew);
      for (const workerId of input.crew) {
        const worker = yield* dependencies.workerResolver.resolveById(workerId);
        yield* ensureWorkerFound(workerId)(worker);
      }
      const segmentId = segmentIdForZone(input.zoneId);
      const segment = yield* dependencies.segmentResolver.resolveById(segmentId);
      yield* ensureSegmentFound(segmentId)(segment);
      const event = yield* createEvent(() => {
        const context = createEventContext(dependencies, input.actorUserId);
        const requested = {
          permitId: input.permitId,
          zoneId: input.zoneId,
          crew: input.crew,
          plannedMinutes: input.plannedMinutes,
          purpose: input.purpose,
          requestedAt: context.occurredAt,
        } as const satisfies Omit<Requested, "kind">;
        return EvaPermit.request(context)(requested);
      });
      return ok(event);
    });

const run =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): UseCaseOutput =>
    validate(dependencies)(input)
      .andThrough((event) => dependencies.permitRequestedStore.store(event))
      .map((event) => ({ permit: toPermitView(event.aggregateState) }));

export const RequestPermitUseCase = {
  create: (dependencies: Dependencies): RequestPermitUseCase => ({
    run: run(dependencies),
  }),
} as const;
