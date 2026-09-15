import type { DomainEvent } from "../aggregate/domainEvent.js";
import type { EventContext } from "../aggregate/eventContext.js";
import type { PermitId } from "../permit/index.js";
import type { WorkerId } from "../worker/index.js";
import type { EquipmentCheck } from "./equipmentCheck.js";
import type { EquipmentCheckId } from "./equipmentCheckId.js";

export type EquipmentCheckRecorded = Readonly<
  Omit<
    DomainEvent<
      EquipmentCheckId,
      "EquipmentCheck",
      EquipmentCheck,
      "EquipmentCheckRecorded",
      "equipment-check.recorded",
      Readonly<{ checkId: EquipmentCheckId; permitId: PermitId; workerId: WorkerId }>
    >,
    "aggregateState"
  > & {
    aggregateState: EquipmentCheck;
  }
>;

export type EquipmentCheckEvent = EquipmentCheckRecorded;

export const createEquipmentCheckRecorded = (
  context: EventContext,
  check: EquipmentCheck,
): EquipmentCheckRecorded => ({
  kind: "EquipmentCheckRecorded",
  eventId: context.eventId,
  aggregateId: check.checkId,
  aggregateName: "EquipmentCheck",
  aggregateState: check,
  eventName: "equipment-check.recorded",
  eventPayload: { checkId: check.checkId, permitId: check.permitId, workerId: check.workerId },
  occurredAt: context.occurredAt,
  lunarDay: context.lunarDay,
  actorUserId: context.actorUserId,
});
