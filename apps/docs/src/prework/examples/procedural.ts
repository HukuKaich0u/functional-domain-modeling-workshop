export type Request = Readonly<{
  equipmentChecked: boolean;
  flareAlert: boolean;
}>;
export type Reason = "EquipmentNotChecked" | "FlareAlertActive";

export function check(request: Request): Reason[] {
  const reasons: Reason[] = [];
  if (!request.equipmentChecked) reasons.push("EquipmentNotChecked");
  if (request.flareAlert) reasons.push("FlareAlertActive");
  return reasons;
}

// check({ equipmentChecked: false, flareAlert: true })
// => ["EquipmentNotChecked", "FlareAlertActive"]
