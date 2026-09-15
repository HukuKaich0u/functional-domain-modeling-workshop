import { errAsync, okAsync } from "neverthrow";
import { describe, expect, test } from "vitest";

import type { Clock } from "../../src/domain/aggregate/clock.js";
import type { EventIdGenerator } from "../../src/domain/aggregate/eventIdGenerator.js";
import type {
  EquipmentCheck,
  EquipmentCheckByPermitIdResolver,
} from "../../src/domain/equipmentCheck/index.js";
import type {
  EvaApproved,
  EvaApprovedStore,
  EvaPermit,
  PermitByIdResolver,
} from "../../src/domain/permit/index.js";
import type { Segment, SegmentByIdResolver } from "../../src/domain/segment/index.js";
import type {
  CurrentSpaceWeatherResolver,
  SpaceWeatherReport,
} from "../../src/domain/spaceWeather/index.js";
import type { User } from "../../src/domain/user/user.js";
import type { UserByIdResolver } from "../../src/domain/user/userResolver.js";
import type { Worker, WorkerByIdResolver } from "../../src/domain/worker/index.js";
import {
  ApproveEvaUseCase,
  type Dependencies,
} from "../../src/useCase/approveEvaUseCase.js";
import {
  approved,
  baseCommander,
  day,
  at,
  electrician,
  equipmentCheck,
  eventContext,
  groundControl,
  ids,
  lockedOutSegment,
  energizedSegment,
  requested,
  weather,
  worker,
} from "../support/fixtures.js";

const input = { actorUserId: ids.baseCommander, permitId: ids.permit } as const;
const approvedAt = at("2026-09-15T00:10:00.000Z");

const userResolverFor = (user: User | undefined): UserByIdResolver => ({
  resolveById: () => okAsync(user),
});
const permitResolverFor = (permit: EvaPermit | undefined): PermitByIdResolver => ({
  resolveById: () => okAsync(permit),
});
const checksResolverFor = (checks: readonly EquipmentCheck[]): EquipmentCheckByPermitIdResolver => ({
  resolveByPermitId: () => okAsync(checks),
});
const workerResolverFor = (workers: readonly Worker[]): WorkerByIdResolver => ({
  resolveById: (workerId) => okAsync(workers.find((candidate) => candidate.workerId === workerId)),
});
const weatherResolverFor = (report: SpaceWeatherReport | undefined): CurrentSpaceWeatherResolver => ({
  resolveCurrent: () => okAsync(report),
});
const segmentResolverFor = (segment: Segment | undefined): SegmentByIdResolver => ({
  resolveById: () => okAsync(segment),
});
const successfulStore = (stored: EvaApproved[]): EvaApprovedStore => ({
  store: (...events) => {
    stored.push(...events);
    return okAsync(undefined);
  },
});

const createDependencies = (overrides: Partial<Dependencies> = {}): Dependencies => ({
  userResolver: userResolverFor(baseCommander),
  permitResolver: permitResolverFor(requested),
  equipmentCheckResolver: checksResolverFor([
    equipmentCheck(ids.checkA, ids.workerA),
    equipmentCheck(ids.checkB, ids.workerB),
  ]),
  workerResolver: workerResolverFor([worker(ids.workerA), worker(ids.workerB)]),
  spaceWeatherResolver: weatherResolverFor(weather("none")),
  segmentResolver: segmentResolverFor(lockedOutSegment),
  evaApprovedStore: successfulStore([]),
  clock: { now: () => approvedAt, lunarDay: () => day(7) } satisfies Clock,
  eventIdGenerator: { generate: () => eventContext(1).eventId } satisfies EventIdGenerator,
  ...overrides,
});

const runWith = (overrides: Partial<Dependencies> = {}) =>
  ApproveEvaUseCase.create(createDependencies(overrides)).run(input);

