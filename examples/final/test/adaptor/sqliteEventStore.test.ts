import { count, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { createSqliteDatabase, migrateDatabase } from "../../src/adaptor/secondary/sqlite/db.js";
import { createEventHistoryReader } from "../../src/adaptor/secondary/sqlite/query/eventHistoryReader.js";
import { createPermitByIdResolver } from "../../src/adaptor/secondary/sqlite/resolver/permitResolver.js";
import { createSegmentByIdResolver } from "../../src/adaptor/secondary/sqlite/resolver/segmentResolver.js";
import { createWorkerByIdResolver } from "../../src/adaptor/secondary/sqlite/resolver/workerResolver.js";
import {
  domainEventsTable,
  equipmentChecksTable,
  permitsTable,
  segmentsTable,
  workersTable,
} from "../../src/adaptor/secondary/sqlite/schema.js";
import { createEquipmentCheckEventStore } from "../../src/adaptor/secondary/sqlite/store/equipmentCheckEventStore.js";
import { createLockoutReleaseStore } from "../../src/adaptor/secondary/sqlite/store/lockoutReleaseStore.js";
import { createPermitEventStore } from "../../src/adaptor/secondary/sqlite/store/permitEventStore.js";
import {
  createLockoutRemovedStore,
  createLockoutTaggedStore,
  createSegmentDeletedStore,
  createSegmentRegisteredStore,
} from "../../src/adaptor/secondary/sqlite/store/segmentEventStore.js";
import {
  createWorkerDeletedStore,
  createWorkerRegisteredStore,
  createWorkerUpdatedStore,
} from "../../src/adaptor/secondary/sqlite/store/workerEventStore.js";
import { EquipmentCheck } from "../../src/domain/equipmentCheck/index.js";
import { AbortReason, EmergencyReason, EvaPermit } from "../../src/domain/permit/index.js";
import { Segment } from "../../src/domain/segment/index.js";
import { CumulativeDose, Worker } from "../../src/domain/worker/index.js";
import {
  admin,
  approved,
  energizedSegment,
  equipmentCheck,
  eventContext,
  ids,
  lockedOutSegment,
  requested,
  returned,
  worker,
} from "../support/fixtures.js";

const unwrap = <T>(result: { isOk: () => boolean; _unsafeUnwrap: () => T }): T => {
  expect(result.isOk()).toBe(true);
  return result._unsafeUnwrap();
};
const freshDatabase = () => {
  const db = createSqliteDatabase(":memory:");
  migrateDatabase(db);
  return db;
};
const eventCount = (db: ReturnType<typeof freshDatabase>) =>
  db.select({ value: count() }).from(domainEventsTable).get()?.value ?? 0;

describe("permit event store", () => {
  test("申請から帰還までを projection と作業記録に同時に書き、Sensitive は記録に出さない", async () => {
    const db = freshDatabase();
    const store = createPermitEventStore(db);
    const requestedEvent = EvaPermit.request(eventContext(1))(requested);
    unwrap(await store.store(requestedEvent));
    const approvedEvent = EvaPermit.approve(eventContext(2))(requested, { segmentId: ids.segment });
    const egressedEvent = EvaPermit.egress(eventContext(3))(approvedEvent.aggregateState);
    const returnedEvent = EvaPermit.returnToBase(eventContext(4))(egressedEvent.aggregateState, {
      kind: "Emergency",
      reason: EmergencyReason.schema.parse("スーツの圧力低下"),
    });
    unwrap(await store.store(approvedEvent, egressedEvent, returnedEvent));

    const row = db.select().from(permitsTable).where(eq(permitsTable.permitId, ids.permit)).get();
    expect(row).toMatchObject({ status: "Returned", zoneId: "PV-07", crewA: "W-01", crewB: "W-02" });
    expect(unwrap(await createPermitByIdResolver(db).resolveById(ids.permit))).toMatchObject({
      kind: "Returned",
      returnRecord: { kind: "Emergency" },
    });
    const events = db.select().from(domainEventsTable).all();
    expect(events.map(({ eventName }) => eventName)).toEqual([
      "permit.requested",
      "permit.eva-approved",
      "permit.crew-egressed",
      "permit.crew-returned",
    ]);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("接続箱");
    expect(serialized).not.toContain("圧力低下");
    expect(events.every(({ lunarDay }) => lunarDay === 7)).toBe(true);
  });

  test("読み取りと保存の間に状態が変わっていれば PermitConflict を返し、記録も残さない", async () => {
    const db = freshDatabase();
    const store = createPermitEventStore(db);
    unwrap(await store.store(EvaPermit.request(eventContext(1))(requested)));
    const firstApproval = EvaPermit.approve(eventContext(2))(requested, { segmentId: ids.segment });
    const secondApproval = EvaPermit.approve(eventContext(3))(requested, { segmentId: ids.segment });
    unwrap(await store.store(firstApproval));

    const conflict = await store.store(secondApproval);
    expect(conflict._unsafeUnwrapErr()).toEqual({ kind: "PermitConflict", permitId: ids.permit });
    expect(eventCount(db)).toBe(2);
    expect(db.select().from(permitsTable).get()?.status).toBe("Approved");
  });

  test("同じ作業許可番号の二重申請は PermitConflict", async () => {
    const db = freshDatabase();
    const store = createPermitEventStore(db);
    unwrap(await store.store(EvaPermit.request(eventContext(1))(requested)));
    const duplicate = await store.store(EvaPermit.request(eventContext(2))(requested));
    expect(duplicate._unsafeUnwrapErr()).toEqual({ kind: "PermitConflict", permitId: ids.permit });
    expect(eventCount(db)).toBe(1);
  });

  test("中止は申請済と承認済の行だけを更新し、理由を記録に出さない", async () => {
    const db = freshDatabase();
    const store = createPermitEventStore(db);
    unwrap(await store.store(EvaPermit.request(eventContext(1))(requested)));
    const aborted = EvaPermit.abort(eventContext(2))(requested, AbortReason.schema.parse("フレア警報の予報"));
    unwrap(await store.store(aborted));
    expect(db.select().from(permitsTable).get()?.status).toBe("Aborted");
    expect(JSON.stringify(db.select().from(domainEventsTable).all())).not.toContain("フレア警報の予報");
    const again = await store.store(EvaPermit.abort(eventContext(3))(requested, AbortReason.schema.parse("二重")));
    expect(again._unsafeUnwrapErr().kind).toBe("PermitConflict");
  });
});

describe("lockout release store", () => {
  const prepareReturnedPermitWithLockout = async (db: ReturnType<typeof freshDatabase>) => {
    unwrap(await createSegmentRegisteredStore(db).store(Segment.register(eventContext(1))(energizedSegment)));
    const permitStore = createPermitEventStore(db);
    unwrap(await permitStore.store(EvaPermit.request(eventContext(2))(requested)));
    const tagged = Segment.tagLockout(eventContext(3, { actorUserId: ids.electrician }))(energizedSegment, ids.permit);
    unwrap(await createLockoutTaggedStore(db).store(tagged));
    const approvedEvent = EvaPermit.approve(eventContext(4))(requested, { segmentId: ids.segment });
    const egressedEvent = EvaPermit.egress(eventContext(5))(approvedEvent.aggregateState);
    const returnedEvent = EvaPermit.returnToBase(eventContext(6))(egressedEvent.aggregateState, { kind: "Planned" });
    unwrap(await permitStore.store(approvedEvent, egressedEvent, returnedEvent));
    return { tagged, returnedState: returnedEvent.aggregateState } as const;
  };

  test("札の取り外しと完了を1つの transaction で保存する", async () => {
    const db = freshDatabase();
    const { tagged, returnedState } = await prepareReturnedPermitWithLockout(db);
    const before = eventCount(db);
    const context = eventContext(7, { actorUserId: ids.electrician });
    const lockoutRemoved = Segment.removeLockout(context)(tagged.aggregateState);
    const permitClosed = EvaPermit.close(eventContext(8, { actorUserId: ids.electrician }))(returnedState);

    unwrap(await createLockoutReleaseStore(db).store(lockoutRemoved, permitClosed));

    expect(db.select().from(segmentsTable).get()).toMatchObject({ lockoutStatus: "Energized", lockedOutPermitId: null });
    expect(db.select().from(permitsTable).get()?.status).toBe("Closed");
    expect(eventCount(db)).toBe(before + 2);
    expect(unwrap(await createSegmentByIdResolver(db).resolveById(ids.segment))?.lockout).toEqual({ kind: "Energized" });
  });

  test("札が別の許可のものに変わっていれば、完了も保存されない", async () => {
    const db = freshDatabase();
    const { tagged, returnedState } = await prepareReturnedPermitWithLockout(db);
    db.update(segmentsTable)
      .set({ lockedOutPermitId: ids.otherPermit })
      .where(eq(segmentsTable.segmentId, ids.segment))
      .run();
    const before = eventCount(db);

    const result = await createLockoutReleaseStore(db).store(
      Segment.removeLockout(eventContext(7, { actorUserId: ids.electrician }))(tagged.aggregateState),
      EvaPermit.close(eventContext(8, { actorUserId: ids.electrician }))(returnedState),
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: "SegmentConflict", segmentId: ids.segment });
    expect(db.select().from(permitsTable).get()?.status).toBe("Returned");
    expect(eventCount(db)).toBe(before);
  });

  test("許可が帰還済でなくなっていれば、札の取り外しも巻き戻る", async () => {
    const db = freshDatabase();
    const { tagged, returnedState } = await prepareReturnedPermitWithLockout(db);
    db.update(permitsTable).set({ status: "Outside" }).where(eq(permitsTable.permitId, ids.permit)).run();
    const before = eventCount(db);

    const result = await createLockoutReleaseStore(db).store(
      Segment.removeLockout(eventContext(7, { actorUserId: ids.electrician }))(tagged.aggregateState),
      EvaPermit.close(eventContext(8, { actorUserId: ids.electrician }))(returnedState),
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: "PermitConflict", permitId: ids.permit });
    expect(db.select().from(segmentsTable).get()?.lockoutStatus).toBe("LockedOut");
    expect(eventCount(db)).toBe(before);
  });

  test("別々の許可のイベントを組み合わせた呼び出しは例外で止める", async () => {
    const db = freshDatabase();
    const { tagged } = await prepareReturnedPermitWithLockout(db);
    await expect(
      createLockoutReleaseStore(db).store(
        Segment.removeLockout(eventContext(7))(tagged.aggregateState),
        EvaPermit.close(eventContext(8))({ ...returned, permitId: ids.otherPermit }),
      ),
    ).rejects.toThrow("Mismatched lockout release events");
  });
});

