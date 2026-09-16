import { inspect } from "node:util";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  SpaceWeatherReport,
  toFlareAlert,
} from "../../src/boundary/spaceWeatherReport.js";
import { RadiationExposure } from "../../src/domain/worker/index.js";
import { compileTypeFixture } from "./compileTypeFixture.js";
import { moonbaseFixture } from "../../../fixtures/moonbase.js";

describe("S5 regression: 外部境界と機微情報", () => {
  it("形の違う宇宙天気 JSON はドメイン型にならない", () => {
    expect(
      SpaceWeatherReport.parse({ issuedAt: moonbaseFixture.requestedAt }).isErr(),
    ).toBe(true);
    expect(
      SpaceWeatherReport.parse({
        issuedAt: moonbaseFixture.requestedAt,
        alertLevel: "X9",
        stations: ["ground-control"],
      }).isErr(),
    ).toBe(true);
  });

  it("検証済みの報告からフレア警報を導ける", () => {
    const report = SpaceWeatherReport.parse({
      issuedAt: moonbaseFixture.requestedAt,
      alertLevel: "S2",
      stations: ["ground-control"],
    })._unsafeUnwrap();
    expectTypeOf(report).toMatchTypeOf<SpaceWeatherReport>();
    expect(toFlareAlert(report)).toEqual({
      kind: "Active",
      level: "S2",
      issuedAt: moonbaseFixture.requestedAt,
    });
  });

  it("被ばく量はログへ出ない", () => {
    const exposure = RadiationExposure.of(44_000);
    expect(JSON.stringify({ exposure })).not.toContain("44000");
    expect(inspect(exposure)).not.toContain("44000");
    expect(String(exposure)).toBe("[REDACTED]");
    expect(exposure.unwrap()).toBe(44_000);
  });

  it("境界値と配列は読み取り専用", () => {
    expect(compileTypeFixture("s5-space-weather-report-readonly.ts")).toEqual([]);
  });
});
