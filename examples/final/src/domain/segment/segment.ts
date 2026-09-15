import type { EventContext } from "../aggregate/eventContext.js";
import type { Timestamp } from "../aggregate/timestamp.js";
import type { PermitId } from "../permit/index.js";
import type { UserId } from "../user/userId.js";
import {
  createLockoutRemoved,
  createLockoutTagged,
  createSegmentDeleted,
  createSegmentRegistered,
  createSegmentUpdated,
  type LockoutRemoved,
  type LockoutTagged,
  type SegmentDeleted,
  type SegmentRegistered,
  type SegmentUpdated,
} from "./segmentEvent.js";
import type { SegmentId } from "./segmentId.js";
import type { SegmentLabel } from "./segmentLabel.js";

/** 遮断札。掛けた者だけが外せる（規程第3条） */
export type Lockout =
  | Readonly<{ kind: "Energized" }>
  | Readonly<{
      kind: "LockedOut";
      permitId: PermitId;
      taggedBy: UserId;
      taggedAt: Timestamp;
    }>;

export type Segment = Readonly<{
  segmentId: SegmentId;
  label: SegmentLabel;
  lockout: Lockout;
}>;

export type EnergizedSegment = Segment & Readonly<{ lockout: Extract<Lockout, { kind: "Energized" }> }>;
export type LockedOutSegment = Segment & Readonly<{ lockout: Extract<Lockout, { kind: "LockedOut" }> }>;
export type SegmentProfile = Readonly<Pick<Segment, "label">>;

const register = (context: EventContext) => (segment: Segment): SegmentRegistered =>
  createSegmentRegistered(context, segment);

const update =
  (context: EventContext) =>
  (segment: Segment, profile: SegmentProfile): SegmentUpdated =>
    createSegmentUpdated(context, { ...segment, label: profile.label } as const satisfies Segment);

const remove = (context: EventContext) => (segment: Segment): SegmentDeleted =>
  createSegmentDeleted(context, segment.segmentId);

/** 遮断して札を掛ける。掛けた者と時刻は実行コンテキストから取る */
const tagLockout =
  (context: EventContext) =>
  (segment: EnergizedSegment, permitId: PermitId): LockoutTagged =>
    createLockoutTagged(context, {
      ...segment,
      lockout: {
        kind: "LockedOut",
        permitId,
        taggedBy: context.actorUserId,
        taggedAt: context.occurredAt,
      },
    } as const satisfies LockedOutSegment);

const removeLockout =
  (context: EventContext) =>
  (segment: LockedOutSegment): LockoutRemoved =>
    createLockoutRemoved(
      context,
      { ...segment, lockout: { kind: "Energized" } } as const satisfies EnergizedSegment,
      segment.lockout.permitId,
    );

export const Segment = {
  register,
  update,
  delete: remove,
  tagLockout,
  removeLockout,
  isLockedOut: (segment: Segment): segment is LockedOutSegment =>
    segment.lockout.kind === "LockedOut",
  isEnergized: (segment: Segment): segment is EnergizedSegment =>
    segment.lockout.kind === "Energized",
} as const;