describe("ApproveEvaUseCase", () => {
  test("7条件を満たすと EvaApproved を1件保存し、承認済の状態を返す", async () => {
    const stored: EvaApproved[] = [];
    const result = await runWith({ evaApprovedStore: successfulStore(stored) });

    expect(result.isOk()).toBe(true);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.kind).toBe("EvaApproved");
    expect(stored[0]?.actorUserId).toBe(ids.baseCommander);
    expect(result._unsafeUnwrap().permit).toEqual({
      ...approved,
      approvedAt,
      approvalLunarDay: day(7),
    });
  });

  test("基地長と Admin だけが承認できる", async () => {
    expect((await runWith({ userResolver: userResolverFor(groundControl) }))._unsafeUnwrapErr()).toEqual({
      kind: "Unauthorized",
      actorUserId: ids.groundControl,
    });
    expect((await runWith({ userResolver: userResolverFor(electrician) }))._unsafeUnwrapErr().kind).toBe("Unauthorized");
    expect((await runWith({ userResolver: userResolverFor(undefined) }))._unsafeUnwrapErr().kind).toBe("Unauthorized");
  });

  test("申請済でない許可は InvalidPermitState を返す（事故報告 第1号）", async () => {
    const result = await runWith({ permitResolver: permitResolverFor(approved) });
    expect(result._unsafeUnwrapErr()).toEqual({
      kind: "InvalidPermitState",
      permitId: ids.permit,
      expectedKind: "Requested",
      actualKind: "Approved",
    });
    expect((await runWith({ permitResolver: permitResolverFor(undefined) }))._unsafeUnwrapErr()).toEqual({
      kind: "PermitNotFound",
      permitId: ids.permit,
    });
  });

  test("条件1: 2名分の装備点検がなければ、足りない隊員を示して止まる", async () => {
    const result = await runWith({
      equipmentCheckResolver: checksResolverFor([equipmentCheck(ids.checkA, ids.workerA)]),
    });
    expect(result._unsafeUnwrapErr()).toEqual({
      kind: "EquipmentCheckMissing",
      permitId: ids.permit,
      workerId: ids.workerB,
    });
  });

  test("条件2: 酸素残時間が予定作業時間と予備60分に足りなければ止まる", async () => {
    const result = await runWith({
      equipmentCheckResolver: checksResolverFor([
        equipmentCheck(ids.checkA, ids.workerA, 179),
        equipmentCheck(ids.checkB, ids.workerB),
      ]),
    });
    expect(result._unsafeUnwrapErr()).toEqual({
      kind: "InsufficientOxygen",
      permitId: ids.permit,
      workerId: ids.workerA,
    });
  });

  test("条件3: 累積線量と予測線量の合計が上限を超えると止まる。線量の値は返さない", async () => {
    const result = await runWith({
      workerResolver: workerResolverFor([worker(ids.workerA), worker(ids.workerB, 49_900)]),
    });
    expect(result._unsafeUnwrapErr()).toEqual({
      kind: "DoseLimitExceeded",
      permitId: ids.permit,
      workerId: ids.workerB,
    });
    expect(JSON.stringify(result._unsafeUnwrapErr())).not.toContain("49900");
  });

  test("条件4: フレア警報中、または報告がないと止まる", async () => {
    expect((await runWith({ spaceWeatherResolver: weatherResolverFor(weather("S2")) }))._unsafeUnwrapErr()).toEqual({
      kind: "FlareAlertActive",
      permitId: ids.permit,
      level: "S2",
    });
    expect((await runWith({ spaceWeatherResolver: weatherResolverFor(undefined) }))._unsafeUnwrapErr()).toEqual({
      kind: "SpaceWeatherUnknown",
      permitId: ids.permit,
    });
  });

  test("条件5: 相方が同じ隊員なら止まる", async () => {
    const result = await runWith({
      permitResolver: permitResolverFor({ ...requested, crew: [ids.workerA, ids.workerA] }),
    });
    expect(result._unsafeUnwrapErr()).toEqual({
      kind: "BuddyMissing",
      permitId: ids.permit,
      workerId: ids.workerA,
    });
  });

  test("条件6: 系統区間の遮断札がない、または別の許可の札なら止まる（事故報告 第3号）", async () => {
    expect((await runWith({ segmentResolver: segmentResolverFor(energizedSegment) }))._unsafeUnwrapErr()).toEqual({
      kind: "SegmentNotLockedOut",
      permitId: ids.permit,
      segmentId: ids.segment,
    });
    expect(
      (await runWith({
        segmentResolver: segmentResolverFor({
          ...lockedOutSegment,
          lockout: { ...lockedOutSegment.lockout, permitId: ids.otherPermit },
        }),
      }))._unsafeUnwrapErr(),
    ).toEqual({
      kind: "LockoutForAnotherPermit",
      permitId: ids.permit,
      segmentId: ids.segment,
      lockedOutPermitId: ids.otherPermit,
    });
    expect((await runWith({ segmentResolver: segmentResolverFor(undefined) }))._unsafeUnwrapErr()).toEqual({
      kind: "SegmentNotFound",
      segmentId: ids.segment,
    });
  });

  test("条件7: 月面日が第15日以降なら止まり、何も保存しない", async () => {
    const stored: EvaApproved[] = [];
    const result = await runWith({
      clock: { now: () => approvedAt, lunarDay: () => day(15) },
      evaApprovedStore: successfulStore(stored),
    });
    expect(result._unsafeUnwrapErr()).toEqual({ kind: "NightTime", permitId: ids.permit, lunarDay: 15 });
    expect(stored).toHaveLength(0);
  });

  test("保存の競合は PermitConflict としてそのまま返す", async () => {
    const result = await runWith({
      evaApprovedStore: {
        store: () => errAsync({ kind: "PermitConflict", permitId: ids.permit } as const),
      },
    });
    expect(result._unsafeUnwrapErr()).toEqual({ kind: "PermitConflict", permitId: ids.permit });
  });
});
