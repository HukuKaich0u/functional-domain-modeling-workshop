import { inspect } from "node:util";

import { describe, expect, test } from "vitest";

import { LunarDay, LAST_DAYLIGHT_LUNAR_DAY } from "../../src/domain/aggregate/lunarDay.js";
import { Timestamp } from "../../src/domain/aggregate/timestamp.js";
import { Sensitive } from "../../src/domain/shared/sensitive.js";
import { RadiationExposure, isExposureWithinLimit, expectedExposureIncreaseMicroSv, EXPOSURE_LIMIT_MICRO_SV } from "../../src/domain/worker/index.js";
import { PermitId, ZoneId } from "../../src/domain/permit/index.js";
import { SegmentId } from "../../src/domain/segment/index.js";

describe("LunarDay", () => {
  test("第1日から第29日だけを受け付ける", () => {
    expect(LunarDay.parse(1).isOk()).toBe(true);
    expect(LunarDay.parse(29).isOk()).toBe(true);
    expect(LunarDay.parse(0).isErr()).toBe(true);
    expect(LunarDay.parse(30).isErr()).toBe(true);
    expect(LunarDay.parse(7.5).isErr()).toBe(true);
  });

  test("第14日までが昼、第15日以降が夜（規程第10条）", () => {
    expect(LunarDay.isDaytime(LunarDay.schema.parse(LAST_DAYLIGHT_LUNAR_DAY))).toBe(true);
    expect(LunarDay.isDaytime(LunarDay.schema.parse(LAST_DAYLIGHT_LUNAR_DAY + 1))).toBe(false);
  });
});

describe("Timestamp", () => {
  test("ISO 8601 の文字列だけを受け付ける", () => {
    expect(Timestamp.parse("2026-09-15T00:00:00.000Z").isOk()).toBe(true);
    expect(Timestamp.parse("2026/09/15 09:00").isErr()).toBe(true);
  });
});

describe("Sensitive", () => {
  test("JSON、文字列化、inspect のどれでも値を出さない", () => {
    const exposure = RadiationExposure.schema.parse(12_345);
    expect(JSON.stringify({ exposure })).toBe('{"exposure":"[REDACTED]"}');
    expect(String(exposure)).toBe("[REDACTED]");
    expect(inspect(exposure)).toBe("[REDACTED]");
    expect(`${Sensitive.of("secret")}`).toBe("[REDACTED]");
    expect(exposure.unwrap()).toBe(12_345);
  });
});

describe("RadiationExposure", () => {
  test("今回の作業で増える被ばく量を作業時間から切り上げで求める", () => {
    expect(expectedExposureIncreaseMicroSv(60)).toBe(60);
    expect(expectedExposureIncreaseMicroSv(120)).toBe(120);
    expect(expectedExposureIncreaseMicroSv(1)).toBe(1);
  });

  test("作業後の被ばく量が安全上限以内のときだけ承認できる（規程第8条）", () => {
    expect(isExposureWithinLimit(RadiationExposure.schema.parse(EXPOSURE_LIMIT_MICRO_SV - 120), 120)).toBe(true);
    expect(isExposureWithinLimit(RadiationExposure.schema.parse(EXPOSURE_LIMIT_MICRO_SV - 119), 120)).toBe(false);
  });
});

describe("識別子", () => {
  test("作業許可番号、作業区画、系統区間、隊員番号は業務の書式を持つ", () => {
    expect(PermitId.parse("EVA-0412").isOk()).toBe(true);
    expect(PermitId.parse("0412").isErr()).toBe(true);
    expect(ZoneId.parse("PV-07").isOk()).toBe(true);
    expect(SegmentId.parse("PV-07").isOk()).toBe(true);
    expect(ZoneId.parse("PV-7").isErr()).toBe(true);
  });

  test("作業区画と系統区間は同じ書式でも型で区別される", () => {
    const zoneId = ZoneId.schema.parse("PV-07");
    const acceptSegmentId = (segmentId: SegmentId): SegmentId => segmentId;
    // @ts-expect-error ZoneId は SegmentId として受け取れない（事故報告 第3号）
    acceptSegmentId(zoneId);
    expect(acceptSegmentId(SegmentId.schema.parse("PV-07"))).toBe("PV-07");
  });
});
