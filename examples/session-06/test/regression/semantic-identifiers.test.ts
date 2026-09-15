import { describe, expect, it } from "vitest";

import { SegmentId } from "../../src/domain/lockout/index.js";
import { ZoneId } from "../../src/domain/permit/index.js";
import { compileTypeFixture } from "./compileTypeFixture.js";

describe("S4 regression: 開始承認の識別子を取り違えない", () => {
  it("ZoneIdとSegmentIdを相互に代入できない", () => {
    expect(compileTypeFixture("s4-zone-id-is-not-segment-id.ts")).toEqual([]);
  });

  it("作業許可の状態とapproveが用途別の識別子を要求する", () => {
    expect(compileTypeFixture("s4-approve-requires-typed-ids.ts")).toEqual([]);
  });

  it("書式に合わない文字列からZoneIdとSegmentIdを作れない", () => {
    expect(() => ZoneId.parse("PV-7")).toThrow();
    expect(() => SegmentId.parse("pv-07")).toThrow();
  });
});
