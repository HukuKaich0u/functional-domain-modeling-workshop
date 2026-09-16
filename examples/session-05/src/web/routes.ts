import { randomUUID } from "node:crypto";

import { moonbaseNoticeFromCode, notImplemented } from "@moonbase/base-web/server";
import type { Context, Hono } from "hono";

import { moonbaseFixture } from "../../../fixtures/moonbase.js";
import type {
  PermitRepository,
  PersistenceContext,
} from "../adaptor/secondary/sqlite/permitRepository.js";
import type { SpaceWeather } from "../adaptor/staticSpaceWeather.js";
import { ApproveEvaInput } from "../boundary/approveEvaInput.js";
import type { EvaPermit, Requested } from "../domain/permit/index.js";
import {
  abort,
  approve,
  close,
  egress,
  PermitId,
  returnToBase,
  ZoneId,
} from "../domain/permit/index.js";
import {
  hasEnoughOxygen,
  isExposureWithinLimit,
  WorkerId,
  type CrewExposureResolver,
} from "../domain/worker/index.js";
import { toPageProps } from "./permitView.js";

export type Environment = Readonly<{
  exposures: CrewExposureResolver;
  spaceWeather: SpaceWeather;
}>;

export const session05InitialPermit: Requested = {
  kind: "Requested",
  permitId: PermitId.parse(moonbaseFixture.permitId),
  zoneId: ZoneId.parse(moonbaseFixture.zoneId),
  crew: [
    WorkerId.parse(moonbaseFixture.crew[0]),
    WorkerId.parse(moonbaseFixture.crew[1]),
  ],
  plannedMinutes: moonbaseFixture.plannedMinutes,
  requestedAt: moonbaseFixture.requestedAt,
};

export const session05PersistenceContext: PersistenceContext = {
  crewExposureMicroSv: moonbaseFixture.crewExposureMicroSv,
};

const permitOrThrow = (
  repository: PermitRepository,
  permitId: string,
): EvaPermit => {
  const permit = repository.find(permitId);
  if (permit === undefined) throw new Error("Permit not found");
  return permit;
};

const decodeApprovePayload = async (context: Context) => {
  const raw = await context.req.json<Record<string, unknown>>();
  return {
    ...raw,
    equipmentChecks:
      typeof raw.equipmentChecks === "string"
        ? JSON.parse(raw.equipmentChecks)
        : raw.equipmentChecks,
  };
};

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
  environment: Environment,
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

  app.post("/permits/:permitId/approve", async (context) => {
    const raw = await decodeApprovePayload(context);
    const input = ApproveEvaInput.parse({
      ...raw,
      permitId: context.req.param("permitId"),
    })._unsafeUnwrap();
    const current = permitOrThrow(repository, input.permitId);
    if (current.kind !== "Requested") throw new Error("Invalid permit state");
    if (moonbaseFixture.lunarDay > 14) throw new Error("Night time");
    if (environment.spaceWeather.currentAlert().kind !== "Clear") {
      throw new Error("Flare alert is active");
    }
    for (const check of input.equipmentChecks) {
      if (!hasEnoughOxygen(check, current.plannedMinutes)) {
        throw new Error(`Oxygen too low for ${check.workerId}`);
      }
    }
    for (const workerId of current.crew) {
      if (!isExposureWithinLimit(environment.exposures.resolve(workerId), current.plannedMinutes)) {
        throw new Error(`Exposure limit exceeded for ${workerId}`);
      }
    }
    saveAndAppendWorkLog(
      repository,
      approve(
        current,
        {
          segmentId: input.segmentId,
          equipmentChecks: input.equipmentChecks,
          approvedBy: input.approvedBy,
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
    repository.reset(session05InitialPermit, session05PersistenceContext);
    return context.redirect("/", 303);
  });
};
