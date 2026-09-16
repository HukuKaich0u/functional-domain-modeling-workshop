import { describe, expect, test } from "vitest";

import { createSqliteDatabase, migrateDatabase } from "../../src/adaptor/secondary/sqlite/db.js";
import { createEquipmentCheckByPermitIdResolver } from "../../src/adaptor/secondary/sqlite/resolver/equipmentCheckResolver.js";
import {
  createPermitByIdResolver,
  createPermitByWorkerIdResolver,
  createPermitByZoneIdResolver,
  createPermitListResolver,
} from "../../src/adaptor/secondary/sqlite/resolver/permitResolver.js";
import { createSegmentListResolver } from "../../src/adaptor/secondary/sqlite/resolver/segmentResolver.js";
import {
  createCurrentSpaceWeatherResolver,
  createSpaceWeatherListResolver,
} from "../../src/adaptor/secondary/sqlite/resolver/spaceWeatherResolver.js";
import { createWorkerListResolver } from "../../src/adaptor/secondary/sqlite/resolver/workerResolver.js";
import { permitsTable } from "../../src/adaptor/secondary/sqlite/schema.js";
import { createEquipmentCheckEventStore } from "../../src/adaptor/secondary/sqlite/store/equipmentCheckEventStore.js";
import { createPermitEventStore } from "../../src/adaptor/secondary/sqlite/store/permitEventStore.js";
import { createSegmentRegisteredStore } from "../../src/adaptor/secondary/sqlite/store/segmentEventStore.js";
import { createSpaceWeatherEventStore } from "../../src/adaptor/secondary/sqlite/store/spaceWeatherEventStore.js";
import { createWorkerRegisteredStore } from "../../src/adaptor/secondary/sqlite/store/workerEventStore.js";
import { EquipmentCheck } from "../../src/domain/equipmentCheck/index.js";
import { EvaPermit } from "../../src/domain/permit/index.js";
import { Segment } from "../../src/domain/segment/index.js";
import { SpaceWeatherReport, SpaceWeatherReportId } from "../../src/domain/spaceWeather/index.js";
import { Worker } from "../../src/domain/worker/index.js";
import { at, energizedSegment, equipmentCheck, eventContext, ids, requested, weather, worker } from "../support/fixtures.js";

const unwrap = <T>(result: { isOk: () => boolean; _unsafeUnwrap: () => T }): T => {
  expect(result.isOk()).toBe(true);
  return result._unsafeUnwrap();
};

describe("SQLite resolvers", () => {
  test("作業許可を番号、隊員、作業区画から復元し、Sensitive を包み直す", async () => {
    const db = createSqliteDatabase(":memory:");
    migrateDatabase(db);
    const store = createPermitEventStore(db);
    unwrap(await store.store(EvaPermit.request(eventContext(1))(requested)));
    unwrap(await store.store(EvaPermit.request(eventContext(2))({ ...requested, permitId: ids.otherPermit, crew: [ids.workerB, ids.workerC] })));

    const byId = unwrap(await createPermitByIdResolver(db).resolveById(ids.permit));
    expect(byId).toMatchObject({ kind: "Requested", permitId: ids.permit });
    expect(byId?.purpose.unwrap()).toBe("PV-07 の接続箱を交換する");
    expect(JSON.stringify(byId)).not.toContain("接続箱");
    expect(unwrap(await createPermitByIdResolver(db).resolveById(ids.otherPermit))?.crew).toEqual([ids.workerB, ids.workerC]);
    expect(unwrap(await createPermitByWorkerIdResolver(db).resolveByWorkerId(ids.workerB)).map(({ permitId }) => permitId).sort()).toEqual([ids.permit, ids.otherPermit]);
    expect(unwrap(await createPermitByZoneIdResolver(db).resolveByZoneId(ids.zone))).toHaveLength(2);
    expect(unwrap(await createPermitListResolver(db).resolveAll())).toHaveLength(2);
    expect(unwrap(await createPermitByIdResolver(db).resolveById("EVA-9999" as typeof ids.permit))).toBeUndefined();
  });

  test("行と状態が食い違う projection は復元せずに例外で止める", async () => {
    const db = createSqliteDatabase(":memory:");
    migrateDatabase(db);
    unwrap(await createPermitEventStore(db).store(EvaPermit.request(eventContext(1))(requested)));
    db.update(permitsTable).set({ status: "Approved" }).run();
    await expect(createPermitByIdResolver(db).resolveById(ids.permit)).rejects.toThrow("Corrupt permit projection");
  });

  test("区間、隊員、装備点検を復元する", async () => {
    const db = createSqliteDatabase(":memory:");
    migrateDatabase(db);
    unwrap(await createSegmentRegisteredStore(db).store(Segment.register(eventContext(1))(energizedSegment)));
    unwrap(await createWorkerRegisteredStore(db).store(Worker.register(eventContext(2))(worker(ids.workerA, 4_321))));
    unwrap(await createEquipmentCheckEventStore(db).store(EquipmentCheck.record(eventContext(3))(equipmentCheck(ids.checkA, ids.workerA))));

    expect(unwrap(await createSegmentListResolver(db).resolveAll())).toEqual([energizedSegment]);
    const workers = unwrap(await createWorkerListResolver(db).resolveAll());
    expect(workers[0]?.radiationExposureMicroSv.unwrap()).toBe(4_321);
    const checks = unwrap(await createEquipmentCheckByPermitIdResolver(db).resolveByPermitId(ids.permit));
    expect(checks[0]?.note.unwrap()).toBe("左グローブのシールを交換済み");
    expect(checks[0]?.oxygenMinutes).toBe(200);
  });

  test("宇宙天気は発令時刻が最新の報告を現在とする", async () => {
    const db = createSqliteDatabase(":memory:");
    migrateDatabase(db);
    const store = createSpaceWeatherEventStore(db);
    const older = weather("S2");
    const newer = {
      ...weather("none"),
      reportId: SpaceWeatherReportId.schema.parse("20000000-0000-4000-8000-000000000002"),
      issuedAt: at("2026-09-15T01:00:00.000Z"),
    };
    unwrap(await store.store(SpaceWeatherReport.report(eventContext(1))(newer)));
    unwrap(await store.store(SpaceWeatherReport.report(eventContext(2))(older)));
    expect(unwrap(await createCurrentSpaceWeatherResolver(db).resolveCurrent())?.alertLevel).toBe("none");
    expect(unwrap(await createSpaceWeatherListResolver(db).resolveAll()).map(({ alertLevel }) => alertLevel)).toEqual(["none", "S2"]);
    const empty = createSqliteDatabase(":memory:");
    migrateDatabase(empty);
    expect(unwrap(await createCurrentSpaceWeatherResolver(empty).resolveCurrent())).toBeUndefined();
  });
});
