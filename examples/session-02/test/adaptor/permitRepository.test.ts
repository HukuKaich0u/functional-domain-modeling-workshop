import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import {
  createSqliteDatabase,
  migrateDatabase,
} from "../../src/adaptor/secondary/sqlite/db.js";
import { permitsTable } from "../../src/adaptor/secondary/sqlite/schema.js";
import {
  updateStatus,
  type EvaPermit,
} from "../../src/domain/permit/permit.js";
import { createPermitRepository } from "../../src/adaptor/secondary/sqlite/permitRepository.js";

const initialPermit = {
  permitId: "EVA-0412",
  zoneId: "PV-07",
  crew: ["W-03", "W-04"],
  plannedMinutes: 180,
  requestedAt: "2026-09-15T00:00:00.000Z",
  status: "requested",
} as const satisfies EvaPermit;

const createRepository = () => {
  const database = createSqliteDatabase(":memory:");
  migrateDatabase(database);

  return { database, repository: createPermitRepository(database) };
};

describe("未改善 SQLite 作業許可 repository", () => {
  test("作業許可を更新すると作業記録 payload に累積線量を残してしまう", () => {
    const { repository } = createRepository();

    repository.reset(initialPermit);
    const updated = updateStatus(repository.find(initialPermit.permitId)!, "approved", {
      crewDose: [31_500, 44_000],
    });
    repository.save(updated);
    repository.appendWorkLog({
      eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      eventName: "eva.approved",
      occurredAt: "2026-09-15T01:00:00.000Z",
      permit: updated,
    });

    expect(repository.find(updated.permitId)).toEqual(updated);
    expect(JSON.stringify(repository.listWorkLogs())).toContain("44000");
  });

  test("壊れた作業許可 JSON を検証せず EvaPermit として返してしまう", () => {
    const { database, repository } = createRepository();
    const malformedState = { status: ["not-a-status"], missing: true };

    repository.reset(initialPermit);
    database
      .update(permitsTable)
      .set({ state: malformedState })
      .where(eq(permitsTable.permitId, initialPermit.permitId))
      .run();

    expect(repository.find(initialPermit.permitId)).toEqual(malformedState);
  });

  test("作業許可がないときだけ初期の許可と記録を追加する", () => {
    const { repository } = createRepository();

    repository.seedIfEmpty(initialPermit);
    repository.seedIfEmpty({ ...initialPermit, status: "closed" });

    expect(repository.find(initialPermit.permitId)).toEqual(initialPermit);
    expect(repository.listWorkLogs()).toHaveLength(1);
  });
});
