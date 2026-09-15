import { afterEach, describe, expect, test } from "vitest";

import { moonbaseFixture } from "../../fixtures/moonbase.js";
import {
  closeIfSupported,
  createTemporaryDatabases,
  installWorkLogFailureTrigger,
  permitUrl,
  post,
  scenarioFor,
  scenarioSlug,
} from "./harness.js";
import { observePermit } from "./sqliteObservation.js";

const databases = createTemporaryDatabases("reset-atomicity");

const resetScenarios = (
  ["Session 03", "Session 04", "Session 05", "Session 06", "Session 07", "Session 08"] as const
).map(scenarioFor);

afterEach(() => {
  databases.cleanup();
});

describe.each(resetScenarios)("$name reset", (scenario) => {
  test("preserves the previous permit and work logs when PermitRequested fails", async () => {
    const databasePath = databases.createDatabasePath(scenarioSlug(scenario.name));
    const app = scenario.createApp(databasePath);

    try {
      expect((await post(app, `${permitUrl}/approve`)).status).toBe(303);
      const before = observePermit(databasePath, moonbaseFixture.permitId);
      expect(scenario.normalizeState(before.state)).toBe("Approved");
      expect(before.workLogs.length).toBeGreaterThan(0);

      installWorkLogFailureTrigger(
        databasePath,
        "fail_permit_requested_work_log",
        "PermitRequested",
      );

      expect((await post(app, "/demo/reset")).status).toBe(500);
      expect(observePermit(databasePath, moonbaseFixture.permitId)).toEqual(before);
    } finally {
      closeIfSupported(app);
    }
  });
});
