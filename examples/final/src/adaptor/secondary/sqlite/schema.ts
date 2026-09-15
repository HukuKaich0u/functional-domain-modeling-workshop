import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const installationTable = sqliteTable("installation", {
  installationKey: text("installation_key").primaryKey(),
});

export const usersTable = sqliteTable(
  "users",
  {
    userId: text("user_id").primaryKey(),
    role: text("role", {
      enum: ["Admin", "GroundControl", "BaseCommander", "Electrician"],
    }).notNull(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const sessionsTable = sqliteTable(
  "sessions",
  {
    sessionId: text("session_id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.userId, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [uniqueIndex("sessions_token_hash_unique").on(table.tokenHash)],
);

export const segmentsTable = sqliteTable("segments", {
  segmentId: text("segment_id").primaryKey(),
  label: text("label").notNull(),
  lockoutStatus: text("lockout_status", { enum: ["Energized", "LockedOut"] }).notNull(),
  lockedOutPermitId: text("locked_out_permit_id"),
  state: text("state", { mode: "json" }).notNull(),
});

export const workersTable = sqliteTable("workers", {
  workerId: text("worker_id").primaryKey(),
  qualification: text("qualification", { enum: ["Electrician", "General"] }).notNull(),
  cumulativeDoseMicroSv: integer("cumulative_dose_micro_sv").notNull(),
});

export const permitsTable = sqliteTable("permits", {
  permitId: text("permit_id").primaryKey(),
  status: text("status", {
    enum: ["Requested", "Approved", "Outside", "Returned", "Closed", "Aborted"],
  }).notNull(),
  zoneId: text("zone_id").notNull(),
  crewA: text("crew_a").notNull(),
  crewB: text("crew_b").notNull(),
  state: text("state", { mode: "json" }).notNull(),
});

export const equipmentChecksTable = sqliteTable("equipment_checks", {
  checkId: text("check_id").primaryKey(),
  permitId: text("permit_id").notNull(),
  workerId: text("worker_id").notNull(),
  state: text("state", { mode: "json" }).notNull(),
});

export const spaceWeatherReportsTable = sqliteTable("space_weather_reports", {
  reportId: text("report_id").primaryKey(),
  issuedAt: text("issued_at").notNull(),
  alertLevel: text("alert_level", { enum: ["none", "S1", "S2", "S3", "S4", "S5"] }).notNull(),
  state: text("state", { mode: "json" }).notNull(),
});

export const domainEventsTable = sqliteTable("domain_events", {
  eventId: text("event_id").primaryKey(),
  aggregateId: text("aggregate_id").notNull(),
  aggregateName: text("aggregate_name").notNull(),
  aggregateState: text("aggregate_state", { mode: "json" }),
  eventName: text("event_name").notNull(),
  eventPayload: text("event_payload", { mode: "json" }).notNull(),
  occurredAt: text("occurred_at").notNull(),
  lunarDay: integer("lunar_day").notNull(),
  actorUserId: text("actor_user_id").notNull(),
});

export const sqliteSchema = {
  installationTable,
  usersTable,
  sessionsTable,
  segmentsTable,
  workersTable,
  permitsTable,
  equipmentChecksTable,
  spaceWeatherReportsTable,
  domainEventsTable,
} as const;
