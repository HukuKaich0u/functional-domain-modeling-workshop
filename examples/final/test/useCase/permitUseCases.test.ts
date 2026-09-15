import { errAsync, okAsync } from "neverthrow";
import { describe, expect, test } from "vitest";

import type { Clock } from "../../src/domain/aggregate/clock.js";
import { AbortReason, EmergencyReason } from "../../src/domain/permit/index.js";
import type {
  CrewEgressed,
  CrewReturned,
  EvaPermit,
  PermitAborted,
  PermitByIdResolver,
  PermitClosed,
  PermitRequested,
} from "../../src/domain/permit/index.js";
import type { LockoutRemoved, Segment, SegmentByIdResolver } from "../../src/domain/segment/index.js";
import type { User } from "../../src/domain/user/user.js";
import type { UserByIdResolver } from "../../src/domain/user/userResolver.js";
import type { Worker, WorkerByIdResolver } from "../../src/domain/worker/index.js";
import { AbortPermitUseCase } from "../../src/useCase/abortPermitUseCase.js";
import { ClosePermitUseCase } from "../../src/useCase/closePermitUseCase.js";
import { RecordEgressUseCase } from "../../src/useCase/recordEgressUseCase.js";
import { RecordReturnUseCase } from "../../src/useCase/recordReturnUseCase.js";
import { RequestPermitUseCase } from "../../src/useCase/requestPermitUseCase.js";
import {
  admin,
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

const clock: Clock = { now: () => at("2026-09-15T03:00:00.000Z"), lunarDay: () => day(7) };
let sequence = 100;
const eventIdGenerator = { generate: () => eventContext(sequence++).eventId };
const userResolverFor = (user: User | undefined): UserByIdResolver => ({ resolveById: () => okAsync(user) });
const permitResolverFor = (permit: EvaPermit | undefined): PermitByIdResolver => ({ resolveById: () => okAsync(permit) });
const segmentResolverFor = (segment: Segment | undefined): SegmentByIdResolver => ({ resolveById: () => okAsync(segment) });
const workerResolverFor = (workers: readonly Worker[]): WorkerByIdResolver => ({
  resolveById: (workerId) => okAsync(workers.find((candidate) => candidate.workerId === workerId)),
});
const collecting = <T>(stored: T[]) => ({
  store: (...events: readonly T[]) => {
    stored.push(...events);
    return okAsync(undefined);
  },
});

describe("RequestPermitUseCase", () => {
  const dependencies = (stored: PermitRequested[]) => ({
    userResolver: userResolverFor(groundControl),
    workerResolver: workerResolverFor([worker(ids.workerA), worker(ids.workerB)]),
    segmentResolver: segmentResolverFor(energizedSegment),
    permitRequestedStore: collecting(stored),
    clock,
    eventIdGenerator,
  });
  const input = {
    actorUserId: ids.groundControl,
    permitId: ids.permit,
    zoneId: ids.zone,
    crew: [ids.workerA, ids.workerB] as const,
    plannedMinutes: requested.plannedMinutes,
    purpose: requested.purpose,
  };

  test("地上管制が2名の隊員と登録済みの作業区画で申請する", async () => {
    const stored: PermitRequested[] = [];
    const result = await RequestPermitUseCase.create(dependencies(stored)).run(input);
    expect(result._unsafeUnwrap().permit).toMatchObject({ kind: "Requested", permitId: ids.permit, zoneId: ids.zone });
    expect(stored[0]?.aggregateState.requestedAt).toBe(clock.now());
    expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("接続箱");
  });

  test("同じ隊員を2回選ぶと BuddyMissing、未登録の隊員は WorkerNotFound", async () => {
    const useCase = RequestPermitUseCase.create(dependencies([]));
    expect((await useCase.run({ ...input, crew: [ids.workerA, ids.workerA] }))._unsafeUnwrapErr()).toEqual({
      kind: "BuddyMissing",
      workerId: ids.workerA,
    });
    expect((await useCase.run({ ...input, crew: [ids.workerA, ids.workerC] }))._unsafeUnwrapErr()).toEqual({
      kind: "WorkerNotFound",
      workerId: ids.workerC,
    });
  });

  test("基地長は申請できず、区画に対応する系統区間がなければ SegmentNotFound", async () => {
    expect(
      (await RequestPermitUseCase.create({ ...dependencies([]), userResolver: userResolverFor(baseCommander) }).run(input))._unsafeUnwrapErr().kind,
    ).toBe("Unauthorized");
    expect(
      (await RequestPermitUseCase.create({ ...dependencies([]), segmentResolver: segmentResolverFor(undefined) }).run(input))._unsafeUnwrapErr(),
    ).toEqual({ kind: "SegmentNotFound", segmentId: ids.segment });
  });

  test("申請番号の重複は保存側の PermitConflict をそのまま返す", async () => {
    const result = await RequestPermitUseCase.create({
      ...dependencies([]),
      permitRequestedStore: { store: () => errAsync({ kind: "PermitConflict", permitId: ids.permit } as const) },
    }).run(input);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: "PermitConflict", permitId: ids.permit });
  });
});

