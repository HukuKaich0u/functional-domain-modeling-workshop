import type { EventContext } from "../aggregate/eventContext.js";
import type { Timestamp } from "../aggregate/timestamp.js";
import type { PermitId } from "../permit/index.js";
import type { WorkerId } from "../worker/index.js";
import { createEquipmentCheckRecorded, type EquipmentCheckRecorded } from "./equipmentCheckEvent.js";
import type { EquipmentCheckId } from "./equipmentCheckId.js";
import type { EquipmentNote } from "./equipmentNote.js";
import type { OxygenMinutes } from "./oxygenMinutes.js";

/** 予備の酸素。予定作業時間にこの分を足した残時間が必要（規程第2条） */
export const OXYGEN_RESERVE_MINUTES = 60;

export type EquipmentCheck = Readonly<{
  checkId: EquipmentCheckId;
  permitId: PermitId;
  workerId: WorkerId;
  checkedAt: Timestamp;
  oxygenMinutes: OxygenMinutes;
  note: EquipmentNote;
  needsMaintenance: boolean;
}>;

const record = (context: EventContext) => (check: EquipmentCheck): EquipmentCheckRecorded =>
  createEquipmentCheckRecorded(context, check);

export const hasEnoughOxygen = (check: EquipmentCheck, plannedMinutes: number): boolean =>
  check.oxygenMinutes >= plannedMinutes + OXYGEN_RESERVE_MINUTES;

export const EquipmentCheck = {
  record,
} as const;
