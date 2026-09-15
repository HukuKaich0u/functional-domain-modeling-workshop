import type { EventId } from "./eventId.js";
import type { LunarDay } from "./lunarDay.js";
import type { Timestamp } from "./timestamp.js";
import type { UserId } from "../user/userId.js";

export type EventContext = Readonly<{
  eventId: EventId;
  occurredAt: Timestamp;
  lunarDay: LunarDay;
  actorUserId: UserId;
}>;
