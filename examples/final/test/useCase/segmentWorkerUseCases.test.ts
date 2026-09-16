import { errAsync, okAsync } from "neverthrow";
import { describe, expect, test } from "vitest";

import type { Clock } from "../../src/domain/aggregate/clock.js";
import type { EvaPermit, PermitByIdResolver } from "../../src/domain/permit/index.js";
import type {
  LockoutRemoved,
  LockoutTagged,
  Segment,
  SegmentByIdResolver,
  SegmentDeleted,
  SegmentRegistered,
} from "../../src/domain/segment/index.js";
import { SegmentLabel } from "../../src/domain/segment/index.js";
import type { User } from "../../src/domain/user/user.js";
import type { UserByIdResolver } from "../../src/domain/user/userResolver.js";
import { RadiationExposure } from "../../src/domain/worker/index.js";
import type { Worker, WorkerByIdResolver, WorkerDeleted, WorkerRegistered, WorkerUpdated } from "../../src/domain/worker/index.js";
import { DeleteSegmentUseCase } from "../../src/useCase/deleteSegmentUseCase.js";
import { DeleteWorkerUseCase } from "../../src/useCase/deleteWorkerUseCase.js";
import { LockOutSegmentUseCase } from "../../src/useCase/lockOutSegmentUseCase.js";
import { RegisterSegmentUseCase } from "../../src/useCase/registerSegmentUseCase.js";
import { RegisterWorkerUseCase } from "../../src/useCase/registerWorkerUseCase.js";
import { ReleaseLockoutUseCase } from "../../src/useCase/releaseLockoutUseCase.js";
import { UpdateWorkerUseCase } from "../../src/useCase/updateWorkerUseCase.js";
import {
  approved,
  at,
  baseCommander,
  day,
  electrician,
  electricianB,
  energizedSegment,
  eventContext,
  groundControl,
  ids,
  lockedOutSegment,
  outside,
  requested,
  returned,
  worker,
} from "../support/fixtures.js";

const clock: Clock = { now: () => at("2026-09-15T04:00:00.000Z"), lunarDay: () => day(7) };
let sequence = 200;
const eventIdGenerator = { generate: () => eventContext(sequence++).eventId };
const userResolverFor = (user: User | undefined): UserByIdResolver => ({ resolveById: () => okAsync(user) });
const permitResolverFor = (permit: EvaPermit | undefined): PermitByIdResolver => ({ resolveById: () => okAsync(permit) });
const segmentResolverFor = (segment: Segment | undefined): SegmentByIdResolver => ({ resolveById: () => okAsync(segment) });
const workerResolverFor = (found: Worker | undefined): WorkerByIdResolver => ({ resolveById: () => okAsync(found) });
const collecting = <T>(stored: T[]) => ({
  store: (...events: readonly T[]) => {
    stored.push(...events);
    return okAsync(undefined);
  },
});

describe("LockOutSegmentUseCase", () => {
  const dependencies = (overrides: Partial<Parameters<typeof LockOutSegmentUseCase.create>[0]> = {}, stored: LockoutTagged[] = []) => ({
    userResolver: userResolverFor(electrician),
    segmentResolver: segmentResolverFor(energizedSegment),
    permitResolver: permitResolverFor(requested),
    lockoutTaggedStore: collecting(stored),
    clock,
    eventIdGenerator,
    ...overrides,
  });
  const input = { actorUserId: ids.electrician, segmentId: ids.segment, permitId: ids.permit } as const;

  test("電気主任が、申請済の許可の作業区画に対応する区間へ札を掛ける", async () => {
    const stored: LockoutTagged[] = [];
    const result = await LockOutSegmentUseCase.create(dependencies({}, stored)).run(input);
    expect(result._unsafeUnwrap().segment.lockout).toMatchObject({ kind: "LockedOut", permitId: ids.permit, taggedBy: ids.electrician });
    expect(stored).toHaveLength(1);
  });

  test("作業区画と系統区間が食い違う札は掛けられない（事故報告 第3号）", async () => {
    const result = await LockOutSegmentUseCase.create(
      dependencies({ segmentResolver: segmentResolverFor({ ...energizedSegment, segmentId: ids.otherSegment }) }),
    ).run({ ...input, segmentId: ids.otherSegment });
    expect(result._unsafeUnwrapErr()).toEqual({
      kind: "ZoneSegmentMismatch",
      permitId: ids.permit,
      zoneId: ids.zone,
      segmentId: ids.otherSegment,
    });
  });

  test("遮断中の区間、承認済の許可、基地長の操作は拒む", async () => {
    expect((await LockOutSegmentUseCase.create(dependencies({ segmentResolver: segmentResolverFor(lockedOutSegment) })).run(input))._unsafeUnwrapErr()).toMatchObject({ kind: "SegmentAlreadyLockedOut", segmentId: ids.segment });
    expect((await LockOutSegmentUseCase.create(dependencies({ permitResolver: permitResolverFor(approved) })).run(input))._unsafeUnwrapErr()).toMatchObject({ kind: "InvalidPermitState", expectedKind: "Requested" });
    expect((await LockOutSegmentUseCase.create(dependencies({ userResolver: userResolverFor(baseCommander) })).run(input))._unsafeUnwrapErr().kind).toBe("Unauthorized");
  });

  test("保存の競合は SegmentConflict で返る", async () => {
    const result = await LockOutSegmentUseCase.create(
      dependencies({ lockoutTaggedStore: { store: () => errAsync({ kind: "SegmentConflict", segmentId: ids.segment } as const) } }),
    ).run(input);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: "SegmentConflict", segmentId: ids.segment });
  });
});

