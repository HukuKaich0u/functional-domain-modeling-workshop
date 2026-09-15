import { describe, expect, expectTypeOf, it } from "vitest";

import { SegmentId } from "../src/domain/lockout/index.js";
import { approve, ZoneId } from "../src/domain/permit/index.js";
import type { ZoneId as ZoneIdValue } from "../src/domain/permit/index.js";
import type { SegmentId as SegmentIdValue } from "../src/domain/lockout/index.js";

describe("Step 1", () => {
  it("ZoneId を SegmentId の用途へ渡せない", () => {
    expectTypeOf<ZoneIdValue>().not.toMatchTypeOf<SegmentIdValue>(); // 要件: ZoneId を SegmentId の用途へ渡せない型にしてください。
  });
});

describe("Step 2", () => {
  it("開始承認には SegmentId が必要", () => {
    expectTypeOf<ZoneIdValue>().not.toMatchTypeOf<Parameters<typeof approve>[1]["segmentId"]>(); // 要件: 開始承認の遮断区間に ZoneId を渡せない型にしてください。
  });
});

describe("Step 3", () => {
  it("SegmentId を ZoneId の用途へ渡せない", () => {
    expectTypeOf<SegmentIdValue>().not.toMatchTypeOf<ZoneIdValue>(); // 要件: SegmentId を ZoneId の用途へ渡せない型にしてください。
  });
});

describe("回帰条件: 識別子は形式検査を通った値からしか作れない", () => {
  it("書式に合わない文字列から ZoneId と SegmentId を作れない", () => {
    expect(() => ZoneId.parse("PV-7")).toThrow();
    expect(() => SegmentId.parse("pv-07")).toThrow();
  });
});
