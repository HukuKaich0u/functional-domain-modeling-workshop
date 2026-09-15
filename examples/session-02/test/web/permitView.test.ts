import { describe, expect, it } from "vitest";

import { moonbaseFixture } from "../../../fixtures/moonbase.js";
import type { WorkLog } from "../../src/adaptor/secondary/sqlite/permitRepository.js";
import type { EvaPermit } from "../../src/domain/permit/permit.js";
import { toPageProps } from "../../src/web/permitView.js";

const knownStatuses = [
  "requested",
  "approved",
  "outside",
  "returned",
  "closed",
  "aborted",
] as const;

const permit: EvaPermit = {
  permitId: moonbaseFixture.permitId,
  zoneId: moonbaseFixture.zoneId,
  crew: [...moonbaseFixture.crew],
  plannedMinutes: moonbaseFixture.plannedMinutes,
  requestedAt: moonbaseFixture.requestedAt,
  status: "requested",
};

const workLogFor = (current: EvaPermit): WorkLog => ({
  eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  permitId: current.permitId,
  eventName: "permit.updated",
  payload: current,
  occurredAt: current.requestedAt,
});

describe("Session 02 permit view", () => {
  it.each(knownStatuses)(
    "既知 status %s でも全主要操作を Available のまま表示する",
    (status) => {
      const current = { ...permit, status };
      const props = toPageProps(current, [workLogFor(current)], undefined);

      expect([
        props.actions.approve.kind,
        props.actions.egress.kind,
        props.actions.returnToBase.kind,
        props.actions.close.kind,
        props.actions.abort.kind,
      ]).toEqual(["Available", "Available", "Available", "Available", "Available"]);
      expect(props.actions.exportRollCall.kind).toBe("NotImplemented");
    },
  );

  it.each(["toString", "__proto__"] as const)(
    "Object prototype 由来の名前 %s も文字列のまま未知 status として表示する",
    (status) => {
      const current = { ...permit, status };

      const props = toPageProps(current, [workLogFor(current)], undefined);

      expect(props.permit.kind).toBe(status);
      expect(props.permit.statusLabel).toBe(status);
      expect(props.incidentLab?.inspection.warnings).toContain(
        "想定外の作業許可の状態が保存されています",
      );
    },
  );

  it("作業記録が1件もない作業許可を記録欠落として警告する", () => {
    const props = toPageProps(permit, [], undefined);

    expect(props.incidentLab?.inspection.warnings).toContain(
      "現在の作業許可に対応する作業記録がありません",
    );
  });
});
