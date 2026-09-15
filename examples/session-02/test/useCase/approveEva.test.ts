import { describe, expect, test } from "vitest";

import {
  createSqliteDatabase,
  migrateDatabase,
} from "../../src/adaptor/secondary/sqlite/db.js";
import { createPermitRepository } from "../../src/adaptor/secondary/sqlite/permitRepository.js";
import type { EvaPermit } from "../../src/domain/permit/permit.js";
import { approveEva } from "../../src/useCase/approveEva.js";

const initialPermit = {
  permitId: "EVA-0412",
  zoneId: "PV-07",
  crew: ["W-03", "W-04"],
  plannedMinutes: 180,
  requestedAt: "2026-09-15T00:00:00.000Z",
  status: "requested",
} as const satisfies EvaPermit;

const input = {
  permitId: initialPermit.permitId,
  segmentId: "PV-07",
  crewDose: [31_500, 44_000],
};

const createRepository = () => {
  const database = createSqliteDatabase(":memory:");
  migrateDatabase(database);

  return createPermitRepository(database);
};

describe("未改善の開始承認 use case", () => {
  test("開始承認ごとに異なる記録 ID を直接生成する", () => {
    const repository = createRepository();
    repository.reset(initialPermit);

    const first = approveEva(repository)(input);
    const second = approveEva(repository)(input);
    const eventIds = repository
      .listWorkLogs()
      .slice(-2)
      .map(({ eventId }) => eventId);

    expect(eventIds[0]).not.toBe(eventIds[1]);
    expect(first.status).toBe("approved");
    expect(second.status).toBe("approved");
  });

  test("存在しない作業許可では許可番号を含む Error を throw する", () => {
    const repository = createRepository();
    const missingPermitId = "EVA-9999";

    expect(() =>
      approveEva(repository)({ ...input, permitId: missingPermitId }),
    ).toThrow(new Error(`Permit not found: ${missingPermitId}`));
  });
});
