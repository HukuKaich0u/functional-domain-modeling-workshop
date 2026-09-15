import type { Hono } from "hono";

import type { ListEventsUseCase } from "../../../../useCase/listEventsUseCase.js";
import { withSharedProps } from "../middleware/sharedProps.js";
import { respondToUseCaseError } from "../middleware/useCaseResponse.js";
import type { WebEnvironment } from "../pageProps.js";

type EventRouteDependencies = Readonly<{
  listEvents: ListEventsUseCase;
}>;

/** 作業記録。Admin だけが閲覧でき、値は読み出し時に伏せられている */
export const registerEventRoutes = (
  app: Hono<WebEnvironment>,
  dependencies: EventRouteDependencies,
): void => {
  app.get("/events", (context) => {
    const actor = context.get("actor");
    if (actor === undefined) {
      return respondToUseCaseError(context, { kind: "Unauthenticated" });
    }
    return dependencies.listEvents
      .run({ actorUserId: actor.user.userId })
      .match(
        ({ events }) =>
          context.render(
            "Events/Index",
            withSharedProps(context, { events }),
          ),
        () => respondToUseCaseError(context, { kind: "Unauthorized" }),
      );
  });
};
