import { ResultAsync } from "neverthrow";

import type {
  EquipmentCheck,
  EquipmentCheckRecorded,
  EquipmentCheckRecordedStore,
} from "../../../../domain/equipmentCheck/index.js";
import type { SqliteDatabase } from "../db.js";
import { toEventRecord } from "../eventRecord.js";
import { domainEventsTable, equipmentChecksTable } from "../schema.js";

/** 作業記録に残す状態。点検所見は含めない */
export const safeEquipmentCheckState = (check: EquipmentCheck): Readonly<Record<string, unknown>> => ({
  checkId: check.checkId,
  permitId: check.permitId,
  workerId: check.workerId,
  checkedAt: check.checkedAt,
  oxygenMinutes: check.oxygenMinutes,
  needsMaintenance: check.needsMaintenance,
});

export const createEquipmentCheckEventStore = (db: SqliteDatabase): EquipmentCheckRecordedStore => ({
  store: (...events: readonly EquipmentCheckRecorded[]) =>
    ResultAsync.fromSafePromise(
      Promise.resolve().then(() =>
        db.transaction((tx) => {
          events.forEach((event) => {
            const check = event.aggregateState;
            tx.insert(equipmentChecksTable)
              .values({
                checkId: check.checkId,
                permitId: check.permitId,
                workerId: check.workerId,
                state: { ...check, note: check.note.unwrap() },
              })
              .run();
            tx.insert(domainEventsTable)
              .values(toEventRecord(event, safeEquipmentCheckState(check), event.eventPayload))
              .run();
          });
        }),
      ),
    ),
});
