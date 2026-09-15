import { describe, expect, expectTypeOf, it } from "vitest";

import { moonbaseFixture } from "../../fixtures/moonbase.js";
import {
  ApproveEvaInput,
  type ApproveEvaInput as ApproveEvaInputValue,
} from "../src/boundary/approveEvaInput.js";

const equipmentChecks = moonbaseFixture.crew.map((workerId) => ({
  workerId,
  oxygenMinutes: moonbaseFixture.oxygenMinutes,
  checkedAt: moonbaseFixture.checkedAt,
}));

describe("Step 1: 端末の入力を開始承認の入力へ変換する", () => {
  it("正しい許可番号と系統区間を型付き入力へ変換する", () => {
    const result = ApproveEvaInput.parse({
      permitId: moonbaseFixture.permitId,
      segmentId: moonbaseFixture.segmentId,
      equipmentChecks,
      approvedBy: "base-commander",
    });

    expect(result.isOk()).toBe(true);
    expectTypeOf(result._unsafeUnwrap()).toMatchTypeOf<ApproveEvaInputValue>();
  });
});

describe("Step 2: 不正なIDを境界で拒否する", () => {
  it("不正な許可番号をerrにする", () => {
    expect(
      ApproveEvaInput.parse({
        permitId: "EVA-41",
        segmentId: moonbaseFixture.segmentId,
        equipmentChecks,
        approvedBy: "base-commander",
      }).isErr(),
    ).toBe(true); // 要件: 書式に合わない許可番号を err にしてください。
  });

  it("不正な系統区間をerrにする", () => {
    expect(
      ApproveEvaInput.parse({
        permitId: moonbaseFixture.permitId,
        segmentId: "PV7",
        equipmentChecks,
        approvedBy: "base-commander",
      }).isErr(),
    ).toBe(true); // 要件: 書式に合わない系統区間を err にしてください。
  });
});