describe("ReleaseLockoutUseCase", () => {
  const dependencies = (overrides: Partial<Parameters<typeof ReleaseLockoutUseCase.create>[0]> = {}, stored: LockoutRemoved[] = []) => ({
    userResolver: userResolverFor(electrician),
    segmentResolver: segmentResolverFor(lockedOutSegment),
    permitResolver: permitResolverFor(requested),
    lockoutRemovedStore: collecting(stored),
    clock,
    eventIdGenerator,
    ...overrides,
  });
  const input = { actorUserId: ids.electrician, segmentId: ids.segment } as const;

  test("掛けた者が申請済の許可の札を外す", async () => {
    const stored: LockoutRemoved[] = [];
    const result = await ReleaseLockoutUseCase.create(dependencies({}, stored)).run(input);
    expect(result._unsafeUnwrap().segment.lockout).toEqual({ kind: "Energized" });
    expect(stored[0]?.eventPayload).toEqual({ segmentId: ids.segment, permitId: ids.permit });
  });

  test("別の電気主任、出発後の許可、札のない区間では外せない", async () => {
    expect((await ReleaseLockoutUseCase.create(dependencies({ userResolver: userResolverFor(electricianB) })).run({ ...input, actorUserId: ids.electricianB }))._unsafeUnwrapErr()).toEqual({ kind: "LockoutTaggedByAnotherUser", segmentId: ids.segment, taggedBy: ids.electrician });
    expect((await ReleaseLockoutUseCase.create(dependencies({ permitResolver: permitResolverFor(outside) })).run(input))._unsafeUnwrapErr()).toEqual({ kind: "PermitRequiresLockout", segmentId: ids.segment, permitId: ids.permit });
    expect((await ReleaseLockoutUseCase.create(dependencies({ segmentResolver: segmentResolverFor(energizedSegment) })).run(input))._unsafeUnwrapErr()).toEqual({ kind: "SegmentNotLockedOut", segmentId: ids.segment });
  });

  test.each([approved, outside, returned])("$kind の札を単独で外すイベントは作らない", async (permit) => {
    const stored: LockoutRemoved[] = [];
    const result = await ReleaseLockoutUseCase.create(dependencies({ permitResolver: permitResolverFor(permit) }, stored)).run(input);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: "PermitRequiresLockout", segmentId: ids.segment, permitId: ids.permit });
    expect(stored).toEqual([]);
  });
});

