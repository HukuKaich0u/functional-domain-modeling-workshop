import { z } from "zod";

import { EventId } from "../../../../domain/aggregate/eventId.js";
import { LunarDay } from "../../../../domain/aggregate/lunarDay.js";
import { Timestamp } from "../../../../domain/aggregate/timestamp.js";
import { EquipmentCheckId, OxygenMinutes } from "../../../../domain/equipmentCheck/index.js";
import { PermitId, PlannedMinutes, ZoneId } from "../../../../domain/permit/index.js";
import { SegmentId } from "../../../../domain/segment/index.js";
import { assertNever } from "../../../../domain/shared/assertNever.js";
import { FlareAlertLevel, SpaceWeatherReportId } from "../../../../domain/spaceWeather/index.js";
import { SessionId } from "../../../../domain/session/sessionId.js";
import { UserId } from "../../../../domain/user/userId.js";
import { UserRoleSchema } from "../../../../domain/user/userRole.js";
import { WorkerId, WorkerQualification } from "../../../../domain/worker/index.js";
import { domainEventsTable } from "../schema.js";

const EventIdentitySchema = z.object({
  eventId: EventId.schema,
  occurredAt: Timestamp.schema,
  lunarDay: LunarDay.schema,
  actorUserId: UserId.schema,
});

const UserSafeStateSchema = z.object({ kind: UserRoleSchema, userId: UserId.schema }).strict();
const SessionSafeStateSchema = z.object({
  sessionId: SessionId.schema,
  userId: UserId.schema,
  expiresAt: Timestamp.schema,
}).strict();
const SegmentSafeStateSchema = z.object({
  segmentId: SegmentId.schema,
  lockoutStatus: z.enum(["Energized", "LockedOut"]),
}).strict();
const LockedOutSegmentSafeStateSchema = z.object({
  segmentId: SegmentId.schema,
  lockoutStatus: z.literal("LockedOut"),
  permitId: PermitId.schema,
  taggedBy: UserId.schema,
  taggedAt: Timestamp.schema,
}).strict();
const EnergizedSegmentSafeStateSchema = z.object({
  segmentId: SegmentId.schema,
  lockoutStatus: z.literal("Energized"),
}).strict();
const WorkerSafeStateSchema = z.object({
  workerId: WorkerId.schema,
  qualification: WorkerQualification.schema,
}).strict();
const PermitSafeBaseShape = {
  permitId: PermitId.schema,
  zoneId: ZoneId.schema,
  crew: z.tuple([WorkerId.schema, WorkerId.schema]),
  plannedMinutes: PlannedMinutes.schema,
  requestedAt: Timestamp.schema,
};
const ApprovedSafeShape = {
  ...PermitSafeBaseShape,
  segmentId: SegmentId.schema,
  approvedBy: UserId.schema,
  approvedAt: Timestamp.schema,
  approvalLunarDay: LunarDay.schema,
};
const RequestedSafeStateSchema = z.object({ kind: z.literal("Requested"), ...PermitSafeBaseShape }).strict();
const ApprovedSafeStateSchema = z.object({ kind: z.literal("Approved"), ...ApprovedSafeShape }).strict();
const OutsideSafeStateSchema = z.object({
  kind: z.literal("Outside"),
  ...ApprovedSafeShape,
  egressAt: Timestamp.schema,
}).strict();
const ReturnedSafeStateSchema = z.object({
  kind: z.literal("Returned"),
  ...ApprovedSafeShape,
  egressAt: Timestamp.schema,
  returnedAt: Timestamp.schema,
  returnKind: z.enum(["Planned", "Emergency"]),
}).strict();
const ClosedSafeStateSchema = z.object({
  kind: z.literal("Closed"),
  ...ApprovedSafeShape,
  egressAt: Timestamp.schema,
  returnedAt: Timestamp.schema,
  returnKind: z.enum(["Planned", "Emergency"]),
  lockoutRemovedAt: Timestamp.schema,
  closedAt: Timestamp.schema,
}).strict();
const AbortedSafeStateSchema = z.object({
  kind: z.literal("Aborted"),
  ...PermitSafeBaseShape,
  abortedBy: UserId.schema,
  abortedAt: Timestamp.schema,
}).strict();
const EquipmentCheckSafeStateSchema = z.object({
  checkId: EquipmentCheckId.schema,
  permitId: PermitId.schema,
  workerId: WorkerId.schema,
  checkedAt: Timestamp.schema,
  oxygenMinutes: OxygenMinutes.schema,
  needsMaintenance: z.boolean(),
}).strict();
const SpaceWeatherSafeStateSchema = z.object({
  reportId: SpaceWeatherReportId.schema,
  issuedAt: Timestamp.schema,
  alertLevel: FlareAlertLevel.schema,
  stations: z.array(z.string()).readonly(),
}).strict();

