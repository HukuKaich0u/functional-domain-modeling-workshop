import { createMoonbaseRootView } from "@moonbase/base-web/server";
import type { RootView } from "@hono/inertia";

export const createRootView = (isProduction: boolean): RootView =>
  createMoonbaseRootView(
    isProduction,
    "/src/adaptor/primary/web/client.tsx",
  );
