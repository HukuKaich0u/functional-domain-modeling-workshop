import { z } from "zod";

import { SegmentId } from "../../../domain/lockout/index.js";
import { PermitId, ZoneId } from "../../../domain/permit/index.js";
import type { EvaPermit } from "../../../domain/permit/index.js";
import { EquipmentCheck, WorkerId } from "../../../domain/worker/index.js";

const approver = z.enum(["base-commander", "ground-control"]);

const permitBase = {
  permitId: PermitId.schema,
  zoneId: ZoneId.schema,
  crew: z.tuple([WorkerId.schema, WorkerId.schema]).readonly(),
  plannedMinutes: z.number().int().positive(),
  requestedAt: z.string(),
} as const;

const approvedFields = {
  segmentId: SegmentId.schema,
  equipmentChecks: z
    .tuple([EquipmentCheck.schema, EquipmentCheck.schema])
    .readonly(),
  approvedAt: z.string(),
  approvedBy: approver,
} as const;

const returnRecord = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("Planned") }),
  z.object({ kind: z.literal("Emergency"), reason: z.string() }),
]);

const requested = z.object({ ...permitBase, kind: z.literal("Requested") });

const approved = z.object({
  ...permitBase,
  ...approvedFields,
  kind: z.literal("Approved"),
});

const outside = z.object({
  ...permitBase,
  ...approvedFields,
  kind: z.literal("Outside"),
  egressAt: z.string(),
});

const returned = z.object({
  ...permitBase,
  ...approvedFields,
  kind: z.literal("Returned"),
  egressAt: z.string(),
  returnedAt: z.string(),
  returnRecord,
});

const closed = z.object({
  ...permitBase,
  ...approvedFields,
  kind: z.literal("Closed"),
  egressAt: z.string(),
  returnedAt: z.string(),
  returnRecord,
  lockoutRemovedAt: z.string(),
  closedAt: z.string(),
});

const aborted = z.object({
  ...permitBase,
  kind: z.literal("Aborted"),
  reason: z.string(),
  abortedAt: z.string(),
  abortedBy: approver,
});

const permitSchema = z.discriminatedUnion("kind", [
  requested,
  approved,
  outside,
  returned,
  closed,
  aborted,
]);

const persistedJson = z.string().transform((state, context) => {
  try {
    return JSON.parse(state);
  } catch {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Persisted permit state is not valid JSON",
    });
    return z.NEVER;
  }
});

export const persistedPermitSchema = persistedJson.pipe(permitSchema);

export const parsePersistedPermit = (state: unknown): EvaPermit =>
  persistedPermitSchema.parse(state);