const userEvent = <TEventName extends "user.created" | "user.updated">(eventName: TEventName) =>
  EventIdentitySchema.extend({
    aggregateId: UserId.schema,
    aggregateName: z.literal("User"),
    aggregateState: UserSafeStateSchema,
    eventName: z.literal(eventName),
    eventPayload: z.object({ userId: UserId.schema, role: UserRoleSchema }).strict(),
  }).strict();
const userPasswordResetEvent = EventIdentitySchema.extend({
  aggregateId: UserId.schema,
  aggregateName: z.literal("User"),
  aggregateState: UserSafeStateSchema,
  eventName: z.literal("user.password-reset"),
  eventPayload: z.object({ userId: UserId.schema }).strict(),
}).strict();
const userDeletedEvent = EventIdentitySchema.extend({
  aggregateId: UserId.schema,
  aggregateName: z.literal("User"),
  aggregateState: z.null(),
  eventName: z.literal("user.deleted"),
  eventPayload: z.object({ userId: UserId.schema }).strict(),
}).strict();
const sessionCreatedEvent = EventIdentitySchema.extend({
  aggregateId: SessionId.schema,
  aggregateName: z.literal("Session"),
  aggregateState: SessionSafeStateSchema,
  eventName: z.literal("session.created"),
  eventPayload: z.object({ sessionId: SessionId.schema, userId: UserId.schema }).strict(),
}).strict();
const sessionDeletedEvent = EventIdentitySchema.extend({
  aggregateId: SessionId.schema,
  aggregateName: z.literal("Session"),
  aggregateState: z.null(),
  eventName: z.literal("session.deleted"),
  eventPayload: z.object({ sessionId: SessionId.schema, userId: UserId.schema }).strict(),
}).strict();
const segmentEvent = <TEventName extends "segment.registered" | "segment.updated">(eventName: TEventName) =>
  EventIdentitySchema.extend({
    aggregateId: SegmentId.schema,
    aggregateName: z.literal("Segment"),
    aggregateState: SegmentSafeStateSchema,
    eventName: z.literal(eventName),
    eventPayload: z.object({ segmentId: SegmentId.schema }).strict(),
  }).strict();
const segmentDeletedEvent = EventIdentitySchema.extend({
  aggregateId: SegmentId.schema,
  aggregateName: z.literal("Segment"),
  aggregateState: z.null(),
  eventName: z.literal("segment.deleted"),
  eventPayload: z.object({ segmentId: SegmentId.schema }).strict(),
}).strict();
const lockoutTaggedEvent = EventIdentitySchema.extend({
  aggregateId: SegmentId.schema,
  aggregateName: z.literal("Segment"),
  aggregateState: LockedOutSegmentSafeStateSchema,
  eventName: z.literal("segment.lockout-tagged"),
  eventPayload: z.object({ segmentId: SegmentId.schema, permitId: PermitId.schema }).strict(),
}).strict();
const lockoutRemovedEvent = EventIdentitySchema.extend({
  aggregateId: SegmentId.schema,
  aggregateName: z.literal("Segment"),
  aggregateState: EnergizedSegmentSafeStateSchema,
  eventName: z.literal("segment.lockout-removed"),
  eventPayload: z.object({ segmentId: SegmentId.schema, permitId: PermitId.schema }).strict(),
}).strict();
const workerEvent = <TEventName extends "worker.registered" | "worker.updated">(eventName: TEventName) =>
  EventIdentitySchema.extend({
    aggregateId: WorkerId.schema,
    aggregateName: z.literal("Worker"),
    aggregateState: WorkerSafeStateSchema,
    eventName: z.literal(eventName),
    eventPayload: z.object({ workerId: WorkerId.schema }).strict(),
  }).strict();
