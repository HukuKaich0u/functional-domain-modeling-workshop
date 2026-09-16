import { describe, expect, test } from "vitest";

import { createSqliteDatabase, migrateDatabase } from "../../src/adaptor/secondary/sqlite/db.js";
import { createEquipmentCheckByPermitIdResolver } from "../../src/adaptor/secondary/sqlite/resolver/equipmentCheckResolver.js";
import { createEquipmentCheckEventStore } from "../../src/adaptor/secondary/sqlite/store/equipmentCheckEventStore.js";
import { EquipmentCheck, EquipmentCheckId } from "../../src/domain/equipmentCheck/index.js";
import { at, equipmentCheck, eventContext, ids } from "../support/fixtures.js";

describe("SQLite 装備点検 resolver", () => {
  test("保存順によらず指定した許可の隊員ごとに点検時刻が最新の記録を返す", async () => {
    const db = createSqliteDatabase(":memory:");
    migrateDatabase(db);
    const store = createEquipmentCheckEventStore(db);
    const newer = { ...equipmentCheck(ids.checkA, ids.workerA, 100), checkedAt: at("2026-09-15T00:10:00.000Z") };
    const older = equipmentCheck(ids.checkB, ids.workerA, 200);
    const otherWorker = equipmentCheck(EquipmentCheckId.schema.parse("10000000-0000-4000-8000-000000000003"), ids.workerB);
    const otherPermit = {
      ...equipmentCheck(EquipmentCheckId.schema.parse("10000000-0000-4000-8000-000000000004"), ids.workerA),
      permitId: ids.otherPermit,
      checkedAt: at("2026-09-15T00:20:00.000Z"),
    };
    const stored = await store.store(
      EquipmentCheck.record(eventContext(1))(newer),
      EquipmentCheck.record(eventContext(2))(older),
      EquipmentCheck.record(eventContext(3))(otherWorker),
      EquipmentCheck.record(eventContext(4))(otherPermit),
    );
    expect(stored.isOk()).toBe(true);

    const resolved = await createEquipmentCheckByPermitIdResolver(db).resolveByPermitId(ids.permit);

    expect(resolved.isOk()).toBe(true);
    expect(resolved._unsafeUnwrap()).toHaveLength(2);
    expect(resolved._unsafeUnwrap().map(({ checkId, workerId, oxygenMinutes }) => ({ checkId, workerId, oxygenMinutes }))).toEqual(expect.arrayContaining([
      { checkId: newer.checkId, workerId: ids.workerA, oxygenMinutes: 100 },
      { checkId: otherWorker.checkId, workerId: ids.workerB, oxygenMinutes: 200 },
    ]));
  });

  test("点検時刻が同じなら識別子の大小によらず後から保存した点検を返す", async () => {
    const db = createSqliteDatabase(":memory:");
    migrateDatabase(db);
    const store = createEquipmentCheckEventStore(db);
    const first = equipmentCheck(ids.checkB, ids.workerA, 200);
    const last = equipmentCheck(ids.checkA, ids.workerA, 100);
    // 同じ時刻の記録でも、保存された順序で再点検を区別する。
    expect((await store.store(EquipmentCheck.record(eventContext(1))(first))).isOk()).toBe(true);
    expect((await store.store(EquipmentCheck.record(eventContext(2))(last))).isOk()).toBe(true);

    const resolved = await createEquipmentCheckByPermitIdResolver(db).resolveByPermitId(ids.permit);

    expect(resolved.isOk()).toBe(true);
    expect(resolved._unsafeUnwrap()).toHaveLength(1);
    expect(resolved._unsafeUnwrap()[0]).toMatchObject({ checkId: last.checkId, oxygenMinutes: 100 });
  });
});
