import { err, ok, type Result, type ResultAsync as UseResultAsync } from "neverthrow";

import type { Clock } from "../domain/aggregate/clock.js";
import type { EventIdGenerator } from "../domain/aggregate/eventIdGenerator.js";
import { EquipmentCheck } from "../domain/equipmentCheck/index.js";
import type {
  EquipmentCheck as EquipmentCheckState,
  EquipmentCheckId,
  EquipmentCheckRecordedStore,
  EquipmentNote,
  OxygenMinutes,
} from "../domain/equipmentCheck/index.js";
import type { PermitByIdResolver, PermitId, Requested } from "../domain/permit/index.js";
import type { UserId } from "../domain/user/userId.js";
import type { UserByIdResolver } from "../domain/user/userResolver.js";
import type { WorkerId } from "../domain/worker/index.js";
import { ensureCanApproveEva } from "./authorization.js";
import {
  ensurePermitFound,
  ensureRequested,
  ensureUserFound,
  type IdentityGenerationFailed,
  type InvalidPermitState,
  type PermitNotFound,
  type UnauthorizedError,
} from "./errors.js";
import { createEvent, createEventContext } from "./eventContext.js";

export type UseCaseInput = Readonly<{
  actorUserId: UserId;
  permitId: PermitId;
  workerId: WorkerId;
  oxygenMinutes: OxygenMinutes;
  note: EquipmentNote;
  needsMaintenance: boolean;
}>;
export type UseCaseOk = Readonly<{ check: EquipmentCheckState }>;
export type WorkerNotInCrew = Readonly<{ kind: "WorkerNotInCrew"; permitId: PermitId; workerId: WorkerId }>;
export type UseCaseError =
  | UnauthorizedError
  | PermitNotFound
  | InvalidPermitState<"Requested">
  | WorkerNotInCrew
  | IdentityGenerationFailed;
export type UseCaseOutput = UseResultAsync<UseCaseOk, UseCaseError>;
export type EquipmentCheckIdGenerator = Readonly<{ generate: () => EquipmentCheckId }>;
export type Dependencies = Readonly<{
  userResolver: UserByIdResolver;
  permitResolver: PermitByIdResolver;
  equipmentCheckRecordedStore: EquipmentCheckRecordedStore;
  equipmentCheckIdGenerator: EquipmentCheckIdGenerator;
  clock: Clock;
  eventIdGenerator: EventIdGenerator;
}>;
export type RecordEquipmentCheckUseCase = Readonly<{
  run: (input: UseCaseInput) => UseCaseOutput;
}>;

const ensureInCrew =
  (workerId: WorkerId) =>
  (permit: Requested): Result<Requested, WorkerNotInCrew> =>
    permit.crew.includes(workerId)
      ? ok(permit)
      : err({ kind: "WorkerNotInCrew", permitId: permit.permitId, workerId });

/** 装備点検の記録。承認前（申請済）の許可に登録された隊員だけを対象にする */
const run =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): UseCaseOutput =>
    dependencies.userResolver
      .resolveById(input.actorUserId)
      .andThen(ensureUserFound(input.actorUserId))
      .andThen(ensureCanApproveEva)
      .andThen(() => dependencies.permitResolver.resolveById(input.permitId))
      .andThen(ensurePermitFound(input.permitId))
      .andThen(ensureRequested)
      .andThen(ensureInCrew(input.workerId))
      .andThen((permit) =>
        createEvent(() => {
          const context = createEventContext(dependencies, input.actorUserId);
          return EquipmentCheck.record(context)({
            checkId: dependencies.equipmentCheckIdGenerator.generate(),
            permitId: permit.permitId,
            workerId: input.workerId,
            checkedAt: context.occurredAt,
            oxygenMinutes: input.oxygenMinutes,
            note: input.note,
            needsMaintenance: input.needsMaintenance,
          });
        }),
      )
      .andThrough((event) => dependencies.equipmentCheckRecordedStore.store(event))
      .map((event) => ({ check: event.aggregateState }));

export const RecordEquipmentCheckUseCase = {
  create: (dependencies: Dependencies): RecordEquipmentCheckUseCase => ({
    run: run(dependencies),
  }),
} as const;