const workerDeletedEvent = EventIdentitySchema.extend({
  aggregateId: WorkerId.schema,
  aggregateName: z.literal("Worker"),
  aggregateState: z.null(),
  eventName: z.literal("worker.deleted"),
  eventPayload: z.object({ workerId: WorkerId.schema }).strict(),
}).strict();
const permitEvent = <TEventName extends string, TState extends z.ZodTypeAny, TPayload extends z.ZodTypeAny>(
  eventName: TEventName,
  aggregateState: TState,
  eventPayload: TPayload,
) =>
  EventIdentitySchema.extend({
    aggregateId: PermitId.schema,
    aggregateName: z.literal("EvaPermit"),
    aggregateState,
    eventName: z.literal(eventName),
    eventPayload,
  }).strict();
const equipmentCheckRecordedEvent = EventIdentitySchema.extend({
  aggregateId: EquipmentCheckId.schema,
  aggregateName: z.literal("EquipmentCheck"),
  aggregateState: EquipmentCheckSafeStateSchema,
  eventName: z.literal("equipment-check.recorded"),
  eventPayload: z.object({
    checkId: EquipmentCheckId.schema,
    permitId: PermitId.schema,
    workerId: WorkerId.schema,
  }).strict(),
}).strict();
const spaceWeatherReportedEvent = EventIdentitySchema.extend({
  aggregateId: SpaceWeatherReportId.schema,
  aggregateName: z.literal("SpaceWeather"),
  aggregateState: SpaceWeatherSafeStateSchema,
  eventName: z.literal("space-weather.reported"),
  eventPayload: z.object({
    reportId: SpaceWeatherReportId.schema,
    alertLevel: FlareAlertLevel.schema,
  }).strict(),
}).strict();

const EventRowSchema = z.discriminatedUnion("eventName", [
  userEvent("user.created"),
  userEvent("user.updated"),
  userPasswordResetEvent,
  userDeletedEvent,
  sessionCreatedEvent,
  sessionDeletedEvent,
  segmentEvent("segment.registered"),
  segmentEvent("segment.updated"),
  segmentDeletedEvent,
  lockoutTaggedEvent,
  lockoutRemovedEvent,
  workerEvent("worker.registered"),
  workerEvent("worker.updated"),
  workerDeletedEvent,
  permitEvent(
    "permit.requested",
    RequestedSafeStateSchema,
    z.object({ permitId: PermitId.schema, zoneId: ZoneId.schema }).strict(),
  ),
  permitEvent(
    "permit.eva-approved",
    ApprovedSafeStateSchema,
    z.object({
      permitId: PermitId.schema,
      segmentId: SegmentId.schema,
      approvedAt: Timestamp.schema,
      approvedBy: UserId.schema,
    }).strict(),
  ),
  permitEvent(
    "permit.crew-egressed",
    OutsideSafeStateSchema,
    z.object({ permitId: PermitId.schema }).strict(),
  ),
  permitEvent(
    "permit.crew-returned",
    ReturnedSafeStateSchema,
    z.object({ permitId: PermitId.schema, returnKind: z.enum(["Planned", "Emergency"]) }).strict(),
  ),
  permitEvent(
    "permit.closed",
    ClosedSafeStateSchema,
    z.object({ permitId: PermitId.schema, segmentId: SegmentId.schema }).strict(),
  ),
  permitEvent(
    "permit.aborted",
    AbortedSafeStateSchema,
    z.object({ permitId: PermitId.schema, abortedBy: UserId.schema }).strict(),
  ),
  equipmentCheckRecordedEvent,
  spaceWeatherReportedEvent,
]);

export type PersistedEventRow = z.infer<typeof EventRowSchema>;

const ensureSame = (...identifiers: readonly string[]): void => {
  if (identifiers.some((identifier) => identifier !== identifiers[0])) {
    throw new TypeError("Corrupt domain event record");
  }
};

