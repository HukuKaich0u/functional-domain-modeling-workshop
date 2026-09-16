import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { EventId } from "../../src/domain/aggregate/eventId.js";
import { SegmentId } from "../../src/domain/lockout/index.js";
import type { EvaApproved, EvaPermit, Requested } from "../../src/domain/permit/index.js";
import { PermitId, ZoneId } from "../../src/domain/permit/index.js";
import { FlareAlert } from "../../src/domain/spaceWeather/index.js";
import { RadiationExposure, WorkerId } from "../../src/domain/worker/index.js";
import type { EffectsDependencies } from "../../src/useCase/dependencies.js";
import { approveEvaWithEffects } from "../../src/useCase/approveEva.js";
import { moonbaseFixture } from "../../../fixtures/moonbase.js";

const FIXED_EVENT_ID = EventId.parse(moonbaseFixture.eventId);
const FIXED_OCCURRED_AT = moonbaseFixture.approvedAt;
const FIXED_LUNAR_DAY = moonbaseFixture.lunarDay;
const permitId = PermitId.parse(moonbaseFixture.permitId);
const crew = [
  WorkerId.parse(moonbaseFixture.crew[0]),
  WorkerId.parse(moonbaseFixture.crew[1]),
] as const;
const requested = {
  kind: "Requested",
  permitId,
  zoneId: ZoneId.parse(moonbaseFixture.zoneId),
  crew,
  plannedMinutes: moonbaseFixture.plannedMinutes,
  requestedAt: moonbaseFixture.requestedAt,
} as const satisfies Requested;
const input = {
  permitId,
  segmentId: SegmentId.parse(moonbaseFixture.segmentId),
  equipmentChecks: [
    { workerId: crew[0], oxygenMinutes: moonbaseFixture.oxygenMinutes, checkedAt: moonbaseFixture.checkedAt },
    { workerId: crew[1], oxygenMinutes: moonbaseFixture.oxygenMinutes, checkedAt: moonbaseFixture.checkedAt },
  ],
  approvedBy: "base-commander",
} as const;

describe("Step 1: 同じ clock と ID generator なら同じイベントになる", () => {
  it("固定 context から同じ eventId、occurredAt、lunarDay を返す", async () => {
    const harness = createHarness();

    await approveEvaWithEffects(harness.dependencies)(input);
    await approveEvaWithEffects(harness.dependencies)(input);

    expect(
      harness.recordedEvents.map(({ eventId, occurredAt, lunarDay }) => ({
        eventId,
        occurredAt,
        lunarDay,
      })),
    ).toEqual([
      { eventId: FIXED_EVENT_ID, occurredAt: FIXED_OCCURRED_AT, lunarDay: FIXED_LUNAR_DAY },
      { eventId: FIXED_EVENT_ID, occurredAt: FIXED_OCCURRED_AT, lunarDay: FIXED_LUNAR_DAY },
    ]);
  });

  it("夜間の判定にも同じ月面日を使う", async () => {
    const harness = createHarness({ kind: "success" }, { lunarDay: 15 });

    const result = await approveEvaWithEffects(harness.dependencies)(input);

    expect(result.isErr() && result.error).toEqual({ kind: "NightTime", lunarDay: 15 });
    expect(harness.storeCalls).toBe(0);
  });
});

describe("Step 2: 状態と作業記録は1回の保存で残る", () => {
  it("store(event) を1回だけ呼ぶ", async () => {
    const harness = createHarness();

    await approveEvaWithEffects(harness.dependencies)(input);

    expect(harness.storeCalls).toBe(1);
    expect(harness.storedStates).toHaveLength(1);
    expect(harness.recordedEvents).toHaveLength(1);
  });
});

