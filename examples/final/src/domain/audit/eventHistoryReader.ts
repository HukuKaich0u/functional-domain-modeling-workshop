import type { ResultAsync } from "neverthrow";

import type { EventId } from "../aggregate/eventId.js";
import type { LunarDay } from "../aggregate/lunarDay.js";
import type { Timestamp } from "../aggregate/timestamp.js";
import type { Admin } from "../user/user.js";
import type { UserId } from "../user/userId.js";

export type SanitizedAuditValue = string | number | boolean | null;
export type SanitizedAuditRecord = Readonly<{
  eventId: EventId;
  aggregateId: string;
  aggregateName: string;
  eventName: string;
  occurredAt: Timestamp;
  lunarDay: LunarDay;
  actorUserId: UserId;
  aggregateState:
    | Readonly<Record<string, SanitizedAuditValue>>
    | undefined;
  eventPayload: Readonly<Record<string, SanitizedAuditValue>>;
}>;

/** 作業記録の閲覧。被ばく量などの機微情報は読み出し時に必ず伏せる */
export type EventHistoryReader = Readonly<{
  list: (
    admin: Admin,
  ) => ResultAsync<readonly SanitizedAuditRecord[], never>;
}>;
