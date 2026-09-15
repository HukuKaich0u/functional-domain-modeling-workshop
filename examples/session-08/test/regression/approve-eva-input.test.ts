import { describe, expect, expectTypeOf, it } from "vitest";

import { moonbaseFixture } from "../../../fixtures/moonbase.js";
import {
  ApproveEvaInput,
  type ApproveEvaInput as ApproveEvaInputValue,
} from "../../src/boundary/approveEvaInput.js";

const equipmentChecks = moonbaseFixture.crew.map((workerId) => ({
  workerId,
  oxygenMinutes: moonbaseFixture.oxygenMinutes,
  checkedAt: moonbaseFixture.checkedAt,
}));

const valid = {
  permitId: moonbaseFixture.permitId,
  segmentId: moonbaseFixture.segmentId,
  equipmentChecks,
  approvedBy: "base-commander",
};

describe("S5 regression: 開始承認の外部入力を検証する", () => {
  it("正しい入力を型付き入力へ変換する", () => {
    const result = ApproveEvaInput.parse(valid);

    expect(result.isOk()).toBe(true);
    expectTypeOf(result._unsafeUnwrap()).toMatchTypeOf<ApproveEvaInputValue>();
  });

  it("不正な許可番号を拒否する", () => {
    expect(ApproveEvaInput.parse({ ...valid, permitId: "EVA-41" }).isErr()).toBe(true);
  });

  it("不正な系統区間を拒否する", () => {
    expect(ApproveEvaInput.parse({ ...valid, segmentId: "PV7" }).isErr()).toBe(true);
  });

  it("装備点検が2名分そろっていない入力を拒否する", () => {
    expect(
      ApproveEvaInput.parse({ ...valid, equipmentChecks: [equipmentChecks[0]] }).isErr(),
    ).toBe(true);
  });
});
