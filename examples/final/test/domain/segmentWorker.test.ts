import { describe, expect, test } from "vitest";

import { OXYGEN_RESERVE_MINUTES, hasEnoughOxygen } from "../../src/domain/equipmentCheck/index.js";
import { Segment } from "../../src/domain/segment/index.js";
import { toFlareAlert } from "../../src/domain/spaceWeather/index.js";
import { Worker, RadiationExposure } from "../../src/domain/worker/index.js";
import {
  energizedSegment,
  equipmentCheck,
  eventContext,
  ids,
  lockedOutSegment,
  weather,
  worker,
} from "../support/fixtures.js";

describe("Segment の遮断札", () => {
  test("通電中の区間にだけ札を掛け、掛けた者と時刻を残す（規程第3条）", () => {
    const context = eventContext(1, { actorUserId: ids.electrician });
    const event = Segment.tagLockout(context)(energizedSegment, ids.permit);
    expect(event.kind).toBe("LockoutTagged");
    expect(event.aggregateState.lockout).toEqual({
      kind: "LockedOut",
      permitId: ids.permit,
      taggedBy: ids.electrician,
      taggedAt: context.occurredAt,
    });
    expect(event.eventPayload).toEqual({ segmentId: ids.segment, permitId: ids.permit });
    // @ts-expect-error 遮断中の区間には札を掛けられない
    Segment.tagLockout(context)(lockedOutSegment, ids.permit);
  });

  test("札を外すと通電中に戻り、外した札の作業許可番号を記録する", () => {
    const event = Segment.removeLockout(eventContext(2))(lockedOutSegment);
    expect(event.kind).toBe("LockoutRemoved");
    expect(event.aggregateState.lockout).toEqual({ kind: "Energized" });
    expect(event.eventPayload).toEqual({ segmentId: ids.segment, permitId: ids.permit });
    // @ts-expect-error 通電中の区間から札は外せない
    Segment.removeLockout(eventContext(3))(energizedSegment);
  });

  test("遮断状態の判定は型を絞る", () => {
    expect(Segment.isLockedOut(lockedOutSegment)).toBe(true);
    expect(Segment.isEnergized(energizedSegment)).toBe(true);
    expect(Segment.isLockedOut(energizedSegment)).toBe(false);
  });

  test("区間の登録と名前の更新はラベルだけを変える", () => {
    const registered = Segment.register(eventContext(4))(energizedSegment);
    expect(registered.eventPayload).toEqual({ segmentId: ids.segment });
    const updated = Segment.update(eventContext(5))(lockedOutSegment, {
      label: energizedSegment.label,
    });
    expect(updated.aggregateState.lockout.kind).toBe("LockedOut");
  });
});

describe("Worker と装備点検", () => {
  test("隊員の更新は被ばく量を Sensitive のまま状態に入れる", () => {
    const event = Worker.update(eventContext(6))(worker(ids.workerA), {
      qualification: "Electrician",
      radiationExposureMicroSv: RadiationExposure.schema.parse(20_000),
    });
    expect(event.aggregateState.qualification).toBe("Electrician");
    expect(event.aggregateState.radiationExposureMicroSv.unwrap()).toBe(20_000);
    expect(JSON.stringify(event.aggregateState)).not.toContain("20000");
    expect(event.eventPayload).toEqual({ workerId: ids.workerA });
  });

  test("酸素残時間は予定作業時間に予備60分を足した分が必要（規程第2条）", () => {
    expect(OXYGEN_RESERVE_MINUTES).toBe(60);
    expect(hasEnoughOxygen(equipmentCheck(ids.checkA, ids.workerA, 180), 120)).toBe(true);
    expect(hasEnoughOxygen(equipmentCheck(ids.checkA, ids.workerA, 179), 120)).toBe(false);
  });
});

describe("宇宙天気", () => {
  test("none 以外の警報レベルはすべてフレア警報中として扱う（規程第5条）", () => {
    expect(toFlareAlert(weather("none"))).toEqual({ kind: "Clear" });
    expect(toFlareAlert(weather("S1"))).toMatchObject({ kind: "Active", level: "S1" });
    expect(toFlareAlert(weather("S5"))).toMatchObject({ kind: "Active", level: "S5" });
  });
});