const validateConsistency = (row: PersistedEventRow): void => {
  switch (row.eventName) {
    case "user.created":
    case "user.updated":
      ensureSame(row.aggregateId, row.aggregateState.userId, row.eventPayload.userId);
      if (row.aggregateState.kind !== row.eventPayload.role) {
        throw new TypeError("Corrupt domain event record");
      }
      return;
    case "user.password-reset":
      ensureSame(row.aggregateId, row.aggregateState.userId, row.eventPayload.userId);
      return;
    case "user.deleted":
      ensureSame(row.aggregateId, row.eventPayload.userId);
      return;
    case "session.created":
      ensureSame(row.aggregateId, row.aggregateState.sessionId, row.eventPayload.sessionId);
      ensureSame(row.aggregateState.userId, row.eventPayload.userId);
      return;
    case "session.deleted":
      ensureSame(row.aggregateId, row.eventPayload.sessionId);
      return;
    case "segment.registered":
    case "segment.updated":
      ensureSame(row.aggregateId, row.aggregateState.segmentId, row.eventPayload.segmentId);
      return;
    case "segment.deleted":
      ensureSame(row.aggregateId, row.eventPayload.segmentId);
      return;
    case "segment.lockout-tagged":
      ensureSame(row.aggregateId, row.aggregateState.segmentId, row.eventPayload.segmentId);
      ensureSame(row.aggregateState.permitId, row.eventPayload.permitId);
      return;
    case "segment.lockout-removed":
      ensureSame(row.aggregateId, row.aggregateState.segmentId, row.eventPayload.segmentId);
      return;
    case "worker.registered":
    case "worker.updated":
      ensureSame(row.aggregateId, row.aggregateState.workerId, row.eventPayload.workerId);
      return;
    case "worker.deleted":
      ensureSame(row.aggregateId, row.eventPayload.workerId);
      return;
    case "permit.requested":
      ensureSame(row.aggregateId, row.aggregateState.permitId, row.eventPayload.permitId);
      ensureSame(row.aggregateState.zoneId, row.eventPayload.zoneId);
      return;
    case "permit.eva-approved":
      ensureSame(row.aggregateId, row.aggregateState.permitId, row.eventPayload.permitId);
      ensureSame(row.aggregateState.segmentId, row.eventPayload.segmentId);
      ensureSame(row.aggregateState.approvedAt, row.eventPayload.approvedAt);
      ensureSame(row.aggregateState.approvedBy, row.eventPayload.approvedBy);
      return;
    case "permit.crew-egressed":
      ensureSame(row.aggregateId, row.aggregateState.permitId, row.eventPayload.permitId);
      return;
    case "permit.crew-returned":
      ensureSame(row.aggregateId, row.aggregateState.permitId, row.eventPayload.permitId);
      ensureSame(row.aggregateState.returnKind, row.eventPayload.returnKind);
      return;
    case "permit.closed":
      ensureSame(row.aggregateId, row.aggregateState.permitId, row.eventPayload.permitId);
      ensureSame(row.aggregateState.segmentId, row.eventPayload.segmentId);
      return;
    case "permit.aborted":
      ensureSame(row.aggregateId, row.aggregateState.permitId, row.eventPayload.permitId);
      ensureSame(row.aggregateState.abortedBy, row.eventPayload.abortedBy);
      return;
    case "equipment-check.recorded":
      ensureSame(row.aggregateId, row.aggregateState.checkId, row.eventPayload.checkId);
      ensureSame(row.aggregateState.permitId, row.eventPayload.permitId);
      ensureSame(row.aggregateState.workerId, row.eventPayload.workerId);
      return;
    case "space-weather.reported":
      ensureSame(row.aggregateId, row.aggregateState.reportId, row.eventPayload.reportId);
      ensureSame(row.aggregateState.alertLevel, row.eventPayload.alertLevel);
      return;
    default:
      return assertNever(row);
  }
};

export const parsePersistedEventRow = (
  raw: typeof domainEventsTable.$inferSelect,
): PersistedEventRow => {
  const row = EventRowSchema.parse(raw);
  validateConsistency(row);
  return row;
};
