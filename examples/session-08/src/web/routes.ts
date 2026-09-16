import { moonbaseNoticeFromCode, notImplemented } from "@moonbase/base-web/server";
import type { Context, Hono } from "hono";

import { moonbaseFixture } from "../../../fixtures/moonbase.js";
import type { SqliteEvaApprovedStore } from "../adaptor/secondary/sqlite/evaApprovedStore.js";
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
import { approveEvaWithEffects } from "../useCase/approveEva.js";
import type {
  CrewExposureResolver,
  EventContextDependencies,
  SpaceWeather,
} from "../useCase/dependencies.js";
import type {
  ApproveEvaError,
  ApproveEvaWithEffectsError,
} from "../useCase/errors.js";
import { toPageProps } from "./permitView.js";

type ApproveEvaNoticeCode =
  | "not-found"
  | "invalid-state"
  | "oxygen"
  | "exposure-limit"
  | "flare-alert"
  | "night";

const assertNever = (error: never): never => {
  throw new Error(`Unhandled approve EVA error: ${JSON.stringify(error)}`);
};

const toApproveEvaNoticeCode = (error: ApproveEvaError): ApproveEvaNoticeCode => {
  switch (error.kind) {
    case "PermitNotFound":
      return "not-found";
    case "InvalidPermitState":
      return "invalid-state";
    case "InsufficientOxygen":
      return "oxygen";
    case "ExposureLimitExceeded":
      return "exposure-limit";
    case "FlareAlertActive":
      return "flare-alert";
    case "NightTime":
      return "night";
    default:
      return assertNever(error);
  }
};

type ApproveEvaWithEffectsNoticeCode = ApproveEvaNoticeCode | "conflict";

const toApproveEvaWithEffectsNoticeCode = (
  error: ApproveEvaWithEffectsError,
): ApproveEvaWithEffectsNoticeCode =>
  error.kind === "PermitConflict" ? "conflict" : toApproveEvaNoticeCode(error);

export type Environment = Readonly<{
  exposures: CrewExposureResolver;
  spaceWeather: SpaceWeather;
}>;

export const session08InitialPermit: Requested = {
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

const permitOrThrow = (
  store: SqliteEvaApprovedStore,
  permitId: string,
): EvaPermit => {
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
  store: SqliteEvaApprovedStore,
  effects: EventContextDependencies,
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
    const result = await approveEvaWithEffects({
      resolver: store,
      store,
      exposures: environment.exposures,
      spaceWeather: environment.spaceWeather,
      ...effects,
    })(input);
    return result.match(
      () => context.redirect("/", 303),
      (error) =>
        context.redirect(
          `/?notice=${toApproveEvaWithEffectsNoticeCode(error)}`,
          303,
        ),
    );
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