describe("RecordEgressUseCase と RecordReturnUseCase", () => {
  test("承認済の許可だけが出発できる", async () => {
    const stored: CrewEgressed[] = [];
    const useCase = RecordEgressUseCase.create({
      userResolver: userResolverFor(baseCommander),
      permitResolver: permitResolverFor(approved),
      crewEgressedStore: collecting(stored),
      clock,
      eventIdGenerator,
    });
    const result = await useCase.run({ actorUserId: ids.baseCommander, permitId: ids.permit });
    expect(result._unsafeUnwrap().permit.kind).toBe("Outside");
    expect(stored).toHaveLength(1);

    const invalid = await RecordEgressUseCase.create({
      userResolver: userResolverFor(baseCommander),
      permitResolver: permitResolverFor(requested),
      crewEgressedStore: collecting<CrewEgressed>([]),
      clock,
      eventIdGenerator,
    }).run({ actorUserId: ids.baseCommander, permitId: ids.permit });
    expect(invalid._unsafeUnwrapErr()).toMatchObject({ kind: "InvalidPermitState", expectedKind: "Approved", actualKind: "Requested" });
  });

  test("帰還は作業中の許可だけを受け付け、緊急帰還の理由は Sensitive のまま状態に入る", async () => {
    const stored: CrewReturned[] = [];
    const reason = EmergencyReason.schema.parse("スーツの圧力低下");
    const result = await RecordReturnUseCase.create({
      userResolver: userResolverFor(baseCommander),
      permitResolver: permitResolverFor(outside),
      crewReturnedStore: collecting(stored),
      clock,
      eventIdGenerator,
    }).run({ actorUserId: ids.baseCommander, permitId: ids.permit, returnRecord: { kind: "Emergency", reason } });
    expect(result._unsafeUnwrap().permit.returnRecord).toEqual({ kind: "Emergency", reason });
    expect(stored[0]?.eventPayload).toEqual({ permitId: ids.permit, returnKind: "Emergency" });
    expect(JSON.stringify(stored[0])).not.toContain("圧力低下");
  });
});