describe("segment stores", () => {
  test("通電中の区間にだけ札を掛け、二重の札は SegmentConflict", async () => {
    const db = freshDatabase();
    unwrap(await createSegmentRegisteredStore(db).store(Segment.register(eventContext(1))(energizedSegment)));
    const tagged = Segment.tagLockout(eventContext(2, { actorUserId: ids.electrician }))(energizedSegment, ids.permit);
    unwrap(await createLockoutTaggedStore(db).store(tagged));
    const again = await createLockoutTaggedStore(db).store(
      Segment.tagLockout(eventContext(3))(energizedSegment, ids.otherPermit),
    );
    expect(again._unsafeUnwrapErr()).toEqual({ kind: "SegmentConflict", segmentId: ids.segment });
    const removedForOther = await createLockoutRemovedStore(db).store(
      Segment.removeLockout(eventContext(4))({ ...lockedOutSegment, lockout: { ...lockedOutSegment.lockout, permitId: ids.otherPermit } }),
    );
    expect(removedForOther._unsafeUnwrapErr().kind).toBe("SegmentConflict");
    unwrap(await createLockoutRemovedStore(db).store(Segment.removeLockout(eventContext(5))(tagged.aggregateState)));
    expect(db.select().from(segmentsTable).get()?.lockoutStatus).toBe("Energized");
  });

  test("区間の重複登録は SegmentAlreadyExists、遮断中の削除は SegmentInUse", async () => {
    const db = freshDatabase();
    unwrap(await createSegmentRegisteredStore(db).store(Segment.register(eventContext(1))(energizedSegment)));
    expect(
      (await createSegmentRegisteredStore(db).store(Segment.register(eventContext(2))(energizedSegment)))._unsafeUnwrapErr(),
    ).toEqual({ kind: "SegmentAlreadyExists", segmentId: ids.segment });
    unwrap(await createLockoutTaggedStore(db).store(Segment.tagLockout(eventContext(3))(energizedSegment, ids.permit)));
    expect(
      (await createSegmentDeletedStore(db).store(Segment.delete(eventContext(4))(energizedSegment)))._unsafeUnwrapErr(),
    ).toEqual({ kind: "SegmentInUse", segmentId: ids.segment });
    expect(
      (await createSegmentDeletedStore(db).store(Segment.delete(eventContext(5))({ ...energizedSegment, segmentId: ids.otherSegment })))._unsafeUnwrapErr(),
    ).toEqual({ kind: "SegmentNotFound", segmentId: ids.otherSegment });
  });

  test("作業記録の区間の状態はラベルを含まず、札の情報だけを残す", async () => {
    const db = freshDatabase();
    unwrap(await createSegmentRegisteredStore(db).store(Segment.register(eventContext(1))(energizedSegment)));
    const event = db.select().from(domainEventsTable).get();
    expect(event?.aggregateState).toEqual({ segmentId: "PV-07", lockoutStatus: "Energized" });
  });
});

