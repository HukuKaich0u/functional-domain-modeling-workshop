import { createClinicRootView } from "@moonbase/base-web/server";
import { inertia } from "@hono/inertia";
import { Hono } from "hono";

import { moonbaseFixture } from "../../fixtures/moonbase.js";
import { createFixtureCrewExposureResolver } from "./adaptor/fixtureCrewExposureResolver.js";
import { createPermitRepository } from "./adaptor/secondary/sqlite/permitRepository.js";
import {
  createSqliteDatabase,
  migrateDatabase,
  type SqliteDatabase,
} from "./adaptor/secondary/sqlite/db.js";
import { createStaticSpaceWeather } from "./adaptor/staticSpaceWeather.js";
import {
  registerMoonbaseRoutes,
  session04InitialPermit,
  session04PersistenceContext,
  type Environment,
} from "./web/routes.js";

type DatabaseBackedAppOptions = Readonly<{
  databasePath: string;
  migrationsFolder: string;
  isProduction: boolean;
  environment?: Partial<Environment>;
}>;

export type DatabaseBackedApp = Hono & Readonly<{ close: () => void }>;

const defaultEnvironment: Environment = {
  exposures: createFixtureCrewExposureResolver(moonbaseFixture.crewExposureMicroSv),
  spaceWeather: createStaticSpaceWeather(),
};

const createApp = (
  database: SqliteDatabase,
  environment: Environment,
  isProduction = false,
): Hono => {
  const app = new Hono();
  const repository = createPermitRepository(database);
  repository.seedIfEmpty(session04InitialPermit, session04PersistenceContext);

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
  registerMoonbaseRoutes(app, repository, environment);
  app.onError((_error, context) => context.text("Internal Server Error", 500));

  return app;
};

export const createDatabaseBackedApp = ({
  databasePath,
  migrationsFolder,
  isProduction,
  environment,
}: DatabaseBackedAppOptions): DatabaseBackedApp => {
  const database = createSqliteDatabase(databasePath);

  try {
    migrateDatabase(database, migrationsFolder);
    return Object.assign(
      createApp(database, { ...defaultEnvironment, ...environment }, isProduction),
      { close: () => database.close() },
    );
  } catch (error) {
    database.close();
    throw error;
  }
};