describe("ClosePermitUseCase", () => {
  const dependencies = (
    stored: Array<readonly [LockoutRemoved, PermitClosed]>,
    overrides: Partial<Parameters<typeof ClosePermitUseCase.create>[0]> = {},
  ) => ({
    userResolver: userResolverFor(electrician),
    permitResolver: permitResolverFor(returned),
    segmentResolver: segmentResolverFor(lockedOutSegment),
    lockoutReleaseStore: {
      store: (lockoutRemoved: LockoutRemoved, permitClosed: PermitClosed) => {
        stored.push([lockoutRemoved, permitClosed]);
        return okAsync(undefined);
      },
    },
    clock,
    eventIdGenerator,
    ...overrides,
  });
  const input = { actorUserId: ids.electrician, permitId: ids.permit } as const;

  test("札を掛けた電気主任が、札の取り外しと完了を2つのイベントとして1回の store に渡す", async () => {
    const stored: Array<readonly [LockoutRemoved, PermitClosed]> = [];
    const result = await ClosePermitUseCase.create(dependencies(stored)).run(input);
    expect(result._unsafeUnwrap().permit.kind).toBe("Closed");
    expect(stored).toHaveLength(1);
    const [lockoutRemoved, permitClosed] = stored[0]!;
    expect(lockoutRemoved.kind).toBe("LockoutRemoved");
    expect(lockoutRemoved.eventPayload.permitId).toBe(ids.permit);
    expect(permitClosed.kind).toBe("PermitClosed");
    expect(lockoutRemoved.eventId).not.toBe(permitClosed.eventId);
  });

  test("別の電気主任は札を外せない。Admin だけが代行できる（規程第3条）", async () => {
    expect(
      (await ClosePermitUseCase.create(dependencies([], { userResolver: userResolverFor(electricianB) })).run({ ...input, actorUserId: ids.electricianB }))._unsafeUnwrapErr(),
    ).toEqual({ kind: "LockoutTaggedByAnotherUser", segmentId: ids.segment, taggedBy: ids.electrician });
    const stored: Array<readonly [LockoutRemoved, PermitClosed]> = [];
    expect(
      (await ClosePermitUseCase.create(dependencies(stored, { userResolver: userResolverFor(admin) })).run({ ...input, actorUserId: ids.admin })).isOk(),
    ).toBe(true);
    expect(stored).toHaveLength(1);
  });

  test("帰還済でない許可、札のない区間、別の許可の札では完了できない", async () => {
    expect(
      (await ClosePermitUseCase.create(dependencies([], { permitResolver: permitResolverFor(outside) })).run(input))._unsafeUnwrapErr(),
    ).toMatchObject({ kind: "InvalidPermitState", expectedKind: "Returned" });
    expect(
      (await ClosePermitUseCase.create(dependencies([], { segmentResolver: segmentResolverFor(energizedSegment) })).run(input))._unsafeUnwrapErr(),
    ).toEqual({ kind: "SegmentNotLockedOut", permitId: ids.permit, segmentId: ids.segment });
    expect(
      (await ClosePermitUseCase.create(
        dependencies([], {
          segmentResolver: segmentResolverFor({
            ...lockedOutSegment,
            lockout: { ...lockedOutSegment.lockout, permitId: ids.otherPermit },
          }),
        }),
      ).run(input))._unsafeUnwrapErr(),
    ).toEqual({
      kind: "LockoutForAnotherPermit",
      permitId: ids.permit,
      segmentId: ids.segment,
      lockedOutPermitId: ids.otherPermit,
    });
  });

  test("基地長は完了の権限を持たない", async () => {
    expect(
      (await ClosePermitUseCase.create(dependencies([], { userResolver: userResolverFor(baseCommander) })).run({ ...input, actorUserId: ids.baseCommander }))._unsafeUnwrapErr().kind,
    ).toBe("Unauthorized");
  });
});

describe("AbortPermitUseCase", () => {
  const reason = AbortReason.schema.parse("フレア警報 S2 の予報");
  const dependencies = (permit: EvaPermit, user: User, stored: PermitAborted[] = []) => ({
    userResolver: userResolverFor(user),
    permitResolver: permitResolverFor(permit),
    permitAbortedStore: collecting(stored),
    clock,
    eventIdGenerator,
  });

  test("地上管制と基地長は出発前の許可を理由付きで中止できる", async () => {
    const stored: PermitAborted[] = [];
    const result = await AbortPermitUseCase.create(dependencies(approved, groundControl, stored)).run({
      actorUserId: ids.groundControl,
      permitId: ids.permit,
      reason,
    });
    expect(result._unsafeUnwrap().permit).toMatchObject({ kind: "Aborted", abortedBy: ids.groundControl });
    expect(stored[0]?.eventPayload).toEqual({ permitId: ids.permit, abortedBy: ids.groundControl });
    expect(JSON.stringify(stored[0])).not.toContain("予報");
    expect(
      (await AbortPermitUseCase.create(dependencies(requested, baseCommander)).run({ actorUserId: ids.baseCommander, permitId: ids.permit, reason })).isOk(),
    ).toBe(true);
  });

  test("出発後の許可は中止できず、電気主任には権限がない", async () => {
    expect(
      (await AbortPermitUseCase.create(dependencies(outside, groundControl)).run({ actorUserId: ids.groundControl, permitId: ids.permit, reason }))._unsafeUnwrapErr(),
    ).toEqual({ kind: "InvalidPermitState", permitId: ids.permit, expectedKind: "RequestedOrApproved", actualKind: "Outside" });
    expect(
      (await AbortPermitUseCase.create(dependencies(requested, electrician)).run({ actorUserId: ids.electrician, permitId: ids.permit, reason }))._unsafeUnwrapErr().kind,
    ).toBe("Unauthorized");
  });
});
