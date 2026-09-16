import { randomUUID } from "node:crypto";

import { moonbaseNoticeFromCode, notImplemented } from "@moonbase/base-web/server";
import type { Hono } from "hono";

import { moonbaseFixture } from "../../../fixtures/moonbase.js";
import type {
  PermitRepository,
  PersistenceContext,
} from "../adaptor/secondary/sqlite/permitRepository.js";
import type { EvaPermit, Requested } from "../domain/permit/permit.js";
import {
  abort,
  approve,
  close,
  egress,
  returnToBase,
} from "../domain/permit/transitions.js";
import { toPageProps } from "./permitView.js";

const permitOrThrow = (
  repository: PermitRepository,
  permitId: string,
): EvaPermit => {
  const permit = repository.find(permitId);
  if (permit === undefined) {
    throw new Error("Permit not found");
  }
  return permit;
};

export const session03InitialPermit: Requested = {
  kind: "Requested",
  permitId: moonbaseFixture.permitId,
  zoneId: moonbaseFixture.zoneId,
  crew: [moonbaseFixture.crew[0], moonbaseFixture.crew[1]],
  plannedMinutes: moonbaseFixture.plannedMinutes,
  requestedAt: moonbaseFixture.requestedAt,
};

export const session03PersistenceContext: PersistenceContext = {
  crewExposureMicroSv: moonbaseFixture.crewExposureMicroSv,
};

const fixtureEquipmentChecks = [
  {
    workerId: moonbaseFixture.crew[0],
    oxygenMinutes: moonbaseFixture.oxygenMinutes,
    checkedAt: moonbaseFixture.checkedAt,
  },
  {
    workerId: moonbaseFixture.crew[1],
    oxygenMinutes: moonbaseFixture.oxygenMinutes,
    checkedAt: moonbaseFixture.checkedAt,
  },
] as const;

const saveAndAppendWorkLog = (
  repository: PermitRepository,
  permit: EvaPermit,
  eventName: string,
  occurredAt: string,
): void => {
  repository.save(permit);
  repository.appendWorkLog({
    eventId: randomUUID(),
    eventName,
    occurredAt,
    permit,
    payload: {},
  });
};

export const registerMoonbaseRoutes = (
  app: Hono,
  repository: PermitRepository,
): void => {
  app.get("/", (context) =>
    context.render(
      "MoonbaseDashboard",
      toPageProps(
        permitOrThrow(repository, moonbaseFixture.permitId),
        moonbaseNoticeFromCode(context.req.query("notice")),
      ),
    ),
  );

  app.post("/permits/:permitId/approve", (context) => {
    const current = permitOrThrow(repository, context.req.param("permitId"));
    if (current.kind !== "Requested") throw new Error("Invalid permit state");
    saveAndAppendWorkLog(
      repository,
      approve(
        current,
        {
          segmentId: moonbaseFixture.segmentId,
          equipmentChecks: fixtureEquipmentChecks,
          approvedBy: "base-commander",
        },
        moonbaseFixture.approvedAt,
      ),
      "EvaApproved",
      moonbaseFixture.approvedAt,
    );
    return context.redirect("/", 303);
  });

  app.post("/permits/:permitId/egress", (context) => {
    const current = permitOrThrow(repository, context.req.param("permitId"));
    if (current.kind !== "Approved") throw new Error("Invalid permit state");
    saveAndAppendWorkLog(
      repository,
      egress(current, moonbaseFixture.egressAt),
      "CrewEgressed",
      moonbaseFixture.egressAt,
    );
    return context.redirect("/", 303);
  });

  app.post("/permits/:permitId/return", (context) => {
    const current = permitOrThrow(repository, context.req.param("permitId"));
    if (current.kind !== "Outside") throw new Error("Invalid permit state");
    saveAndAppendWorkLog(
      repository,
      returnToBase(current, { kind: "Planned" }, moonbaseFixture.returnedAt),
      "CrewReturned",
      moonbaseFixture.returnedAt,
    );
    return context.redirect("/", 303);
  });

  app.post("/permits/:permitId/close", (context) => {
    const current = permitOrThrow(repository, context.req.param("permitId"));
    if (current.kind !== "Returned") throw new Error("Invalid permit state");
    saveAndAppendWorkLog(
      repository,
      close(
        current,
        { lockoutRemovedAt: moonbaseFixture.lockoutRemovedAt },
        moonbaseFixture.closedAt,
      ),
      "PermitClosed",
      moonbaseFixture.closedAt,
    );
    return context.redirect("/", 303);
  });

  app.post("/permits/:permitId/abort", (context) => {
    const current = permitOrThrow(repository, context.req.param("permitId"));
    if (current.kind !== "Requested" && current.kind !== "Approved") {
      throw new Error("Invalid permit state");
    }
    saveAndAppendWorkLog(
      repository,
      abort(current, "ground control request", moonbaseFixture.abortedAt, "ground-control"),
      "PermitAborted",
      moonbaseFixture.abortedAt,
    );
    return context.redirect("/", 303);
  });

  app.post("/reports/roll-call", notImplemented);
  app.post("/demo/reset", (context) => {
    repository.reset(session03InitialPermit, session03PersistenceContext);
    return context.redirect("/", 303);
  });
};
