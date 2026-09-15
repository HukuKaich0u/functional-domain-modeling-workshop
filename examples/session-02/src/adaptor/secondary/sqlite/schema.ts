import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const permitsTable = sqliteTable("permits", {
  permitId: text("permit_id").primaryKey(),
  zoneId: text("zone_id").notNull(),
  status: text("status").notNull(),
  state: text("state", { mode: "json" }).notNull(),
});

export const workLogsTable = sqliteTable("work_logs", {
  eventId: text("event_id").primaryKey(),
  permitId: text("permit_id").notNull(),
  eventName: text("event_name").notNull(),
  payload: text("payload", { mode: "json" }).notNull(),
  occurredAt: text("occurred_at").notNull(),
});

export const sqliteSchema = {
  permitsTable,
  workLogsTable,
} as const;
