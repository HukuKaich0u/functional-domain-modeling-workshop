import { eq, sql } from "drizzle-orm";
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
      Promise.resolve().then(() => {
        const checks = db
          .select()
          .from(equipmentChecksTable)
          .where(eq(equipmentChecksTable.permitId, permitId))
          // 点検は追記のみ。同じ点検時刻の記録は保存順で選ぶ。
          .orderBy(sql`${equipmentChecksTable}.rowid`)
          .all()
          .map(parseEquipmentCheckRow);
        const latestByWorker = new Map<WorkerId, EquipmentCheck>();
        for (const check of checks) {
          const previous = latestByWorker.get(check.workerId);
          if (previous === undefined || Date.parse(check.checkedAt) >= Date.parse(previous.checkedAt)) {
            latestByWorker.set(check.workerId, check);
          }
        }
        return [...latestByWorker.values()];
      }),
    ),
});
