import { eq } from "drizzle-orm";
import { ResultAsync } from "neverthrow";
import { z } from "zod";

import { Timestamp } from "../../../../domain/aggregate/timestamp.js";
import {
  EquipmentCheckId,
  EquipmentNote,
  OxygenMinutes,
} from "../../../../domain/equipmentCheck/index.js";
import type {
  EquipmentCheck,
  EquipmentCheckByPermitIdResolver,
} from "../../../../domain/equipmentCheck/index.js";
import { PermitId } from "../../../../domain/permit/index.js";
import { WorkerId } from "../../../../domain/worker/index.js";
import type { SqliteDatabase } from "../db.js";
import { equipmentChecksTable } from "../schema.js";

const EquipmentCheckStateSchema = z.object({
  checkId: EquipmentCheckId.schema,
  permitId: PermitId.schema,
  workerId: WorkerId.schema,
  checkedAt: Timestamp.schema,
  oxygenMinutes: OxygenMinutes.schema,
  note: EquipmentNote.schema,
  needsMaintenance: z.boolean(),
});
const EquipmentCheckRowSchema = z.object({
  checkId: EquipmentCheckId.schema,
  permitId: PermitId.schema,
  workerId: WorkerId.schema,
  state: EquipmentCheckStateSchema,
});

export const parseEquipmentCheckRow = (raw: unknown): EquipmentCheck => {
  const row = EquipmentCheckRowSchema.parse(raw);
  if (
    row.checkId !== row.state.checkId ||
    row.permitId !== row.state.permitId ||
    row.workerId !== row.state.workerId
  ) {
    throw new TypeError("Corrupt equipment check projection");
  }
  return row.state;
};

export const createEquipmentCheckByPermitIdResolver = (
  db: SqliteDatabase,
): EquipmentCheckByPermitIdResolver => ({
  resolveByPermitId: (permitId) =>
    ResultAsync.fromSafePromise(
      Promise.resolve().then(() =>
        db
          .select()
          .from(equipmentChecksTable)
          .where(eq(equipmentChecksTable.permitId, permitId))
          .all()
          .map(parseEquipmentCheckRow),
      ),
    ),
});
