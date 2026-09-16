import { describe, expect, it } from "vitest";
import { check as procedural, type Reason } from "./examples/procedural";
import { policy } from "./examples/object-oriented";
import { check as functional } from "./examples/functional";
import { check as data } from "./examples/rule-data";
import { approve, label } from "./examples/states";
import { parseMinutes, describeMinutes } from "./examples/boundary";
import { readField } from "./examples/type-operators";

describe("事前学習の掲載コード", () => {
  for (const [name, check] of Object.entries({
    procedural, objectOriented: policy.check.bind(policy), functional, data,
  })) {
    it(`${name}: 2条件の全組み合わせを同じ報告方針で判定する`, () => {
      const cases: [boolean, boolean, Reason[]][] = [
        [true, false, []],
        [false, false, ["EquipmentNotChecked"]],
        [true, true, ["FlareAlertActive"]],
        [false, true, ["EquipmentNotChecked", "FlareAlertActive"]],
      ];
      for (const [equipmentChecked, flareAlert, expected] of cases) {
        const request = Object.freeze({ equipmentChecked, flareAlert });
        expect(check(request)).toEqual(expected);
        expect(check(request)).toEqual(expected);
      }
    });
  }

  it("承認は元の申請を変えず、承認者を持つ新しい状態を返す", () => {
    const draft = Object.freeze({ status: "Draft" as const, id: "EVA-01" });
    const approved = approve(draft, "管制担当");
    expect(approved).toEqual({ status: "Approved", id: "EVA-01", approvedBy: "管制担当" });
    expect(label(draft)).toBe("申請中");
    expect(label(approved)).toBe("承認者: 管制担当");
  });

  it.each([0, -1, "30", NaN, Infinity, null, undefined, {}])(
    "作業時間として不正な外部入力 %s を拒否する", (input) => {
      expect(parseMinutes(input)).toEqual({ ok: false, error: "InvalidMinutes" });
    },
  );

  it("検証した作業時間を成功の値として使える", () => {
    expect(parseMinutes(30)).toEqual({ ok: true, value: { kind: "Minutes", value: 30 } });
    expect(describeMinutes(30)).toBe("30分の予定です");
    expect(describeMinutes("30")).toBe("作業時間は正の有限な数で入力してください");
    expect(readField({ equipmentChecked: true, flareAlert: false }, "flareAlert")).toBe(false);
  });
});
