import { describe, expect, it } from "vitest";

import { createInMemoryEvaApprovedStore } from "../src/adaptor/inMemoryEvaApprovedStore.js";
import { EventId } from "../src/domain/aggregate/eventId.js";
import { SegmentId } from "../src/domain/lockout/index.js";
import type { Requested } from "../src/domain/permit/index.js";
import { EvaPermit, PermitId, ZoneId } from "../src/domain/permit/index.js";
import { FlareAlert } from "../src/domain/spaceWeather/index.js";
import { RadiationExposure, WorkerId } from "../src/domain/worker/index.js";
import { approveEvaWithEffects } from "../src/useCase/approveEva.js";
import { moonbaseFixture } from "../../fixtures/moonbase.js";

const permitId = PermitId.parse(moonbaseFixture.permitId);
const crew = [
  WorkerId.parse(moonbaseFixture.crew[0]),
  WorkerId.parse(moonbaseFixture.crew[1]),
] as const;
const eventId = EventId.parse(moonbaseFixture.eventId);
const conflictingEventId = EventId.parse("66666666-6666-4666-8666-666666666666");
const requested = {
  kind: "Requested",
  permitId,
  zoneId: ZoneId.parse(moonbaseFixture.zoneId),
  crew,
  plannedMinutes: moonbaseFixture.plannedMinutes,
  requestedAt: moonbaseFixture.requestedAt,
} as const satisfies Requested;
const approveInput = {
  segmentId: SegmentId.parse(moonbaseFixture.segmentId),
  equipmentChecks: [
    { workerId: crew[0], oxygenMinutes: moonbaseFixture.oxygenMinutes, checkedAt: moonbaseFixture.checkedAt },
    { workerId: crew[1], oxygenMinutes: moonbaseFixture.oxygenMinutes, checkedAt: moonbaseFixture.checkedAt },
  ],
  approvedBy: "base-commander",
} as const;
const input = { permitId, ...approveInput } as const;
const context = {
  eventId,
  occurredAt: moonbaseFixture.approvedAt,
  lunarDay: moonbaseFixture.lunarDay,
} as const;
const environment = {
  exposures: {
    resolve: (workerId: WorkerId) =>
      RadiationExposure.of(moonbaseFixture.crewExposureMicroSv[workerId] ?? 0),
  },
  spaceWeather: { currentAlert: () => FlareAlert.clear },
  clock: {
    now: () => moonbaseFixture.approvedAt,
    lunarDay: () => moonbaseFixture.lunarDay,
  },
  eventIdGenerator: { generate: () => eventId },
} as const;

describe("in-memory EvaApproved store", () => {
  it("1回の store で aggregate state と event を反映する", async () => {
    const adapter = createInMemoryEvaApprovedStore([requested]);
    const result = await approveEvaWithEffects({
      resolver: adapter.resolver,
      store: adapter.store,
      ...environment,
    })(input);

    expect(result.isOk()).toBe(true);
    expect(adapter.storeCalls()).toBe(1);
    expect(adapter.permits()[0]?.kind).toBe("Approved");
    expect(adapter.events()).toHaveLength(1);
  });

  it("保存失敗を Result に変換せず同じ例外で reject する", async () => {
    const diagnosticCause = new Error("storage unavailable");
    const adapter = createInMemoryEvaApprovedStore([requested], {
      beforeCommit: () => Promise.reject(diagnosticCause),
    });
    const event = EvaPermit.approve(context)(requested, approveInput);

    await expect(adapter.store.store(event)).rejects.toBe(diagnosticCause);
    expect(adapter.permits()).toEqual([requested]);
    expect(adapter.events()).toEqual([]);
  });

  it("承認済みの許可への2件目を業務競合として返し作業記録を追加しない", async () => {
    const adapter = createInMemoryEvaApprovedStore([requested]);
    const firstEvent = EvaPermit.approve(context)(requested, approveInput);
    const conflictingEvent = EvaPermit.approve({
      ...context,
      eventId: conflictingEventId,
      occurredAt: moonbaseFixture.egressAt,
    })(requested, approveInput);

    const firstResult = await adapter.store.store(firstEvent);
    const conflictResult = await adapter.store.store(conflictingEvent);

    expect(firstResult.isOk()).toBe(true);
    expect(conflictResult._unsafeUnwrapErr()).toEqual({
      kind: "PermitConflict",
      permitId,
    });
    expect(adapter.permits()).toEqual([firstEvent.aggregateState]);
    expect(adapter.events()).toEqual([firstEvent]);
  });

  it("use case も保存例外を捕捉せず、commit 前の値を保つ", async () => {
    const privateDetails = {
      workerId: "W-04",
      radiationExposureMicroSv: 49_900,
      message: "S7 storage unavailable while approving EVA-0412",
      stack: "S7DiagnosticError: storage unavailable\n    at EvaApprovedStore.store",
      error: new Error("S7 storage unavailable while approving EVA-0412"),
    } as const;
    const adapter = createInMemoryEvaApprovedStore([requested], {
      beforeCommit: () => Promise.reject(privateDetails),
    });
    await expect(
      approveEvaWithEffects({
        resolver: adapter.resolver,
        store: adapter.store,
        ...environment,
      })(input),
    ).rejects.toBe(privateDetails);
    expect(adapter.permits()).toEqual([requested]);
    expect(adapter.events()).toEqual([]);
  });
});
