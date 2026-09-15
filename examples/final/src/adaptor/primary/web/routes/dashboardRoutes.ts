import type { Hono } from "hono";

import type { InstallationStatusQuery } from "../../../../domain/installation/installationStatusQuery.js";
import type { GetDashboardUseCase } from "../../../../useCase/getDashboardUseCase.js";
import { resolveInstallationStatus } from "../installationStatus.js";
import { withSharedProps } from "../middleware/sharedProps.js";
import { respondToUseCaseError } from "../middleware/useCaseResponse.js";
import type { WebEnvironment } from "../pageProps.js";

type DashboardRouteDependencies = Readonly<{
  installationStatusQuery: InstallationStatusQuery;
  getDashboard: GetDashboardUseCase;
}>;

/** 作業状況ボード。進行中の許可、遮断中の区間、現在のフレア警報を一望する */
export const registerDashboardRoutes = (
  app: Hono<WebEnvironment>,
  dependencies: DashboardRouteDependencies,
): void => {
  app.get("/", async (context) => {
    const actor = context.get("actor");
    if (actor === undefined) {
      const installation = await resolveInstallationStatus(
        dependencies.installationStatusQuery,
      );
      return context.redirect(
        installation.kind === "InitialSetupAvailable"
          ? "/setup"
          : "/login",
      );
    }

    return dependencies.getDashboard
      .run({ actorUserId: actor.user.userId })
      .match(
        (dashboard) =>
          context.render(
            "Dashboard",
            withSharedProps(context, {
              counts: dashboard.counts,
              activePermits: dashboard.activePermits,
              lockedOutSegments: dashboard.lockedOutSegments,
              flareAlert: dashboard.flareAlert ?? null,
            }),
          ),
        () =>
          respondToUseCaseError(context, { kind: "Unauthenticated" }),
      );
  });
};
