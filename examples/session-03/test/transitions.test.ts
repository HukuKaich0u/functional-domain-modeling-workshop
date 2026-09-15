import { describe, expect, it } from "vitest";

import type {
  Aborted,
  Approved,
  Closed,
  Outside,
  Requested,
  Returned,
} from "../src/domain/permit/permit.js";
import {
  abort,
  approve,
  close,
  egress,
  returnToBase,
} from "../src/domain/permit/transitions.js";
import { moonbaseFixture } from "../../fixtures/moonbase.js";

const equipmentChecks = [
  { workerId: moonbaseFixture.crew[0], oxygenMinutes: moonbaseFixture.oxygenMinutes, checkedAt: moonbaseFixture.checkedAt },
  { workerId: moonbaseFixture.crew[1], oxygenMinutes: moonbaseFixture.oxygenMinutes, checkedAt: moonbaseFixture.checkedAt },
] as const;
const approveInput = {
  segmentId: moonbaseFixture.segmentId,
  equipmentChecks,
  approvedBy: "base-commander",
} as const;

const requested: Requested = {
  kind: "Requested",
  permitId: moonbaseFixture.permitId,
  zoneId: moonbaseFixture.zoneId,
  crew: [moonbaseFixture.crew[0], moonbaseFixture.crew[1]],
  plannedMinutes: moonbaseFixture.plannedMinutes,
  requestedAt: moonbaseFixture.requestedAt,
};
const approved: Approved = {
  ...requested,
  kind: "Approved",
  ...approveInput,
  approvedAt: moonbaseFixture.approvedAt,
};
const outside: Outside = { ...approved, kind: "Outside", egressAt: moonbaseFixture.egressAt };
const returned: Returned = {
  ...outside,
  kind: "Returned",
  returnedAt: moonbaseFixture.returnedAt,
  returnRecord: { kind: "Planned" },
};
const closed: Closed = {
  ...returned,
  kind: "Closed",
  lockoutRemovedAt: moonbaseFixture.lockoutRemovedAt,
  closedAt: moonbaseFixture.closedAt,
};
const aborted: Aborted = {
  ...requested,
  kind: "Aborted",
  reason: "ground control request",
  abortedAt: moonbaseFixture.abortedAt,
  abortedBy: "ground-control",
};

describe("Session 03 transition starter", () => {
  it("帰還の記録後だけ完了にできる", () => {
    const back = returnToBase(outside, { kind: "Planned" }, moonbaseFixture.returnedAt);
    const done = close(back, { lockoutRemovedAt: moonbaseFixture.lockoutRemovedAt }, moonbaseFixture.closedAt);

    expect(back.kind).toBe("Returned");
    expect(done.kind).toBe("Closed");
    expect(() =>
      close(outside, { lockoutRemovedAt: moonbaseFixture.lockoutRemovedAt }, moonbaseFixture.closedAt),
    ).toThrow();
  });

  it("許可されない遷移元は実行時に例外にする", () => {
    expect(() => egress(outside, moonbaseFixture.egressAt)).toThrow();
    expect(() => approve(closed, approveInput, moonbaseFixture.approvedAt)).toThrow();
    expect(() => approve(aborted, approveInput, moonbaseFixture.approvedAt)).toThrow();
    expect(() => abort(closed, "late", moonbaseFixture.abortedAt, "ground-control")).toThrow();
    expect(() => abort(requested, undefined, moonbaseFixture.abortedAt, "ground-control")).toThrow();
  });
});
