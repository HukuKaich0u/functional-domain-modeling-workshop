import { describe, expect, test } from "vitest";

import { createSqliteDatabase, migrateDatabase } from "../../src/adaptor/secondary/sqlite/db.js";
import { domainEventsTable, permitsTable, segmentsTable } from "../../src/adaptor/secondary/sqlite/schema.js";
import { createPermitEventStore } from "../../src/adaptor/secondary/sqlite/store/permitEventStore.js";
import { createLockoutRemovedStore, createLockoutTaggedStore, createSegmentRegisteredStore } from "../../src/adaptor/secondary/sqlite/store/segmentEventStore.js";
import { EvaPermit } from "../../src/domain/permit/index.js";
import { Segment } from "../../src/domain/segment/index.js";
import { energizedSegment, eventContext, ids, requested } from "../support/fixtures.js";

const prepare = async () => {
  const db = createSqliteDatabase(":memory:");
  migrateDatabase(db);
  const permitStore = createPermitEventStore(db);
  expect((await permitStore.store(EvaPermit.request(eventContext(1))(requested))).isOk()).toBe(true);
  expect((await createSegmentRegisteredStore(db).store(Segment.register(eventContext(2))(energizedSegment))).isOk()).toBe(true);
  const tagged = Segment.tagLockout(eventContext(3, { actorUserId: ids.electrician }))(energizedSegment, ids.permit);
  expect((await createLockoutTaggedStore(db).store(tagged)).isOk()).toBe(true);
  const approval = EvaPermit.approve(eventContext(4))(requested, { segmentId: ids.segment });
  const removal = Segment.removeLockout(eventContext(5, { actorUserId: ids.electrician }))(tagged.aggregateState);
  return { db, permitStore, approval, removal };
};

describe("承認と遮断札取り外しの保存競合", () => {
  test("承認が先に保存されたら、申請済の時点で作った取り外しイベントを保存しない", async () => {
    const { db, permitStore, approval, removal } = await prepare();
    expect((await permitStore.store(approval)).isOk()).toBe(true);
    const before = db.select().from(domainEventsTable).all();
    const result = await createLockoutRemovedStore(db).store(removal);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: "SegmentConflict", segmentId: ids.segment });
    expect(db.select().from(segmentsTable).get()?.lockoutStatus).toBe("LockedOut");
    expect(db.select().from(permitsTable).get()?.status).toBe("Approved");
    expect(db.select().from(domainEventsTable).all()).toEqual(before);
  });

  test("取り外しが先に保存されたら、遮断中の時点で作った承認イベントを保存しない", async () => {
    const { db, permitStore, approval, removal } = await prepare();
    expect((await createLockoutRemovedStore(db).store(removal)).isOk()).toBe(true);
    const before = db.select().from(domainEventsTable).all();
    const result = await permitStore.store(approval);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: "PermitConflict", permitId: ids.permit });
    expect(db.select().from(segmentsTable).get()?.lockoutStatus).toBe("Energized");
    expect(db.select().from(permitsTable).get()?.status).toBe("Requested");
    expect(db.select().from(domainEventsTable).all()).toEqual(before);
  });
});
