import { moonbaseNoticeFromCode, notImplemented } from "@moonbase/base-web/server";
import type { Context, Hono } from "hono";

import { moonbaseFixture } from "../../../fixtures/moonbase.js";
import { ApproveEvaInput } from "../boundary/approveEvaInput.js";
import type { EvaPermit, Requested } from "../domain/permit/index.js";
import {
  abort,
  close,
  egress,
  PermitId,
  returnToBase,
  ZoneId,
} from "../domain/permit/index.js";
import { WorkerId } from "../domain/worker/index.js";
import { approveEva } from "../useCase/approveEva.js";
import type {
  CrewExposureResolver,
  PermitStore,
  SpaceWeather,
} from "../useCase/dependencies.js";
import { toPageProps } from "./permitView.js";

export type Environment = Readonly<{
  exposures: CrewExposureResolver;
  spaceWeather: SpaceWeather;
}>;

export const session06InitialPermit: Requested = {
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

const permitOrThrow = (store: PermitStore, permitId: string): EvaPermit => {
  const permit = store.find(permitId);
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

export const registerMoonbaseRoutes = (
  app: Hono,
  store: PermitStore,
  environment: Environment,
): void => {
  app.get("/", (context) =>
    context.render(
      "MoonbaseDashboard",
      toPageProps(
        permitOrThrow(store, moonbaseFixture.permitId),
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
    try {
      approveEva({
        resolver: store,
        store,
        exposures: environment.exposures,
        spaceWeather: environment.spaceWeather,
      })({
        ...input,
        approvedAt: moonbaseFixture.approvedAt,
        lunarDay: moonbaseFixture.lunarDay,
      });
      return context.redirect("/", 303);
    } catch (error) {
      if (error instanceof Error && error.message.includes("was not found")) {
        return context.redirect("/?notice=not-found", 303);
      }
      throw error;
    }
  });

  app.post("/permits/:permitId/egress", (context) => {
    const current = permitOrThrow(store, context.req.param("permitId"));
    if (current.kind !== "Approved") throw new Error("Invalid permit state");
    store.save(egress(current, moonbaseFixture.egressAt));
    return context.redirect("/", 303);
  });

  app.post("/permits/:permitId/return", (context) => {
    const current = permitOrThrow(store, context.req.param("permitId"));
    if (current.kind !== "Outside") throw new Error("Invalid permit state");
    store.save(
      returnToBase(current, { kind: "Planned" }, moonbaseFixture.returnedAt),
    );
    return context.redirect("/", 303);
  });

  app.post("/permits/:permitId/close", (context) => {
    const current = permitOrThrow(store, context.req.param("permitId"));
    if (current.kind !== "Returned") throw new Error("Invalid permit state");
    store.save(
      close(
        current,
        { lockoutRemovedAt: moonbaseFixture.lockoutRemovedAt },
        moonbaseFixture.closedAt,
      ),
    );
    return context.redirect("/", 303);
  });

  app.post("/permits/:permitId/abort", (context) => {
    const current = permitOrThrow(store, context.req.param("permitId"));
    if (current.kind !== "Requested" && current.kind !== "Approved") {
      throw new Error("Invalid permit state");
    }
    store.save(
      abort(
        current,
        "ground control request",
        moonbaseFixture.abortedAt,
        "ground-control",
      ),
    );
    return context.redirect("/", 303);
  });

  app.post("/reports/roll-call", notImplemented);
  app.post("/demo/reset", (context) => {
    store.reset();
    return context.redirect("/", 303);
  });
};
