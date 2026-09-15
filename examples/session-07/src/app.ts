import { createClinicRootView } from "@moonbase/base-web/server";
import { inertia } from "@hono/inertia";
import { Hono } from "hono";

import { moonbaseFixture } from "../../fixtures/moonbase.js";
import { createFixtureCrewDoseResolver } from "./adaptor/fixtureCrewDoseResolver.js";
import { createPermitStore } from "./adaptor/secondary/sqlite/permitStore.js";
import {
  createSqliteDatabase,
  migrateDatabase,
  type SqliteDatabase,
} from "./adaptor/secondary/sqlite/db.js";
import { createStaticSpaceWeather } from "./adaptor/staticSpaceWeather.js";
import type { CrewDoseResolver, SpaceWeather } from "./useCase/dependencies.js";
import {
  registerMoonbaseRoutes,
  session07InitialPermit,
  type Environment,
} from "./web/routes.js";

export type CreateAppOptions = Readonly<{
  doses?: CrewDoseResolver;
  isProduction?: boolean;
  spaceWeather?: SpaceWeather;
}>;

type DatabaseBackedAppOptions = Readonly<{
  databasePath: string;
  doses?: CrewDoseResolver;
  isProduction: boolean;
  migrationsFolder: string;
  spaceWeather?: SpaceWeather;
}>;

export type DatabaseBackedApp = Hono & Readonly<{ close: () => void }>;

const defaultEnvironment: Environment = {
  doses: createFixtureCrewDoseResolver(moonbaseFixture.crewDoseMicroSv),
  spaceWeather: createStaticSpaceWeather(),
};

const mergeEnvironment = (
  doses: CrewDoseResolver | undefined,
  spaceWeather: SpaceWeather | undefined,
): Environment => ({
  doses: doses ?? defaultEnvironment.doses,
  spaceWeather: spaceWeather ?? defaultEnvironment.spaceWeather,
});

const createHonoApp = (
  database: SqliteDatabase,
  environment: Environment,
  isProduction: boolean,
): Hono => {
  const app = new Hono();
  const store = createPermitStore(database, session07InitialPermit);
  store.seedIfEmpty();
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
  registerMoonbaseRoutes(app, store, environment);
  app.onError((_error, context) => context.text("Internal Server Error", 500));
  return app;
};

const createDatabaseBackedAppFromDatabase = (
  database: SqliteDatabase,
  environment: Environment,
  isProduction: boolean,
): DatabaseBackedApp =>
  Object.assign(createHonoApp(database, environment, isProduction), {
    close: () => database.close(),
  });

export const createApp = (options: CreateAppOptions = {}): DatabaseBackedApp => {
  const database = createSqliteDatabase(":memory:");

  try {
    migrateDatabase(database);
    return createDatabaseBackedAppFromDatabase(
      database,
      mergeEnvironment(options.doses, options.spaceWeather),
      options.isProduction === true,
    );
  } catch (error) {
    database.close();
    throw error;
  }
};

export const createDatabaseBackedApp = ({
  databasePath,
  doses,
  isProduction,
  migrationsFolder,
  spaceWeather,
}: DatabaseBackedAppOptions): DatabaseBackedApp => {
  const database = createSqliteDatabase(databasePath);

  try {
    migrateDatabase(database, migrationsFolder);
    return createDatabaseBackedAppFromDatabase(
      database,
      mergeEnvironment(doses, spaceWeather),
      isProduction,
    );
  } catch (error) {
    database.close();
    throw error;
  }
};
