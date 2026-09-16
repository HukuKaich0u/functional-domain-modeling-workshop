import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { EventId } from "../src/domain/aggregate/eventId.js";
import { SegmentId } from "../src/domain/lockout/index.js";
import type { EvaApproved, EvaPermit, Requested } from "../src/domain/permit/index.js";
import { PermitId, ZoneId } from "../src/domain/permit/index.js";
import { FlareAlert } from "../src/domain/spaceWeather/index.js";
import { RadiationExposure, WorkerId } from "../src/domain/worker/index.js";
import { approveEvaWithEffects as approveEva } from "../src/useCase/approveEva.js";
import { moonbaseFixture } from "../../fixtures/moonbase.js";

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
const diagnosticCause = {
  workerId: "W-04",
  radiationExposureMicroSv: 49_900,
  message: "S7 storage unavailable while approving EVA-0412",
  stack: "S7DiagnosticError: storage unavailable\n    at EvaApprovedStore.store",
  error: new Error("S7 storage unavailable while approving EVA-0412"),
} as const;

describe("Step 1: 同じ clock と ID generator なら同じイベントになる", () => {
  it("固定 context から同じ eventId、occurredAt、lunarDay を返す", async () => {
    const harness = createHarness();

    await approveEva(harness.dependencies)(input);
    await approveEva(harness.dependencies)(input);

    expect(
      harness.recordedEvents.map(({ eventId, occurredAt, lunarDay }) => ({
        eventId,
        occurredAt,
        lunarDay,
      })),
    ).toEqual([
      { eventId: FIXED_EVENT_ID, occurredAt: FIXED_OCCURRED_AT, lunarDay: FIXED_LUNAR_DAY },
      { eventId: FIXED_EVENT_ID, occurredAt: FIXED_OCCURRED_AT, lunarDay: FIXED_LUNAR_DAY },
    ]); // 要件: 時刻と記録IDを Clock と EventIdGenerator から一度だけ受け取ってください。
  });
});

describe("Step 2: 状態と作業記録は1回の保存で残る", () => {
  it("store(event) を1回だけ呼ぶ", async () => {
    const harness = createHarness();

    await approveEva(harness.dependencies)(input);

    expect(harness.storeCalls).toBe(1); // 要件: 状態と作業記録を1回の store(event) で保存してください。
    expect(harness.stateWrites).toBe(0);
    expect(harness.eventWrites).toBe(0);
  });
});

describe("Step 3: 非同期保存後もイベントが pipeline に残る", () => {
  it("保存成功時は store の void ではなく aggregateState を返す", async () => {
    const harness = createHarness();

    const result = await approveEva(harness.dependencies)(input);

    expect(result.isOk() ? result.value : undefined).toMatchObject({
      kind: "Approved",
      permitId,
    }); // 要件: 保存後も承認済の作業許可を結果として返してください。
  });
});

describe("Step 4: 業務失敗とインフラ例外を別の経路で返す", () => {
  it("業務競合は Result、保存障害と破損データは reject で返す", async () => {
    const conflict = createHarness({ kind: "conflict" });
    const storeFailure = createHarness({
      kind: "store-failure",
      cause: diagnosticCause,
    });
    const corruptData = createHarness({ kind: "corrupt-data" });

    const [conflictOutcome, storeFailureOutcome, corruptDataOutcome] =
      await Promise.allSettled([
        approveEva(conflict.dependencies)(input),
        approveEva(storeFailure.dependencies)(input),
        approveEva(corruptData.dependencies)(input),
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
      storeFailure: diagnosticCause,
      corruptData: true,
      storedStates: [],
      recordedEvents: [],
    }); // 要件: 許可の競合は Result で返し、保存障害と破損データは例外のまま外へ伝えてください。
  });
});

type HarnessOutcome =
  | Readonly<{ kind: "success" }>
  | Readonly<{ kind: "conflict" }>
  | Readonly<{ kind: "store-failure"; cause: unknown }>
  | Readonly<{ kind: "corrupt-data" }>;

const createHarness = (outcome: HarnessOutcome = { kind: "success" }) => {
  const storedStates: Array<EvaPermit> = [];
  const recordedEvents: Array<EvaApproved> = [];
  let storeCalls = 0;
  let stateWrites = 0;
  let eventWrites = 0;

  return {
    dependencies: {
      resolver: {
        resolveById: () => {
          if (outcome.kind === "corrupt-data") {
            z.literal("Requested").parse("corrupt persisted permit");
          }
          return requested;
        },
      },
      exposures: {
        resolve: (workerId: WorkerId) =>
          RadiationExposure.of(moonbaseFixture.crewExposureMicroSv[workerId] ?? 0),
      },
      spaceWeather: { currentAlert: () => FlareAlert.clear },
      clock: { now: () => FIXED_OCCURRED_AT, lunarDay: () => FIXED_LUNAR_DAY },
      eventIdGenerator: { generate: () => FIXED_EVENT_ID },
      store: {
        store: (event: EvaApproved) => {
          storeCalls += 1;
          if (outcome.kind === "conflict") {
            return errAsync({ kind: "PermitConflict", permitId } as const);
          }
          if (outcome.kind === "store-failure") {
            return ResultAsync.fromSafePromise(Promise.reject(outcome.cause));
          }
          storedStates.push(event.aggregateState);
          recordedEvents.push(event);
          return okAsync(undefined);
        },
      },
      stateStore: {
        save: async (permit: EvaPermit) => {
          stateWrites += 1;
          storedStates.push(permit);
        },
      },
      workLog: {
        append: async (event: EvaApproved) => {
          eventWrites += 1;
          recordedEvents.push(event);
        },
      },
    },
    storedStates,
    recordedEvents,
    get storeCalls() {
      return storeCalls;
    },
    get stateWrites() {
      return stateWrites;
    },
    get eventWrites() {
      return eventWrites;
    },
  };
};
