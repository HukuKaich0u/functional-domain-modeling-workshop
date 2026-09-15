import { afterEach, describe, expect, test } from "vitest";

import { moonbaseFixture } from "../../fixtures/moonbase.js";
import { EventId } from "../../session-08/src/domain/aggregate/eventId.js";
import {
  closeIfSupported,
  createTemporaryDatabases,
  installWorkLogFailureTrigger,
  permitUrl,
  post,
  scenarioFor,
  scenarioSlug,
} from "./harness.js";
import type { SnapshotEffects, SnapshotScenario } from "./snapshotScenario.js";
import { observePermit } from "./sqliteObservation.js";

const databases = createTemporaryDatabases("approve-eva-effects");

const missingPermitId = "EVA-9999";
const eventId = EventId.parse("77777777-7777-4777-8777-777777777777");
const occurredAt = "2026-09-16T02:00:00.000Z";

const createEffectfulApp = (
  scenario: SnapshotScenario,
  databasePath: string,
  effects: SnapshotEffects,
) => {
  if (scenario.createAppWithEffects === undefined) {
    throw new Error(`Snapshot scenario does not support effect injection: ${scenario.name}`);
  }

  return scenario.createAppWithEffects(databasePath, effects);
};

const captureWorkLogFailure = async (scenario: SnapshotScenario) => {
  const databasePath = databases.createDatabasePath(scenarioSlug(scenario.name));
  const seeded = scenario.createApp(databasePath);
  closeIfSupported(seeded);
  installWorkLogFailureTrigger(databasePath, "fail_eva_approved_work_log", "EvaApproved");

  const app = scenario.createApp(databasePath);
  let workLogCountBeforeApprove = 0;
  let httpStatus = 0;
  try {
    workLogCountBeforeApprove = observePermit(
      databasePath,
      moonbaseFixture.permitId,
    ).workLogs.length;
    httpStatus = (await post(app, `${permitUrl}/approve`)).status;
  } finally {
    closeIfSupported(app);
  }

  const observation = observePermit(databasePath, moonbaseFixture.permitId);
  return {
    appendedEvents: observation.workLogs.slice(workLogCountBeforeApprove).length,
    permitKind: scenario.normalizeState(observation.state),
    httpStatus,
  };
};

afterEach(() => {
  databases.cleanup();
});

describe.each(["Session 07", "Session 08"] as const)("%s", (name) => {
  test("keeps missing and invalid-state notices distinct from infrastructure failures", async () => {
    const scenario = scenarioFor(name);
    const databasePath = databases.createDatabasePath(`${scenarioSlug(name)}-business-errors`);

    const missingApp = scenario.createApp(databasePath);
    const beforeMissing = observePermit(databasePath, moonbaseFixture.permitId);
    let missingResponse!: Response;
    try {
      missingResponse = await post(missingApp, `/permits/${missingPermitId}/approve`);
    } finally {
      closeIfSupported(missingApp);
    }
    const afterMissing = observePermit(databasePath, moonbaseFixture.permitId);

    const invalidStateApp = scenario.createApp(databasePath);
    let beforeInvalidState!: ReturnType<typeof observePermit>;
    let invalidStateResponse!: Response;
    try {
      expect((await post(invalidStateApp, `${permitUrl}/approve`)).status).toBe(303);
      beforeInvalidState = observePermit(databasePath, moonbaseFixture.permitId);
      expect(scenario.normalizeState(beforeInvalidState.state)).toBe("Approved");
      invalidStateResponse = await post(invalidStateApp, `${permitUrl}/approve`);
    } finally {
      closeIfSupported(invalidStateApp);
    }
    const afterInvalidState = observePermit(databasePath, moonbaseFixture.permitId);

    expect(missingResponse.status).toBe(303);
    expect(missingResponse.headers.get("location")).toBe("/?notice=not-found");
    expect(afterMissing).toEqual(beforeMissing);
    expect(invalidStateResponse.status).toBe(303);
    expect(invalidStateResponse.headers.get("location")).toBe("/?notice=invalid-state");
    expect(afterInvalidState).toEqual(beforeInvalidState);
  });
});

test("Session 08 persists its injected clock and event ID in the approval work log", async () => {
  const scenario = scenarioFor("Session 08");
  const databasePath = databases.createDatabasePath("session-08-effects");
  const app = createEffectfulApp(scenario, databasePath, {
    clock: { now: () => occurredAt, lunarDay: () => moonbaseFixture.lunarDay },
    eventIdGenerator: { generate: () => eventId },
  });

  try {
    expect((await post(app, `${permitUrl}/approve`)).status).toBe(303);
  } finally {
    closeIfSupported(app);
  }

  const observation = observePermit(databasePath, moonbaseFixture.permitId);
  expect(scenario.normalizeState(observation.state)).toBe("Approved");
  expect(observation.workLogs.at(-1)).toMatchObject({
    permitId: moonbaseFixture.permitId,
    eventId,
    eventName: "EvaApproved",
    occurredAt,
  });
});

test("Session 07 leaves the state update while Session 08 rolls it back after the same work log failure", async () => {
  const session07 = await captureWorkLogFailure(scenarioFor("Session 07"));
  const session08 = await captureWorkLogFailure(scenarioFor("Session 08"));

  expect(session07).toEqual({
    appendedEvents: 0,
    permitKind: "Approved",
    httpStatus: 500,
  });
  expect(session08).toEqual({
    appendedEvents: 0,
    permitKind: "Requested",
    httpStatus: 500,
  });
});
