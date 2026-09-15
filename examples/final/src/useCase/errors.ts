import { err, ok, type Result } from "neverthrow";

import type {
  Approved,
  EvaPermit,
  Outside,
  PermitId,
  Requested,
  Returned,
} from "../domain/permit/index.js";
import type { Segment, SegmentId } from "../domain/segment/index.js";
import type { User } from "../domain/user/user.js";
import type { UserId } from "../domain/user/userId.js";
import type { Worker, WorkerId } from "../domain/worker/index.js";

export type UnauthorizedError = Readonly<{
  kind: "Unauthorized";
  actorUserId: UserId;
}>;

export type PermitNotFound = Readonly<{
  kind: "PermitNotFound";
  permitId: PermitId;
}>;

export type InvalidPermitState<TExpected extends string = string> = Readonly<{
  kind: "InvalidPermitState";
  permitId: PermitId;
  expectedKind: TExpected;
  actualKind: EvaPermit["kind"];
}>;

export type SegmentNotFound = Readonly<{
  kind: "SegmentNotFound";
  segmentId: SegmentId;
}>;

export type WorkerNotFound = Readonly<{
  kind: "WorkerNotFound";
  workerId: WorkerId;
}>;

export type IdentityGenerationFailed = Readonly<{
  kind: "IdentityGenerationFailed";
}>;

export const ensureUserFound =
  (actorUserId: UserId) =>
  (user: User | undefined): Result<User, UnauthorizedError> =>
    user === undefined ? err({ kind: "Unauthorized", actorUserId }) : ok(user);

export const ensurePermitFound =
  (permitId: PermitId) =>
  (permit: EvaPermit | undefined): Result<EvaPermit, PermitNotFound> =>
    permit === undefined ? err({ kind: "PermitNotFound", permitId }) : ok(permit);

const invalidState = <TExpected extends string>(
  permit: EvaPermit,
  expectedKind: TExpected,
): InvalidPermitState<TExpected> => ({
  kind: "InvalidPermitState",
  permitId: permit.permitId,
  expectedKind,
  actualKind: permit.kind,
});

export const ensureRequested = (
  permit: EvaPermit,
): Result<Requested, InvalidPermitState<"Requested">> =>
  permit.kind === "Requested" ? ok(permit) : err(invalidState(permit, "Requested"));

export const ensureApproved = (
  permit: EvaPermit,
): Result<Approved, InvalidPermitState<"Approved">> =>
  permit.kind === "Approved" ? ok(permit) : err(invalidState(permit, "Approved"));

export const ensureOutside = (
  permit: EvaPermit,
): Result<Outside, InvalidPermitState<"Outside">> =>
  permit.kind === "Outside" ? ok(permit) : err(invalidState(permit, "Outside"));

export const ensureReturned = (
  permit: EvaPermit,
): Result<Returned, InvalidPermitState<"Returned">> =>
  permit.kind === "Returned" ? ok(permit) : err(invalidState(permit, "Returned"));

/** 中止は出発前だけ（規程第6条） */
export const ensureAbortable = (
  permit: EvaPermit,
): Result<Requested | Approved, InvalidPermitState<"RequestedOrApproved">> =>
  permit.kind === "Requested" || permit.kind === "Approved"
    ? ok(permit)
    : err(invalidState(permit, "RequestedOrApproved"));

export const ensureSegmentFound =
  (segmentId: SegmentId) =>
  (segment: Segment | undefined): Result<Segment, SegmentNotFound> =>
    segment === undefined ? err({ kind: "SegmentNotFound", segmentId }) : ok(segment);

export const ensureWorkerFound =
  (workerId: WorkerId) =>
  (worker: Worker | undefined): Result<Worker, WorkerNotFound> =>
    worker === undefined ? err({ kind: "WorkerNotFound", workerId }) : ok(worker);
