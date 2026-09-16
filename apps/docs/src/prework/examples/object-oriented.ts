import type { Reason, Request } from "./procedural";

interface Rule {
  check(request: Request): readonly Reason[];
}

export class EquipmentRule implements Rule {
  check(request: Request): readonly Reason[] {
    return request.equipmentChecked ? [] : ["EquipmentNotChecked"];
  }
}

export class FlareRule implements Rule {
  check(request: Request): readonly Reason[] {
    return request.flareAlert ? ["FlareAlertActive"] : [];
  }
}

export class ApprovalPolicy {
  constructor(private readonly rules: readonly Rule[]) {}

  check(request: Request): readonly Reason[] {
    return this.rules.flatMap((rule) => rule.check(request));
  }
}

export const policy = new ApprovalPolicy([
  new EquipmentRule(),
  new FlareRule(),
]);
