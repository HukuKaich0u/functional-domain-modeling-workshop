import { and, eq } from "drizzle-orm";
import { ResultAsync } from "neverthrow";
import { z } from "zod";

import type { PermitClosed } from "../../../../domain/permit/index.js";
import { PermitId } from "../../../../domain/permit/index.js";
import type {
  LockoutReleaseStore,
  LockoutReleaseStoreError,
  LockoutRemoved,
} from "../../../../domain/segment/index.js";
import { SegmentId } from "../../../../domain/segment/index.js";
import type { SqliteDatabase } from "../db.js";
import { toEventRecord } from "../eventRecord.js";
import { domainEventsTable, permitsTable, segmentsTable } from "../schema.js";
import { permitRowValues, safePermitState } from "./permitEventStore.js";
import { safeSegmentState, segmentRowValues } from "./segmentEventStore.js";

const ReleaseConflictSchema = z.union([
  z.object({ kind: z.literal("SegmentConflict"), segmentId: SegmentId.schema }),
  z.object({ kind: z.literal("PermitConflict"), permitId: PermitId.schema }),
]);

const ensureMatchingEvents = (
  lockoutRemoved: LockoutRemoved,
  permitClosed: PermitClosed,
): void => {
  if (
    lockoutRemoved.eventPayload.permitId !== permitClosed.aggregateId ||
    lockoutRemoved.aggregateId !== permitClosed.aggregateState.segmentId ||
    lockoutRemoved.actorUserId !== permitClosed.actorUserId ||
    lockoutRemoved.eventId === permitClosed.eventId
  ) {
    throw new TypeError("Mismatched lockout release events");
  }
};

/**
 * 遮断札の取り外しと作業許可の完了を1つの transaction で保存する。
 * 札が別の許可のものに変わっていた、許可が帰還済でなかった場合は、どちらも保存しない。
 */
export const createLockoutReleaseStore = (db: SqliteDatabase): LockoutReleaseStore => ({
  store: (lockoutRemoved, permitClosed) =>
    ResultAsync.fromPromise<void, LockoutReleaseStoreError>(
      Promise.resolve().then(() => {
        ensureMatchingEvents(lockoutRemoved, permitClosed);
        return db.transaction((tx) => {
          const segmentChanges = tx
            .update(segmentsTable)
            .set(segmentRowValues(lockoutRemoved.aggregateState))
            .where(
              and(
                eq(segmentsTable.segmentId, lockoutRemoved.aggregateId),
                eq(segmentsTable.lockoutStatus, "LockedOut"),
                eq(segmentsTable.lockedOutPermitId, permitClosed.aggregateId),
              ),
            )
            .run().changes;
          if (segmentChanges !== 1) {
            throw { kind: "SegmentConflict", segmentId: lockoutRemoved.aggregateId } as const;
          }

          const permitChanges = tx
            .update(permitsTable)
            .set(permitRowValues(permitClosed.aggregateState))
            .where(
              and(
                eq(permitsTable.permitId, permitClosed.aggregateId),
                eq(permitsTable.status, "Returned"),
              ),
            )
            .run().changes;
          if (permitChanges !== 1) {
            throw { kind: "PermitConflict", permitId: permitClosed.aggregateId } as const;
          }

          tx.insert(domainEventsTable)
            .values(
              toEventRecord(
                lockoutRemoved,
                safeSegmentState(lockoutRemoved.aggregateState),
                lockoutRemoved.eventPayload,
              ),
            )
            .run();
          tx.insert(domainEventsTable)
            .values(
              toEventRecord(
                permitClosed,
                safePermitState(permitClosed.aggregateState),
                permitClosed.eventPayload,
              ),
            )
            .run();
        });
      }),
      (cause): LockoutReleaseStoreError => {
        const conflict = ReleaseConflictSchema.safeParse(cause);
        if (conflict.success) return conflict.data;
        throw cause;
      },
    ),
});
