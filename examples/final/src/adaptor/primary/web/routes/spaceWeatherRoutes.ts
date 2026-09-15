import type { Context, Hono } from "hono";
import { z } from "zod";

import { Timestamp } from "../../../../domain/aggregate/timestamp.js";
import { FlareAlertLevel } from "../../../../domain/spaceWeather/index.js";
import type { SpaceWeatherReport } from "../../../../domain/spaceWeather/index.js";
import type { ListSpaceWeatherUseCase } from "../../../../useCase/listSpaceWeatherUseCase.js";
import type { ReportSpaceWeatherUseCase } from "../../../../useCase/reportSpaceWeatherUseCase.js";
import { parseBody, requireActor, requireGroundControl } from "../middleware/requestBody.js";
import { withSharedProps } from "../middleware/sharedProps.js";
import { assertNever, respondToUseCaseError } from "../middleware/useCaseResponse.js";
import type { FieldErrors, WebEnvironment } from "../pageProps.js";

/**
 * 地上管制の報告。フォームの「駅名をカンマ区切り」と外部 JSON の配列を、同じ schema で受ける。
 * S5 で見た「any のまま通す」境界を、ここでは zod の境界にしている。
 */
const StationsSchema = z.preprocess(
  (value) =>
    typeof value === "string"
      ? value
          .split(",")
          .map((station) => station.trim())
          .filter((station) => station.length > 0)
      : value,
  z.array(z.string().trim().min(1).max(50)).max(10),
);
export const SpaceWeatherReportSchema = z.object({
  issuedAt: Timestamp.schema,
  alertLevel: FlareAlertLevel.schema,
  stations: StationsSchema,
});

type SpaceWeatherRouteDependencies = Readonly<{
  listSpaceWeather: ListSpaceWeatherUseCase;
  reportSpaceWeather: ReportSpaceWeatherUseCase;
}>;

export type SpaceWeatherPageView = Readonly<{
  reportId: string;
  issuedAt: string;
  alertLevel: SpaceWeatherReport["alertLevel"];
  stations: readonly string[];
}>;

const toPageView = (report: SpaceWeatherReport): SpaceWeatherPageView => ({
  reportId: report.reportId,
  issuedAt: report.issuedAt,
  alertLevel: report.alertLevel,
  stations: report.stations,
});

const renderIndex = async (
  context: Context<WebEnvironment>,
  dependencies: SpaceWeatherRouteDependencies,
  errors: FieldErrors = {},
): Promise<Response> => {
  const actor = requireActor(context);
  if (actor.isErr()) return actor.error;
  return dependencies.listSpaceWeather
    .run({ actorUserId: actor.value.user.userId })
    .match(
      ({ reports }) =>
        context.render(
          "SpaceWeather/Index",
          withSharedProps(context, { reports: reports.map(toPageView), errors }),
        ),
      () => respondToUseCaseError(context, { kind: "Unauthorized" }),
    );
};

export const registerSpaceWeatherRoutes = (
  app: Hono<WebEnvironment>,
  dependencies: SpaceWeatherRouteDependencies,
): void => {
  app.get("/space-weather", (context) => renderIndex(context, dependencies));

  app.post("/space-weather", async (context) => {
    const actor = requireGroundControl(context);
    if (actor.isErr()) return actor.error;
    const parsed = await parseBody(context, SpaceWeatherReportSchema);
    if (parsed.isErr()) {
      return renderIndex(context, dependencies, parsed.error.errors);
    }
    return dependencies.reportSpaceWeather
      .run({ actorUserId: actor.value.user.userId, ...parsed.value })
      .match(
        () => context.redirect("/space-weather", 303),
        (error) => {
          switch (error.kind) {
            case "Unauthorized":
              return respondToUseCaseError(context, { kind: "Unauthorized" });
            case "IdentityGenerationFailed":
              return respondToUseCaseError(context, { kind: "InternalServerError" });
            default:
              return assertNever(error);
          }
        },
      );
  });
};
