import { asc } from "drizzle-orm";
import { ResultAsync } from "neverthrow";

import type {
  EventHistoryReader,
  SanitizedAuditRecord,
  SanitizedAuditValue,
} from "../../../../domain/audit/eventHistoryReader.js";
import type { SqliteDatabase } from "../db.js";
import { domainEventsTable } from "../schema.js";
import {
  parsePersistedEventRow,
  type PersistedEventRow,
} from "./persistedEventRow.js";

const redacted = "[REDACTED]";
/** 作業記録の閲覧画面に出してよい項目。累積線量、作業内容、理由、点検所見は含めない */
const safeKeys = new Set([
  "kind",
  "role",
  "userId",
  "sessionId",
  "expiresAt",
  "segmentId",
  "lockoutStatus",
  "permitId",
  "taggedBy",
  "taggedAt",
  "workerId",
  "qualification",
  "zoneId",
  "plannedMinutes",
  "requestedAt",
  "approvedBy",
  "approvedAt",
  "approvalLunarDay",
  "egressAt",
  "returnedAt",
  "returnKind",
  "lockoutRemovedAt",
  "closedAt",
  "abortedBy",
  "abortedAt",
  "checkId",
  "checkedAt",
  "oxygenMinutes",
  "needsMaintenance",
  "reportId",
  "issuedAt",
  "alertLevel",
]);

const sanitizeValue = (key: string, value: unknown): SanitizedAuditValue =>
  safeKeys.has(key) &&
  (typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null)
    ? value
    : redacted;

const sanitizeRecord = (
  value: Readonly<Record<string, unknown>> | null,
): Readonly<Record<string, SanitizedAuditValue>> | undefined =>
  value === null
    ? undefined
    : Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          sanitizeValue(key, item),
        ]),
      );

const toSanitizedAuditRecord = (
  row: PersistedEventRow,
): SanitizedAuditRecord => ({
  eventId: row.eventId,
  aggregateId: row.aggregateId,
  aggregateName: row.aggregateName,
  aggregateState: sanitizeRecord(row.aggregateState),
  eventName: row.eventName,
  eventPayload: sanitizeRecord(row.eventPayload) ?? {},
  occurredAt: row.occurredAt,
  lunarDay: row.lunarDay,
  actorUserId: row.actorUserId,
});

export const createEventHistoryReader = (
  db: SqliteDatabase,
): EventHistoryReader => ({
  list: (_admin) =>
    ResultAsync.fromSafePromise(
      Promise.resolve().then(() =>
        db
          .select()
          .from(domainEventsTable)
          .orderBy(asc(domainEventsTable.occurredAt))
          .all()
          .map(parsePersistedEventRow)
          .map(toSanitizedAuditRecord),
      ),
    ),
});
