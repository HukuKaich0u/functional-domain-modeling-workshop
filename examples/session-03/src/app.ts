import { createClinicRootView } from "@moonbase/base-web/server";
import { inertia } from "@hono/inertia";
import { Hono } from "hono";

import { createPermitRepository } from "./adaptor/secondary/sqlite/permitRepository.js";
import {
  createSqliteDatabase,
  migrateDatabase,
  type SqliteDatabase,
} from "./adaptor/secondary/sqlite/db.js";
import {
  registerMoonbaseRoutes,
  session03InitialPermit,
  session03PersistenceContext,
} from "./web/routes.js";

type DatabaseBackedAppOptions = Readonly<{
  databasePath: string;
  migrationsFolder: string;
  isProduction: boolean;
}>;

export type DatabaseBackedApp = Hono & Readonly<{ close: () => void }>;

const createApp = (database: SqliteDatabase, isProduction = false): Hono => {
  const app = new Hono();
  const repository = createPermitRepository(database);
  repository.seedIfEmpty(session03InitialPermit, session03PersistenceContext);

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
}: DatabaseBackedAppOptions): DatabaseBackedApp => {
  const database = createSqliteDatabase(databasePath);

  try {
    migrateDatabase(database, migrationsFolder);
    return Object.assign(createApp(database, isProduction), {
      close: () => database.close(),
    });
  } catch (error) {
    database.close();
    throw error;
  }
};
