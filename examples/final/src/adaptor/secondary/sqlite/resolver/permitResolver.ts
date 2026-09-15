import { eq, or } from "drizzle-orm";
import { ResultAsync } from "neverthrow";
import { z } from "zod";

import { LunarDay } from "../../../../domain/aggregate/lunarDay.js";
import { Timestamp } from "../../../../domain/aggregate/timestamp.js";
import {
  AbortReason,
  EmergencyReason,
  PermitId,
  PermitPurpose,
  PlannedMinutes,
  ZoneId,
} from "../../../../domain/permit/index.js";
import type {
  EvaPermit,
  PermitByIdResolver,
  PermitByWorkerIdResolver,
  PermitByZoneIdResolver,
  PermitListResolver,
} from "../../../../domain/permit/index.js";
import { SegmentId } from "../../../../domain/segment/index.js";
import { UserId } from "../../../../domain/user/userId.js";
import { WorkerId } from "../../../../domain/worker/index.js";
import type { SqliteDatabase } from "../db.js";
import { permitsTable } from "../schema.js";

const baseShape = {
  permitId: PermitId.schema,
  zoneId: ZoneId.schema,
  crew: z.tuple([WorkerId.schema, WorkerId.schema]).readonly(),
  plannedMinutes: PlannedMinutes.schema,
  purpose: PermitPurpose.schema,
  requestedAt: Timestamp.schema,
};
const approvedShape = {
  ...baseShape,
  segmentId: SegmentId.schema,
  approvedBy: UserId.schema,
  approvedAt: Timestamp.schema,
  approvalLunarDay: LunarDay.schema,
};
const ReturnRecordSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("Planned") }),
  z.object({ kind: z.literal("Emergency"), reason: EmergencyReason.schema }),
]);
const PermitSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("Requested"), ...baseShape }),
  z.object({ kind: z.literal("Approved"), ...approvedShape }),
  z.object({ kind: z.literal("Outside"), ...approvedShape, egressAt: Timestamp.schema }),
  z.object({
    kind: z.literal("Returned"),
    ...approvedShape,
    egressAt: Timestamp.schema,
    returnedAt: Timestamp.schema,
    returnRecord: ReturnRecordSchema,
  }),
  z.object({
    kind: z.literal("Closed"),
    ...approvedShape,
    egressAt: Timestamp.schema,
    returnedAt: Timestamp.schema,
    returnRecord: ReturnRecordSchema,
    lockoutRemovedAt: Timestamp.schema,
    closedAt: Timestamp.schema,
  }),
  z.object({
    kind: z.literal("Aborted"),
    ...baseShape,
    abortReason: AbortReason.schema,
    abortedBy: UserId.schema,
    abortedAt: Timestamp.schema,
  }),
]);
const PermitStatusSchema = z.enum([
  "Requested",
  "Approved",
  "Outside",
  "Returned",
  "Closed",
  "Aborted",
]);
const PermitRowSchema = z.object({
  permitId: PermitId.schema,
  status: PermitStatusSchema,
  zoneId: ZoneId.schema,
  crewA: WorkerId.schema,
  crewB: WorkerId.schema,
  state: PermitSchema,
});

export const parsePermitState = (state: unknown): EvaPermit => PermitSchema.parse(state);
export const parsePermitRow = (raw: unknown): EvaPermit => {
  const row = PermitRowSchema.parse(raw);
  if (
    row.permitId !== row.state.permitId ||
    row.status !== row.state.kind ||
    row.zoneId !== row.state.zoneId ||
    row.crewA !== row.state.crew[0] ||
    row.crewB !== row.state.crew[1]
  ) {
    throw new TypeError("Corrupt permit projection");
  }
  return row.state;
};

export const createPermitByIdResolver = (db: SqliteDatabase): PermitByIdResolver => ({
  resolveById: (permitId) =>
    ResultAsync.fromSafePromise(
      Promise.resolve().then(() => {
        const row = db.select().from(permitsTable).where(eq(permitsTable.permitId, permitId)).get();
        return row === undefined ? undefined : parsePermitRow(row);
      }),
    ),
});

export const createPermitByWorkerIdResolver = (db: SqliteDatabase): PermitByWorkerIdResolver => ({
  resolveByWorkerId: (workerId) =>
    ResultAsync.fromSafePromise(
      Promise.resolve().then(() =>
        db
          .select()
          .from(permitsTable)
          .where(or(eq(permitsTable.crewA, workerId), eq(permitsTable.crewB, workerId)))
          .all()
          .map(parsePermitRow),
      ),
    ),
});

export const createPermitByZoneIdResolver = (db: SqliteDatabase): PermitByZoneIdResolver => ({
  resolveByZoneId: (zoneId) =>
    ResultAsync.fromSafePromise(
      Promise.resolve().then(() =>
        db.select().from(permitsTable).where(eq(permitsTable.zoneId, zoneId)).all().map(parsePermitRow),
      ),
    ),
});

export const createPermitListResolver = (db: SqliteDatabase): PermitListResolver => ({
  resolveAll: () =>
    ResultAsync.fromSafePromise(
      Promise.resolve().then(() => db.select().from(permitsTable).all().map(parsePermitRow)),
    ),
});
