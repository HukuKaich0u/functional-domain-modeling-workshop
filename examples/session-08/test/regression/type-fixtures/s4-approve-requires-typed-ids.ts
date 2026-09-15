// @ts-nocheck
import { SegmentId } from "../../../src/domain/lockout/index.js";
import type { Requested } from "../../../src/domain/permit/index.js";
import { approve, PermitId, ZoneId } from "../../../src/domain/permit/index.js";
import { WorkerId } from "../../../src/domain/worker/index.js";
import { moonbaseFixture } from "../../../../fixtures/moonbase.js";

const crew = [
  WorkerId.parse(moonbaseFixture.crew[0]),
  WorkerId.parse(moonbaseFixture.crew[1]),
] as const;

const requested: Requested = {
  kind: "Requested",
  permitId: PermitId.parse(moonbaseFixture.permitId),
  zoneId: ZoneId.parse(moonbaseFixture.zoneId),
  crew,
  plannedMinutes: moonbaseFixture.plannedMinutes,
  requestedAt: moonbaseFixture.requestedAt,
};

const equipmentChecks = [
  { workerId: crew[0], oxygenMinutes: 300, checkedAt: moonbaseFixture.checkedAt },
  { workerId: crew[1], oxygenMinutes: 300, checkedAt: moonbaseFixture.checkedAt },
] as const;

const acceptZoneId = (_id: ZoneId): void => undefined;
acceptZoneId(requested.zoneId);

const segmentId = SegmentId.parse(moonbaseFixture.segmentId);
approve(
  requested,
  { segmentId, equipmentChecks, approvedBy: "base-commander" },
  moonbaseFixture.approvedAt,
);

// @ts-expect-error ZoneIdをSegmentIdとして使えません。
approve(requested, { segmentId: requested.zoneId, equipmentChecks, approvedBy: "base-commander" }, moonbaseFixture.approvedAt);
