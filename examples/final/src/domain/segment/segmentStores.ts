import type { ResultAsync } from "neverthrow";

import type { AggregateStore } from "../aggregate/aggregateStore.js";
import type { PermitClosed, PermitConflict } from "../permit/index.js";
import type {
  LockoutRemoved,
  LockoutTagged,
  SegmentDeleted,
  SegmentRegistered,
  SegmentUpdated,
} from "./segmentEvent.js";
import type { SegmentId } from "./segmentId.js";

export type SegmentAlreadyExists = Readonly<{
  kind: "SegmentAlreadyExists";
  segmentId: SegmentId;
}>;
export type SegmentRegisteredStore = Readonly<{
  store: (event: SegmentRegistered) => ResultAsync<void, SegmentAlreadyExists>;
}>;
export type SegmentUpdatedStore = AggregateStore<SegmentUpdated>;

export type SegmentInUseStoreError = Readonly<{ kind: "SegmentInUse"; segmentId: SegmentId }>;
export type SegmentNotFoundStoreError = Readonly<{ kind: "SegmentNotFound"; segmentId: SegmentId }>;
export type SegmentDeletedStoreError = SegmentInUseStoreError | SegmentNotFoundStoreError;
export type SegmentDeletedStore = Readonly<{
  store: (event: SegmentDeleted) => ResultAsync<void, SegmentDeletedStoreError>;
}>;

/** 遮断状態が読み取り時と変わっていた。保存側が権威を持って判定する */
export type SegmentConflict = Readonly<{ kind: "SegmentConflict"; segmentId: SegmentId }>;
export type LockoutTaggedStore = Readonly<{
  store: (event: LockoutTagged) => ResultAsync<void, SegmentConflict>;
}>;
export type LockoutRemovedStore = Readonly<{
  store: (event: LockoutRemoved) => ResultAsync<void, SegmentConflict>;
}>;

/** 遮断札の取り外しと作業許可の完了を1つの transaction で保存する（規程第3条・第7条） */
export type LockoutReleaseStoreError = SegmentConflict | PermitConflict;
export type LockoutReleaseStore = Readonly<{
  store: (
    lockoutRemoved: LockoutRemoved,
    permitClosed: PermitClosed,
  ) => ResultAsync<void, LockoutReleaseStoreError>;
}>;
