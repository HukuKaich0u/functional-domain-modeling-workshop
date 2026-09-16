import type { Reason, Request } from "./procedural";

type Rule = (request: Request) => readonly Reason[];

const equipmentRule: Rule = (request) =>
  request.equipmentChecked ? [] : ["EquipmentNotChecked"];

const flareRule: Rule = (request) =>
  request.flareAlert ? ["FlareAlertActive"] : [];

// 関数を受け取り、組み合わせた関数を返す。
export const combine = (rules: readonly Rule[]): Rule =>
  (request) => rules.flatMap((rule) => rule(request));

export const check = combine([equipmentRule, flareRule]);
