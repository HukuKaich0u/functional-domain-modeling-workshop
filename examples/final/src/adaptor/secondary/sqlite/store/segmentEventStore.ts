import { and, eq, inArray } from "drizzle-orm";
import { err, ok, ResultAsync } from "neverthrow";
import { z } from "zod";

import type {
  LockoutRemoved,
  LockoutRemovedStore,
  LockoutTagged,
  LockoutTaggedStore,
  Segment,
  SegmentConflict,
  SegmentDeleted,
  SegmentDeletedStore,
  SegmentRegistered,
  SegmentRegisteredStore,
  SegmentUpdated,
  SegmentUpdatedStore,
} from "../../../../domain/segment/index.js";
import { SegmentId } from "../../../../domain/segment/index.js";
import type { SqliteDatabase } from "../db.js";
import { toEventRecord } from "../eventRecord.js";
import { domainEventsTable, permitsTable, segmentsTable } from "../schema.js";

const activeStatuses = ["Requested", "Approved", "Outside", "Returned"] as const;

/** 作業記録に残す状態。ラベルは業務上の名前なので出さず、遮断の有無と札の情報だけを残す */
export const safeSegmentState = (segment: Segment): Readonly<Record<string, unknown>> =>
  segment.lockout.kind === "Energized"
    ? { segmentId: segment.segmentId, lockoutStatus: "Energized" }
    : {
        segmentId: segment.segmentId,
        lockoutStatus: "LockedOut",
        permitId: segment.lockout.permitId,
        taggedBy: segment.lockout.taggedBy,
        taggedAt: segment.lockout.taggedAt,
      };

export const segmentRowValues = (segment: Segment) => ({
  segmentId: segment.segmentId,
  label: segment.label,
  lockoutStatus: segment.lockout.kind,
  lockedOutPermitId: segment.lockout.kind === "LockedOut" ? segment.lockout.permitId : null,
  state: segment,
});

const SegmentConflictSchema = z.object({
  kind: z.literal("SegmentConflict"),
  segmentId: SegmentId.schema,
});
const toSegmentConflict = (cause: unknown): SegmentConflict => {
  const conflict = SegmentConflictSchema.safeParse(cause);
  if (conflict.success) return conflict.data;
  throw cause;
};

const appendEvent = (
  tx: Parameters<Parameters<SqliteDatabase["transaction"]>[0]>[0],
  event: SegmentRegistered | SegmentUpdated | LockoutTagged | LockoutRemoved,
): void => {
  tx.insert(domainEventsTable)
    .values(toEventRecord(event, safeSegmentState(event.aggregateState), event.eventPayload))
    .run();
};

export const createSegmentRegisteredStore = (db: SqliteDatabase): SegmentRegisteredStore => ({
  store: (event) =>
    ResultAsync.fromSafePromise(
      Promise.resolve().then(() =>
        db.transaction((tx) => {
          const inserted = tx
            .insert(segmentsTable)
            .values(segmentRowValues(event.aggregateState))
            .onConflictDoNothing({ target: segmentsTable.segmentId })
            .run();
          if (inserted.changes !== 1) {
            return err({ kind: "SegmentAlreadyExists", segmentId: event.aggregateId } as const);
          }
          appendEvent(tx, event);
          return ok(undefined);
        }),
      ),
    ).andThen((result) => result),
});

export const createSegmentUpdatedStore = (db: SqliteDatabase): SegmentUpdatedStore => ({
  store: (...events) =>
    ResultAsync.fromSafePromise(
      Promise.resolve().then(() =>
        db.transaction((tx) => {
          events.forEach((event) => {
            const values = segmentRowValues(event.aggregateState);
            tx.insert(segmentsTable)
              .values(values)
              .onConflictDoUpdate({ target: segmentsTable.segmentId, set: values })
              .run();
            appendEvent(tx, event);
          });
        }),
      ),
    ),
});

/** 通電中の区間にだけ札を掛ける。読み取りと保存の間に変わっていれば conflict */
export const createLockoutTaggedStore = (db: SqliteDatabase): LockoutTaggedStore => ({
  store: (event) =>
    ResultAsync.fromPromise<void, SegmentConflict>(
      Promise.resolve().then(() =>
        db.transaction((tx) => {
          const changes = tx
            .update(segmentsTable)
            .set(segmentRowValues(event.aggregateState))
            .where(
              and(
                eq(segmentsTable.segmentId, event.aggregateId),
                eq(segmentsTable.lockoutStatus, "Energized"),
              ),
            )
            .run().changes;
          if (changes !== 1) {
            throw { kind: "SegmentConflict", segmentId: event.aggregateId } as const;
          }
          appendEvent(tx, event);
        }),
      ),
      toSegmentConflict,
    ),
});

/** 同じ許可の札が掛かっている区間だけを通電中へ戻す */
export const createLockoutRemovedStore = (db: SqliteDatabase): LockoutRemovedStore => ({
  store: (event) =>
    ResultAsync.fromPromise<void, SegmentConflict>(
      Promise.resolve().then(() =>
        db.transaction((tx) => {
          const changes = tx
            .update(segmentsTable)
            .set(segmentRowValues(event.aggregateState))
            .where(
              and(
                eq(segmentsTable.segmentId, event.aggregateId),
                eq(segmentsTable.lockoutStatus, "LockedOut"),
                eq(segmentsTable.lockedOutPermitId, event.eventPayload.permitId),
              ),
            )
            .run().changes;
          if (changes !== 1) {
            throw { kind: "SegmentConflict", segmentId: event.aggregateId } as const;
          }
          appendEvent(tx, event);
        }),
      ),
      toSegmentConflict,
    ),
});

/** 遮断中、または進行中の作業許可がある区画の区間は削除できない */
export const createSegmentDeletedStore = (db: SqliteDatabase): SegmentDeletedStore => ({
  store: (event: SegmentDeleted) =>
    ResultAsync.fromSafePromise(
      Promise.resolve().then(() =>
        db.transaction((tx) => {
          const current = tx
            .select({ lockoutStatus: segmentsTable.lockoutStatus })
            .from(segmentsTable)
            .where(eq(segmentsTable.segmentId, event.aggregateId))
            .get();
          if (current === undefined) {
            return err({ kind: "SegmentNotFound", segmentId: event.aggregateId } as const);
          }
          const blockingPermit = tx
            .select({ permitId: permitsTable.permitId })
            .from(permitsTable)
            .where(
              and(
                eq(permitsTable.zoneId, event.aggregateId),
                inArray(permitsTable.status, activeStatuses),
              ),
            )
            .get();
          if (current.lockoutStatus === "LockedOut" || blockingPermit !== undefined) {
            return err({ kind: "SegmentInUse", segmentId: event.aggregateId } as const);
          }

          tx.delete(segmentsTable).where(eq(segmentsTable.segmentId, event.aggregateId)).run();
          tx.insert(domainEventsTable)
            .values(toEventRecord(event, undefined, event.eventPayload))
            .run();
          return ok(undefined);
        }),
      ),
    ).andThen((result) => result),
});