describe("worker and equipment check stores", () => {
  test("累積線量は projection にだけ置き、作業記録には出さない（規程第8条）", async () => {
    const db = freshDatabase();
    unwrap(await createWorkerRegisteredStore(db).store(Worker.register(eventContext(1))(worker(ids.workerA, 12_345))));
    unwrap(
      await createWorkerUpdatedStore(db).store(
        Worker.update(eventContext(2))(worker(ids.workerA, 12_345), {
          qualification: "Electrician",
          cumulativeDoseMicroSv: CumulativeDose.schema.parse(23_456),
        }),
      ),
    );
    expect(db.select().from(workersTable).get()).toMatchObject({ qualification: "Electrician", cumulativeDoseMicroSv: 23_456 });
    expect(unwrap(await createWorkerByIdResolver(db).resolveById(ids.workerA))?.cumulativeDoseMicroSv.unwrap()).toBe(23_456);
    const serialized = JSON.stringify(db.select().from(domainEventsTable).all());
    expect(serialized).not.toContain("12345");
    expect(serialized).not.toContain("23456");
    expect(
      (await createWorkerRegisteredStore(db).store(Worker.register(eventContext(3))(worker(ids.workerA))))._unsafeUnwrapErr(),
    ).toEqual({ kind: "WorkerAlreadyExists", workerId: ids.workerA });
  });

  test("進行中の許可に登録された隊員は削除できない", async () => {
    const db = freshDatabase();
    unwrap(await createWorkerRegisteredStore(db).store(Worker.register(eventContext(1))(worker(ids.workerA))));
    unwrap(await createPermitEventStore(db).store(EvaPermit.request(eventContext(2))(requested)));
    expect(
      (await createWorkerDeletedStore(db).store(Worker.delete(eventContext(3))(worker(ids.workerA))))._unsafeUnwrapErr(),
    ).toEqual({ kind: "WorkerHasActivePermit", workerId: ids.workerA });
    unwrap(await createPermitEventStore(db).store(EvaPermit.abort(eventContext(4))(requested, AbortReason.schema.parse("中止"))));
    unwrap(await createWorkerDeletedStore(db).store(Worker.delete(eventContext(5))(worker(ids.workerA))));
    expect(db.select().from(workersTable).all()).toHaveLength(0);
  });

  test("装備点検の所見は作業記録に出さない", async () => {
    const db = freshDatabase();
    unwrap(await createEquipmentCheckEventStore(db).store(EquipmentCheck.record(eventContext(1))(equipmentCheck(ids.checkA, ids.workerA))));
    expect(db.select().from(equipmentChecksTable).all()).toHaveLength(1);
    const event = db.select().from(domainEventsTable).get();
    expect(event?.aggregateState).toEqual({
      checkId: ids.checkA,
      permitId: ids.permit,
      workerId: ids.workerA,
      checkedAt: "2026-09-15T00:03:00.000Z",
      oxygenMinutes: 200,
      needsMaintenance: false,
    });
    expect(JSON.stringify(event)).not.toContain("グローブ");
  });
});

