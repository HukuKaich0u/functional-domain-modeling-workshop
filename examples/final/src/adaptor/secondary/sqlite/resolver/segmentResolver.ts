import { eq } from "drizzle-orm";
import { ResultAsync } from "neverthrow";
import { z } from "zod";

import { Timestamp } from "../../../../domain/aggregate/timestamp.js";
import { PermitId } from "../../../../domain/permit/index.js";
import { SegmentId, SegmentLabel } from "../../../../domain/segment/index.js";
import type {
  Segment,
  SegmentByIdResolver,
  SegmentListResolver,
} from "../../../../domain/segment/index.js";
import { UserId } from "../../../../domain/user/userId.js";
import type { SqliteDatabase } from "../db.js";
import { segmentsTable } from "../schema.js";

const LockoutSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("Energized") }),
  z.object({
    kind: z.literal("LockedOut"),
    permitId: PermitId.schema,
    taggedBy: UserId.schema,
    taggedAt: Timestamp.schema,
  }),
]);
const SegmentStateSchema = z.object({
  segmentId: SegmentId.schema,
  label: SegmentLabel.schema,
  lockout: LockoutSchema,
});
const SegmentRowSchema = z.object({
  segmentId: SegmentId.schema,
  label: SegmentLabel.schema,
  lockoutStatus: z.enum(["Energized", "LockedOut"]),
  lockedOutPermitId: PermitId.schema.nullable(),
  state: SegmentStateSchema,
});

export const parseSegmentRow = (raw: unknown): Segment => {
  const row = SegmentRowSchema.parse(raw);
  const lockedOutPermitId = row.state.lockout.kind === "LockedOut" ? row.state.lockout.permitId : null;
  if (
    row.segmentId !== row.state.segmentId ||
    row.label !== row.state.label ||
    row.lockoutStatus !== row.state.lockout.kind ||
    row.lockedOutPermitId !== lockedOutPermitId
  ) {
    throw new TypeError("Corrupt segment projection");
  }
  return row.state;
};

export const createSegmentByIdResolver = (db: SqliteDatabase): SegmentByIdResolver => ({
  resolveById: (segmentId) =>
    ResultAsync.fromSafePromise(
      Promise.resolve().then(() => {
        const row = db.select().from(segmentsTable).where(eq(segmentsTable.segmentId, segmentId)).get();
        return row === undefined ? undefined : parseSegmentRow(row);
      }),
    ),
});

export const createSegmentListResolver = (db: SqliteDatabase): SegmentListResolver => ({
  resolveAll: () =>
    ResultAsync.fromSafePromise(
      Promise.resolve().then(() => db.select().from(segmentsTable).all().map(parseSegmentRow)),
    ),
});
