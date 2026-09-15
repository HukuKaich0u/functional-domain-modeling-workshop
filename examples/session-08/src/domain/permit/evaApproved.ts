import type { EventId } from "../aggregate/eventId.js";
import type { Approved } from "./permit.js";
import type { PermitId } from "./permitId.js";

export type EvaApproved = Readonly<{
  kind: "EvaApproved";
  eventId: EventId;
  occurredAt: string;
  lunarDay: number;
  permitId: PermitId;
  aggregateState: Approved;
}>;
