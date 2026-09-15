import { createClinicRootView } from "@moonbase/base-web/server";
import { inertia } from "@hono/inertia";
import { Hono } from "hono";

import { createPermitRepository } from "./adaptor/secondary/sqlite/permitRepository.js";
import {
  createSqliteDatabase,
  migrateDatabase,
  type SqliteDatabase,
} from "./adaptor/secondary/sqlite/db.js";
import { initialPermit, registerMoonbaseRoutes } from "./web/routes.js";

type DatabaseBackedAppOptions = Readonly<{
  databasePath: string;
  migrationsFolder: string;
  isProduction: boolean;
}>;

export const createApp = (
  database: SqliteDatabase,
  isProduction = false,
): Hono => {
  const repository = createPermitRepository(database);
  repository.seedIfEmpty(initialPermit);
  const app = new Hono();

  app.use(
    "*",
    inertia({
      version: "1",
      rootView: createClinicRootView(
        isProduction,
        "/src/web/client.tsx",
        "MoonBase 作業管理",
      ),
    }),
  );
  registerMoonbaseRoutes(app, repository);
  app.onError((_error, context) => context.text("Internal Server Error", 500));

  return app;
};

export const createDatabaseBackedApp = ({
  databasePath,
  migrationsFolder,
  isProduction,
}: DatabaseBackedAppOptions): Hono => {
  const database = createSqliteDatabase(databasePath);
  migrateDatabase(database, migrationsFolder);

  return createApp(database, isProduction);
};
