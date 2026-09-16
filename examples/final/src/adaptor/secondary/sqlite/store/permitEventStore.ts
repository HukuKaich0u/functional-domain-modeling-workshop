import { and, eq, or } from "drizzle-orm";
import { ResultAsync } from "neverthrow";
import { z } from "zod";

import type {
  EvaPermit,
  PermitEvent,
  PermitStoreError,
} from "../../../../domain/permit/index.js";
import { PermitId } from "../../../../domain/permit/index.js";
import { assertNever } from "../../../../domain/shared/assertNever.js";
import type { SqliteDatabase } from "../db.js";
import { toEventRecord } from "../eventRecord.js";
import { domainEventsTable, permitsTable, segmentsTable } from "../schema.js";

/** 完了は遮断札の取り外しと同じ transaction で保存するため、この store では扱わない */
export type PermitProjectionEvent = Exclude<PermitEvent, { kind: "PermitClosed" }>;

/** 作業記録に残す状態。作業内容、中止理由、緊急帰還の理由は含めない */
export const safePermitState = (state: EvaPermit): Readonly<Record<string, unknown>> => {
  const base = {
    kind: state.kind,
    permitId: state.permitId,
    zoneId: state.zoneId,
    crew: state.crew,
    plannedMinutes: state.plannedMinutes,
    requestedAt: state.requestedAt,
  };
  switch (state.kind) {
    case "Requested":
      return base;
    case "Approved":
      return {
        ...base,
        segmentId: state.segmentId,
        approvedBy: state.approvedBy,
        approvedAt: state.approvedAt,
        approvalLunarDay: state.approvalLunarDay,
      };
    case "Outside":
      return {
        ...base,
        segmentId: state.segmentId,
        approvedBy: state.approvedBy,
        approvedAt: state.approvedAt,
        approvalLunarDay: state.approvalLunarDay,
        egressAt: state.egressAt,
      };
    case "Returned":
      return {
        ...base,
        segmentId: state.segmentId,
        approvedBy: state.approvedBy,
        approvedAt: state.approvedAt,
        approvalLunarDay: state.approvalLunarDay,
        egressAt: state.egressAt,
        returnedAt: state.returnedAt,
        returnKind: state.returnRecord.kind,
      };
    case "Closed":
      return {
        ...base,
        segmentId: state.segmentId,
        approvedBy: state.approvedBy,
        approvedAt: state.approvedAt,
        approvalLunarDay: state.approvalLunarDay,
        egressAt: state.egressAt,
        returnedAt: state.returnedAt,
        returnKind: state.returnRecord.kind,
        lockoutRemovedAt: state.lockoutRemovedAt,
        closedAt: state.closedAt,
      };
    case "Aborted":
      return { ...base, abortedBy: state.abortedBy, abortedAt: state.abortedAt };
    default:
      return assertNever(state);
  }
};

/** 現在状態の projection。resolver が状態を復元できるよう、Sensitive は平文で保存する */
export const permitProjectionState = (state: EvaPermit): Readonly<Record<string, unknown>> => {
  switch (state.kind) {
    case "Requested":
    case "Approved":
    case "Outside":
      return { ...state, purpose: state.purpose.unwrap() };
    case "Returned":
    case "Closed":
      return {
        ...state,
        purpose: state.purpose.unwrap(),
        returnRecord:
          state.returnRecord.kind === "Planned"
            ? state.returnRecord
            : { kind: "Emergency", reason: state.returnRecord.reason.unwrap() },
      };
    case "Aborted":
      return { ...state, purpose: state.purpose.unwrap(), abortReason: state.abortReason.unwrap() };
    default:
      return assertNever(state);
  }
};

export const permitRowValues = (state: EvaPermit) => ({
  permitId: state.permitId,
  status: state.kind,
  zoneId: state.zoneId,
  crewA: state.crew[0],
  crewB: state.crew[1],
  state: permitProjectionState(state),
});

const PermitConflictSchema = z.object({
  kind: z.literal("PermitConflict"),
  permitId: PermitId.schema,
});

export const createPermitEventStore = (db: SqliteDatabase) => ({
  store: (...events: readonly PermitProjectionEvent[]) =>
    ResultAsync.fromPromise<void, PermitStoreError>(
      Promise.resolve().then(() =>
        db.transaction((tx) => {
          events.forEach((event) => {
            // Resolver で確認した後に札が外されても、承認を確定させない。
            if (event.kind === "EvaApproved") {
              const lockout = tx.select({ segmentId: segmentsTable.segmentId }).from(segmentsTable)
                .where(and(
                  eq(segmentsTable.segmentId, event.aggregateState.segmentId),
                  eq(segmentsTable.lockoutStatus, "LockedOut"),
                  eq(segmentsTable.lockedOutPermitId, event.aggregateId),
                )).get();
              if (lockout === undefined) {
                throw { kind: "PermitConflict", permitId: event.aggregateId } as const;
              }
            }
            const state = event.aggregateState;
            const values = permitRowValues(state);
            const changes = (() => {
              switch (event.kind) {
                case "PermitRequested":
                  return tx.insert(permitsTable)
                    .values(values)
                    .onConflictDoNothing({ target: permitsTable.permitId })
                    .run().changes;
                case "EvaApproved":
                  return tx.update(permitsTable)
                    .set(values)
                    .where(and(
                      eq(permitsTable.permitId, state.permitId),
                      eq(permitsTable.status, "Requested"),
                    ))
                    .run().changes;
                case "CrewEgressed":
                  return tx.update(permitsTable)
                    .set(values)
                    .where(and(
                      eq(permitsTable.permitId, state.permitId),
                      eq(permitsTable.status, "Approved"),
                    ))
                    .run().changes;
                case "CrewReturned":
                  return tx.update(permitsTable)
                    .set(values)
                    .where(and(
                      eq(permitsTable.permitId, state.permitId),
                      eq(permitsTable.status, "Outside"),
                    ))
                    .run().changes;
                case "PermitAborted":
                  return tx.update(permitsTable)
                    .set(values)
                    .where(and(
                      eq(permitsTable.permitId, state.permitId),
                      or(
                        eq(permitsTable.status, "Requested"),
                        eq(permitsTable.status, "Approved"),
                      ),
                    ))
                    .run().changes;
                default:
                  return assertNever(event);
              }
            })();
            if (changes !== 1) {
              throw {
                kind: "PermitConflict",
                permitId: event.aggregateId,
              } as const;
            }
            tx.insert(domainEventsTable)
              .values(toEventRecord(event, safePermitState(state), event.eventPayload))
              .run();
          });
        }),
      ),
      (cause): PermitStoreError => {
        const conflict = PermitConflictSchema.safeParse(cause);
        if (conflict.success) return conflict.data;
        throw cause;
      },
    ),
} as const);
