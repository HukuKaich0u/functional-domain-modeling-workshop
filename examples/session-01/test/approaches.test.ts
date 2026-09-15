import { describe, expect, it } from "vitest";

import { approaches } from "../src/approaches/index.js";
import { sampleRequest, violatedConditions } from "../src/approval/request.js";
import {
  multipleStructuralReasons,
  multipleViolationReasons,
  multipleViolations,
  singleViolations,
} from "../src/approval/variants.js";

describe("10通りの書き方", () => {
  it("企画方針の一覧と同じ順に10通りそろっている", () => {
    expect(approaches.map(({ id }) => id)).toEqual([
      "procedural",
      "object-oriented",
      "functional",
      "type-driven",
      "data-oriented",
      "rule-based",
      "event-driven",
      "actor-model",
      "reactive",
      "logic-programming",
    ]);
    expect(approaches.filter(({ tier }) => tier === "主題").map(({ id }) => id)).toEqual([
      "functional",
      "type-driven",
    ]);
  });

  it("参照実装は7条件をそれぞれ1つの理由に写す", () => {
    expect(violatedConditions(sampleRequest)).toEqual([]);
    for (const [reason, request] of singleViolations) {
      expect(violatedConditions(request)).toEqual([reason]);
    }
    expect(violatedConditions(multipleViolations)).toEqual(multipleViolationReasons);
  });
});

describe.each(approaches)("$name", (approach) => {
  it("7条件をすべて満たす申請を承認する", () => {
    expect(approach.decide(sampleRequest)).toEqual({ kind: "Approved" });
  });

  it.each(singleViolations)("%s だけが破れた申請を、その理由で却下する", (reason, request) => {
    expect(approach.decide(request)).toEqual({ kind: "Rejected", reasons: [reason] });
  });

  it(`4条件が同時に破れた申請を、宣言どおりの範囲（${approach.reporting}）で報告する`, () => {
    const verdict = approach.decide(multipleViolations);

    expect(verdict.kind).toBe("Rejected");
    if (verdict.kind !== "Rejected") return;
    switch (approach.reporting) {
      case "all":
        expect(verdict.reasons).toEqual(multipleViolationReasons);
        return;
      case "first":
        expect(verdict.reasons).toHaveLength(1);
        expect(multipleViolationReasons).toContain(verdict.reasons[0]);
        return;
      case "structural-first":
        expect(verdict.reasons).toEqual(multipleStructuralReasons);
        return;
    }
  });

  it("入力を変更しない", () => {
    const snapshot = JSON.stringify(multipleViolations);

    approach.decide(multipleViolations);

    expect(JSON.stringify(multipleViolations)).toBe(snapshot);
  });
});