describe("event history reader", () => {
  test("読み手には安全な項目だけを渡し、それ以外は [REDACTED] にする", async () => {
    const db = freshDatabase();
    unwrap(await createWorkerRegisteredStore(db).store(Worker.register(eventContext(1))(worker(ids.workerA))));
    unwrap(await createPermitEventStore(db).store(EvaPermit.request(eventContext(2))(requested)));

    const records = unwrap(await createEventHistoryReader(db).list(admin));
    expect(records.map(({ eventName }) => eventName)).toEqual(["worker.registered", "permit.requested"]);
    expect(records[0]?.aggregateState).toEqual({ workerId: "W-01", qualification: "General" });
    expect(records[1]?.aggregateState).toMatchObject({ kind: "Requested", permitId: "EVA-0412", zoneId: "PV-07", crew: "[REDACTED]" });
    expect(records[1]?.lunarDay).toBe(7);
    expect(records[1]?.eventPayload).toEqual({ permitId: "EVA-0412", zoneId: "PV-07" });
  });

  test("累積線量が混入した記録は伏せて見せるのではなく、読み出しを拒む", async () => {
    const db = freshDatabase();
    db.insert(domainEventsTable)
      .values({
        eventId: "50000000-0000-4000-8000-000000000001",
        aggregateId: "W-09",
        aggregateName: "Worker",
        aggregateState: { workerId: "W-09", qualification: "General", cumulativeDoseMicroSv: 99_999 },
        eventName: "worker.registered",
        eventPayload: { workerId: "W-09" },
        occurredAt: "2026-09-15T00:09:00.000Z",
        lunarDay: 7,
        actorUserId: ids.admin,
      })
      .run();

    await expect(createEventHistoryReader(db).list(admin)).rejects.toThrow("cumulativeDoseMicroSv");
  });
});
