import type {
  ActionAvailability,
  MoonbasePageProps,
  PermitActions,
} from "@moonbase/base-web";

import type { EvaPermit } from "../domain/permit/permit.js";
import { toStatusLabel } from "../domain/permit/statusLabel.js";

const hidden = { kind: "Hidden" } as const;
const available = (href: string): ActionAvailability => ({
  kind: "Available",
  href,
  method: "post",
});

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
      return { ...actions, approve: available(`${url}/approve`), abort: available(`${url}/abort`) };
    case "Approved":
      return { ...actions, egress: available(`${url}/egress`), abort: available(`${url}/abort`) };
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
  sessionLabel: "Session 03",
  learningFocus: "作業許可の状態と許された遷移を型で表す",
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
