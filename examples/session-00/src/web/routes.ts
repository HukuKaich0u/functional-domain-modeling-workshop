import { randomUUID } from "node:crypto";

import { notImplemented } from "@moonbase/base-web/server";
import type { Context, Hono } from "hono";

import { moonbaseFixture } from "../../../fixtures/moonbase.js";
import type { PermitRepository } from "../adaptor/secondary/sqlite/permitRepository.js";
import { SpaceWeatherReport } from "../boundary/spaceWeatherReport.js";
import {
  requestPermit,
  updateStatus,
  type EvaPermit,
  type PermitExtra,
} from "../domain/permit/permit.js";
import { approveEva } from "../useCase/approveEva.js";
import { toPageProps } from "./permitView.js";

export const initialPermit: EvaPermit = requestPermit({
  permitId: moonbaseFixture.permitId,
  zoneId: moonbaseFixture.zoneId,
  crew: [...moonbaseFixture.crew],
  plannedMinutes: moonbaseFixture.plannedMinutes,
  requestedAt: moonbaseFixture.requestedAt,
});

const crewExposure = moonbaseFixture.crew.map(
  (workerId) => moonbaseFixture.crewExposureMicroSv[workerId] ?? 0,
);

const permitOrThrow = (
  repository: PermitRepository,
  permitId: string,
): EvaPermit => {
  const permit = repository.find(permitId);
  if (permit === undefined) {
    throw new Error(`Permit not found: ${permitId}`);
  }
  return permit;
};

const updatePermit = (
  repository: PermitRepository,
  permitId: string,
  status: string,
  eventName: string,
  occurredAt: string,
  extra?: PermitExtra,
): EvaPermit => {
  const permit = permitOrThrow(repository, permitId);
  const updated = updateStatus(permit, status, extra);

  repository.save(updated);
  repository.appendWorkLog({
    eventId: randomUUID(),
    eventName,
    occurredAt,
    permit: updated,
  });

  return updated;
};

const redirectToRoot = (context: Context) => context.redirect("/", 303);

export const registerMoonbaseRoutes = (
  app: Hono,
  repository: PermitRepository,
): void => {
  app.get("/", (context) => {
    const permit = permitOrThrow(repository, moonbaseFixture.permitId);
    return context.render(
      "MoonbaseDashboard",
      toPageProps(
        permit,
        repository.listWorkLogs(),
        context.req.query("notice"),
      ),
    );
  });

  app.post("/permits/:permitId/approve", (context) => {
    approveEva(repository)({
      permitId: context.req.param("permitId"),
      segmentId: moonbaseFixture.segmentId,
      crewExposure,
    });
    return redirectToRoot(context);
  });

  app.post("/permits/:permitId/egress", (context) => {
    updatePermit(
      repository,
      context.req.param("permitId"),
      "outside",
      "crew.egressed",
      moonbaseFixture.egressAt,
      { egressAt: moonbaseFixture.egressAt },
    );
    return redirectToRoot(context);
  });

  app.post("/permits/:permitId/return", (context) => {
    updatePermit(
      repository,
      context.req.param("permitId"),
      "returned",
      "crew.returned",
      moonbaseFixture.returnedAt,
      { returnedAt: moonbaseFixture.returnedAt },
    );
    return redirectToRoot(context);
  });

  app.post("/permits/:permitId/close", (context) => {
    updatePermit(
      repository,
      context.req.param("permitId"),
      "closed",
      "permit.closed",
      moonbaseFixture.closedAt,
      {
        lockoutRemovedAt: moonbaseFixture.lockoutRemovedAt,
        closedAt: moonbaseFixture.closedAt,
      },
    );
    return redirectToRoot(context);
  });

  app.post("/permits/:permitId/abort", (context) => {
    updatePermit(
      repository,
      context.req.param("permitId"),
      "aborted",
      "permit.aborted",
      new Date().toISOString(),
      { abortReason: "ground control request" },
    );
    return redirectToRoot(context);
  });

  app.post("/reports/roll-call", notImplemented);

  app.post("/demo/incidents/unknown-status", (context) => {
    updatePermit(
      repository,
      moonbaseFixture.permitId,
      "waiting-for-sunrise",
      "permit.status-updated",
      new Date().toISOString(),
    );
    return redirectToRoot(context);
  });

  app.post("/demo/incidents/swap-identifiers", (context) => {
    updatePermit(
      repository,
      moonbaseFixture.permitId,
      "requested",
      "permit.identifiers-updated",
      new Date().toISOString(),
      { segmentId: moonbaseFixture.wrongSegmentId },
    );
    return redirectToRoot(context);
  });

  app.post("/demo/incidents/malformed-space-weather", (context) => {
    const raw = {
      issuedAt: 20260915,
      alertLevel: "X9",
      stations: "not-an-array",
    };
    const report = SpaceWeatherReport.parse(raw);

    updatePermit(
      repository,
      moonbaseFixture.permitId,
      "approved",
      "eva.approved",
      moonbaseFixture.approvedAt,
      { spaceWeather: report, segmentId: moonbaseFixture.segmentId },
    );
    return redirectToRoot(context);
  });

  app.post("/demo/incidents/missing-permit", (context) => {
    try {
      approveEva(repository)({
        permitId: "EVA-9999",
        segmentId: moonbaseFixture.segmentId,
        crewExposure,
      });
    } catch (error: any) {
      if (error.message.includes("Permit not found")) {
        return context.redirect("/?notice=invalid-state", 303);
      }
      throw error;
    }

    return redirectToRoot(context);
  });

  app.post("/demo/incidents/repeat-approve", async (context) => {
    const input = {
      permitId: moonbaseFixture.permitId,
      segmentId: moonbaseFixture.segmentId,
      crewExposure,
    };
    const first = approveEva(repository)(input);
    if (first.approvedAt === undefined) {
      throw new Error("Approval did not set a timestamp");
    }

    await waitForClockAfter(first.approvedAt);
    approveEva(repository)(input);
    return redirectToRoot(context);
  });

  app.post("/demo/reset", (context) => {
    repository.reset(initialPermit);
    return redirectToRoot(context);
  });
};

const waitForClockAfter = async (timestamp: string): Promise<void> => {
  const timestampInMilliseconds = Date.parse(timestamp);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (Date.now() > timestampInMilliseconds) {
      return;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Clock did not advance after ${timestamp}`);
};
