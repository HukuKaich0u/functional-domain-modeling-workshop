import type { Reason, Request } from "./procedural";

type RuleData = Readonly<{
  field: keyof Request;
  expected: boolean;
  reason: Reason;
}>;

// この例では、規則を関数ではなくデータで表す。
export const rules: readonly RuleData[] = [
  { field: "equipmentChecked", expected: true, reason: "EquipmentNotChecked" },
  { field: "flareAlert", expected: false, reason: "FlareAlertActive" },
];

export function check(request: Request): readonly Reason[] {
  return rules
    .filter((rule) => request[rule.field] !== rule.expected)
    .map((rule) => rule.reason);
}