describe("系統区間と隊員の登録", () => {
  test("地上管制が区間を登録し、重複は保存側の SegmentAlreadyExists で返る", async () => {
    const stored: SegmentRegistered[] = [];
    const base = {
      userResolver: userResolverFor(groundControl),
      segmentRegisteredStore: collecting(stored),
      clock,
      eventIdGenerator,
    };
    const input = { actorUserId: ids.groundControl, segmentId: ids.segment, label: SegmentLabel.schema.parse("PV-07 給電区間") };
    expect((await RegisterSegmentUseCase.create(base).run(input))._unsafeUnwrap().segment.lockout).toEqual({ kind: "Energized" });
    expect(stored).toHaveLength(1);
    expect(
      (await RegisterSegmentUseCase.create({
        ...base,
        segmentRegisteredStore: { store: () => errAsync({ kind: "SegmentAlreadyExists", segmentId: ids.segment } as const) },
      }).run(input))._unsafeUnwrapErr(),
    ).toEqual({ kind: "SegmentAlreadyExists", segmentId: ids.segment });
    expect((await RegisterSegmentUseCase.create({ ...base, userResolver: userResolverFor(electrician) }).run(input))._unsafeUnwrapErr().kind).toBe("Unauthorized");
  });

  test("区間の削除は保存側の SegmentInUse をそのまま返す", async () => {
    const stored: SegmentDeleted[] = [];
    const base = {
      userResolver: userResolverFor(groundControl),
      segmentResolver: segmentResolverFor(energizedSegment),
      segmentDeletedStore: collecting(stored),
      clock,
      eventIdGenerator,
    };
    expect((await DeleteSegmentUseCase.create(base).run({ actorUserId: ids.groundControl, segmentId: ids.segment })).isOk()).toBe(true);
    expect(
      (await DeleteSegmentUseCase.create({
        ...base,
        segmentDeletedStore: { store: () => errAsync({ kind: "SegmentInUse", segmentId: ids.segment } as const) },
      }).run({ actorUserId: ids.groundControl, segmentId: ids.segment }))._unsafeUnwrapErr(),
    ).toEqual({ kind: "SegmentInUse", segmentId: ids.segment });
  });

  test("隊員の登録と更新は被ばく量を Sensitive のまま扱い、結果にも平文を出さない", async () => {
    const registered: WorkerRegistered[] = [];
    const registerResult = await RegisterWorkerUseCase.create({
      userResolver: userResolverFor(groundControl),
      workerRegisteredStore: collecting(registered),
      clock,
      eventIdGenerator,
    }).run({
      actorUserId: ids.groundControl,
      workerId: ids.workerC,
      qualification: "Electrician",
      radiationExposureMicroSv: RadiationExposure.schema.parse(31_415),
    });
    expect(registerResult._unsafeUnwrap().worker.workerId).toBe(ids.workerC);
    expect(JSON.stringify(registerResult._unsafeUnwrap())).not.toContain("31415");
    expect(JSON.stringify(registered)).not.toContain("31415");

    const updated: WorkerUpdated[] = [];
    const updateResult = await UpdateWorkerUseCase.create({
      userResolver: userResolverFor(groundControl),
      workerResolver: workerResolverFor(worker(ids.workerA)),
      workerUpdatedStore: collecting(updated),
      clock,
      eventIdGenerator,
    }).run({
      actorUserId: ids.groundControl,
      workerId: ids.workerA,
      qualification: "General",
      radiationExposureMicroSv: RadiationExposure.schema.parse(27_182),
    });
    expect(updateResult._unsafeUnwrap().worker.radiationExposureMicroSv.unwrap()).toBe(27_182);
    expect(updated).toHaveLength(1);
  });

  test("隊員の削除は進行中の許可があれば保存側が拒み、基地長には権限がない", async () => {
    const stored: WorkerDeleted[] = [];
    const base = {
      userResolver: userResolverFor(groundControl),
      workerResolver: workerResolverFor(worker(ids.workerA)),
      workerDeletedStore: collecting(stored),
      clock,
      eventIdGenerator,
    };
    expect((await DeleteWorkerUseCase.create(base).run({ actorUserId: ids.groundControl, workerId: ids.workerA })).isOk()).toBe(true);
    expect(
      (await DeleteWorkerUseCase.create({
        ...base,
        workerDeletedStore: { store: () => errAsync({ kind: "WorkerHasActivePermit", workerId: ids.workerA } as const) },
      }).run({ actorUserId: ids.groundControl, workerId: ids.workerA }))._unsafeUnwrapErr(),
    ).toEqual({ kind: "WorkerHasActivePermit", workerId: ids.workerA });
    expect((await DeleteWorkerUseCase.create({ ...base, userResolver: userResolverFor(baseCommander) }).run({ actorUserId: ids.baseCommander, workerId: ids.workerA }))._unsafeUnwrapErr().kind).toBe("Unauthorized");
    expect((await DeleteWorkerUseCase.create({ ...base, workerResolver: workerResolverFor(undefined) }).run({ actorUserId: ids.groundControl, workerId: ids.workerA }))._unsafeUnwrapErr()).toEqual({ kind: "WorkerNotFound", workerId: ids.workerA });
  });
});