describe("Step 3: 非同期保存後もイベントが pipeline に残る", () => {
  it("保存成功時は store の void ではなく aggregateState を返す", async () => {
    const harness = createHarness();

    const result = await approveEvaWithEffects(harness.dependencies)(input);

    expect(result.isOk() ? result.value : undefined).toMatchObject({
      kind: "Approved",
      permitId,
      approvedAt: FIXED_OCCURRED_AT,
    });
  });
});

describe("Step 4: 業務失敗とインフラ例外を別の経路で返す", () => {
  it("業務競合は Result、保存障害と破損データは reject で返す", async () => {
    const conflict = createHarness({ kind: "conflict" });
    const storeFailureCause = new Error("write failed");
    const storeFailure = createHarness({
      kind: "store-failure",
      cause: storeFailureCause,
    });
    const corruptData = createHarness({ kind: "corrupt-data" });

    const [conflictOutcome, storeFailureOutcome, corruptDataOutcome] =
      await Promise.allSettled([
        approveEvaWithEffects(conflict.dependencies)(input),
        approveEvaWithEffects(storeFailure.dependencies)(input),
        Promise.resolve().then(() =>
          approveEvaWithEffects(corruptData.dependencies)(input),
        ),
      ]);

    expect({
      conflict:
        conflictOutcome.status === "fulfilled" && conflictOutcome.value.isErr()
          ? conflictOutcome.value.error
          : conflictOutcome.status,
      storeFailure:
        storeFailureOutcome.status === "rejected"
          ? storeFailureOutcome.reason
          : storeFailureOutcome.status,
      corruptData:
        corruptDataOutcome.status === "rejected" &&
        corruptDataOutcome.reason instanceof z.ZodError,
      storedStates: [
        ...conflict.storedStates,
        ...storeFailure.storedStates,
        ...corruptData.storedStates,
      ],
      recordedEvents: [
        ...conflict.recordedEvents,
        ...storeFailure.recordedEvents,
        ...corruptData.recordedEvents,
      ],
    }).toEqual({
      conflict: { kind: "PermitConflict", permitId },
      storeFailure: storeFailureCause,
      corruptData: true,
      storedStates: [],
      recordedEvents: [],
    });
  });
});

type HarnessOutcome =
  | Readonly<{ kind: "success" }>
  | Readonly<{ kind: "conflict" }>
  | Readonly<{ kind: "store-failure"; cause: unknown }>
  | Readonly<{ kind: "corrupt-data" }>;

const createHarness = (
  outcome: HarnessOutcome = { kind: "success" },
  clockOverride: Readonly<{ lunarDay?: number }> = {},
) => {
  const storedStates: Array<EvaPermit> = [];
  const recordedEvents: Array<EvaApproved> = [];
  let storeCalls = 0;
  const dependencies: EffectsDependencies = {
    resolver: {
      resolveById: () => {
        if (outcome.kind === "corrupt-data") {
          z.literal("Requested").parse("corrupt persisted permit");
        }
        return requested;
      },
    },
    exposures: {
      resolve: (workerId) =>
        RadiationExposure.of(moonbaseFixture.crewExposureMicroSv[workerId] ?? 0),
    },
    spaceWeather: { currentAlert: () => FlareAlert.clear },
    clock: {
      now: () => FIXED_OCCURRED_AT,
      lunarDay: () => clockOverride.lunarDay ?? FIXED_LUNAR_DAY,
    },
    eventIdGenerator: { generate: () => FIXED_EVENT_ID },
    store: {
      store: (event) => {
        storeCalls += 1;
        if (outcome.kind === "conflict") {
          return errAsync({ kind: "PermitConflict", permitId });
        }
        if (outcome.kind === "store-failure") {
          return ResultAsync.fromSafePromise(Promise.reject(outcome.cause));
        }
        storedStates.push(event.aggregateState);
        recordedEvents.push(event);
        return okAsync(undefined);
      },
    },
  };

  return {
    dependencies,
    storedStates,
    recordedEvents,
    get storeCalls() {
      return storeCalls;
    },
  };
};
