import type {
  ActionAvailability,
  MoonbasePageProps,
  PermitActions,
} from "@moonbase/base-web";

import { moonbaseFixture } from "../../../fixtures/moonbase.js";
import type { EvaPermit } from "../domain/permit/index.js";
import { toStatusLabel } from "../domain/permit/index.js";

const hidden = { kind: "Hidden" } as const;
const available = (
  href: string,
  data?: Readonly<Record<string, string>>,
): ActionAvailability =>
  data === undefined
    ? { kind: "Available", href, method: "post" }
    : { kind: "Available", href, method: "post", data };

const equipmentChecks = moonbaseFixture.crew.map((workerId) => ({
  workerId,
  oxygenMinutes: moonbaseFixture.oxygenMinutes,
  checkedAt: moonbaseFixture.checkedAt,
}));

const actionsFor = (permit: EvaPermit): PermitActions => {
  const url = `/permits/${permit.permitId}`;
  const actions: PermitActions = {
    approve: hidden,
    egress: hidden,
    returnToBase: hidden,
    close: hidden,
    abort: hidden,
    exportRollCall: {
      kind: "NotImplemented",
      href: "/reports/roll-call",
      method: "post",
    },
  };

  switch (permit.kind) {
    case "Requested":
      return {
        ...actions,
        approve: available(`${url}/approve`, {
          segmentId: moonbaseFixture.segmentId,
          equipmentChecks: JSON.stringify(equipmentChecks),
          approvedBy: "base-commander",
        }),
        abort: available(`${url}/abort`),
      };
    case "Approved":
      return {
        ...actions,
        egress: available(`${url}/egress`),
        abort: available(`${url}/abort`),
      };
    case "Outside":
      return { ...actions, returnToBase: available(`${url}/return`) };
    case "Returned":
      return { ...actions, close: available(`${url}/close`) };
    case "Closed":
    case "Aborted":
      return actions;
  }
};

export const toPageProps = (
  permit: EvaPermit,
  notice: MoonbasePageProps["notice"],
): MoonbasePageProps => ({
  sessionLabel: "Session 07",
  learningFocus: "時刻とIDを外から渡し、状態と作業記録を一度に保存する",
  permit: {
    permitId: permit.permitId,
    kind: permit.kind,
    zoneId: permit.zoneId,
    crew: permit.crew,
    requestedAt: permit.requestedAt,
    statusLabel: toStatusLabel(permit),
  },
  actions: actionsFor(permit),
  notice,
});
