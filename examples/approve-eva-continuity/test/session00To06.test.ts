import { afterEach, describe, expect, test } from "vitest";

import { moonbaseFixture } from "../../fixtures/moonbase.js";
import {
  approveBody,
  closeIfSupported,
  createTemporaryDatabases,
  normalizeApprovedEventName,
  permitUrl,
  post,
  scenarioFor,
  scenarioSlug,
} from "./harness.js";
import { snapshotScenarios } from "./snapshotScenario.js";
import { observePermit } from "./sqliteObservation.js";

const databases = createTemporaryDatabases("approve-eva");

afterEach(() => {
  databases.cleanup();
});

describe.each(snapshotScenarios)("$name", (scenario) => {
  test("persists the common approval outcome for a requested permit", async () => {
    const databasePath = databases.createDatabasePath(scenarioSlug(scenario.name));
    const app = scenario.createApp(databasePath);
    let workLogCountBeforeApprove = 0;

    try {
      workLogCountBeforeApprove = observePermit(
        databasePath,
        moonbaseFixture.permitId,
      ).workLogs.length;
      expect((await post(app, `${permitUrl}/approve`)).status).toBe(303);
    } finally {
      closeIfSupported(app);
    }

    const observation = observePermit(databasePath, moonbaseFixture.permitId);
    const approvedWorkLogs = observation.workLogs.slice(workLogCountBeforeApprove);
    expect(scenario.normalizeState(observation.state)).toBe("Approved");
    expect(approvedWorkLogs).toHaveLength(1);
    expect(approvedWorkLogs.at(-1)).toMatchObject({
      permitId: moonbaseFixture.permitId,
    });
    expect(
      normalizeApprovedEventName(approvedWorkLogs.at(-1)?.eventName ?? ""),
    ).toBe("EvaApproved");
  });
});

test("Session 00 accepts an approval after close and persists the reopened state", async () => {
  const scenario = scenarioFor("Session 00");
  const databasePath = databases.createDatabasePath("session-00-closed-reapprove");
  const app = scenario.createApp(databasePath);
  let workLogCountBeforeReapprove = 0;

  try {
    expect((await post(app, `${permitUrl}/approve`)).status).toBe(303);
    expect((await post(app, `${permitUrl}/egress`)).status).toBe(303);
    expect((await post(app, `${permitUrl}/return`)).status).toBe(303);
    expect((await post(app, `${permitUrl}/close`)).status).toBe(303);
    const beforeReapprove = observePermit(databasePath, moonbaseFixture.permitId);
    expect(scenario.normalizeState(beforeReapprove.state)).toBe("Closed");
    workLogCountBeforeReapprove = beforeReapprove.workLogs.length;
    expect((await post(app, `${permitUrl}/approve`)).status).toBe(303);
  } finally {
    closeIfSupported(app);
  }

  const observation = observePermit(databasePath, moonbaseFixture.permitId);
  expect(scenario.normalizeState(observation.state)).toBe("Approved");
  expect(observation.workLogs).toHaveLength(workLogCountBeforeReapprove + 1);
  expect(observation.workLogs.at(-1)).toMatchObject({
    permitId: moonbaseFixture.permitId,
  });
  expect(
    normalizeApprovedEventName(observation.workLogs.at(-1)?.eventName ?? ""),
  ).toBe("EvaApproved");
});

test("Session 04 rejects a second approval from Approved without changing SQLite", async () => {
  const scenario = scenarioFor("Session 04");
  const databasePath = databases.createDatabasePath("session-04-invalid-state");
  const app = scenario.createApp(databasePath);

  try {
    expect((await post(app, `${permitUrl}/approve`)).status).toBe(303);
    const before = observePermit(databasePath, moonbaseFixture.permitId);
    expect(scenario.normalizeState(before.state)).toBe("Approved");

    expect((await post(app, `${permitUrl}/approve`)).status).toBe(500);

    const after = observePermit(databasePath, moonbaseFixture.permitId);
    expect(after).toEqual(before);
  } finally {
    closeIfSupported(app);
  }
});

test("Session 06 rejects invalid permit and segment identifiers without changing SQLite", async () => {
  const scenario = scenarioFor("Session 06");
  const databasePath = databases.createDatabasePath("session-06-invalid-identifiers");
  const seeded = scenario.createApp(databasePath);
  closeIfSupported(seeded);

  const invalidPermitApp = scenario.createApp(databasePath);
  const beforeInvalidPermit = observePermit(databasePath, moonbaseFixture.permitId);
  try {
    expect((await post(invalidPermitApp, "/permits/not-a-permit-id/approve")).status).toBe(500);
  } finally {
    closeIfSupported(invalidPermitApp);
  }
  expect(observePermit(databasePath, moonbaseFixture.permitId)).toEqual(beforeInvalidPermit);

  const invalidSegmentApp = scenario.createApp(databasePath);
  const beforeInvalidSegment = observePermit(databasePath, moonbaseFixture.permitId);
  try {
    expect(
      (await post(invalidSegmentApp, `${permitUrl}/approve`, {
        ...approveBody,
        segmentId: "not-a-segment-id",
      })).status,
    ).toBe(500);
  } finally {
    closeIfSupported(invalidSegmentApp);
  }
  expect(observePermit(databasePath, moonbaseFixture.permitId)).toEqual(beforeInvalidSegment);
});

test("Session 06 stores an approval work log payload without crew dose", async () => {
  const scenario = scenarioFor("Session 06");
  const databasePath = databases.createDatabasePath("session-06-dose");
  const app = scenario.createApp(databasePath);

  try {
    expect((await post(app, `${permitUrl}/approve`)).status).toBe(303);
  } finally {
    closeIfSupported(app);
  }

  const observation = observePermit(databasePath, moonbaseFixture.permitId);
  const workLog = observation.workLogs.at(-1);
  const serializedPayload = JSON.stringify(workLog?.payload);

  expect(scenario.normalizeState(observation.state)).toBe("Approved");
  expect(workLog).toMatchObject({
    permitId: moonbaseFixture.permitId,
    eventName: "EvaApproved",
  });
  if (serializedPayload === undefined) throw new Error("Missing approval work log payload");
  for (const workerId of moonbaseFixture.crew) {
    expect(serializedPayload).not.toContain(
      String(moonbaseFixture.crewDoseMicroSv[workerId]),
    );
  }
});
