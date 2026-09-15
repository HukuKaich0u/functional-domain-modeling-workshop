import { createClinicRootView } from "@moonbase/base-web/server";
import { inertia } from "@hono/inertia";
import { Hono } from "hono";

import { moonbaseFixture } from "../../fixtures/moonbase.js";
import { createFixtureCrewDoseResolver } from "./adaptor/fixtureCrewDoseResolver.js";
import { createEvaApprovedStore } from "./adaptor/secondary/sqlite/evaApprovedStore.js";
import {
  createSqliteDatabase,
  migrateDatabase,
  type SqliteDatabase,
} from "./adaptor/secondary/sqlite/db.js";
import { createStaticSpaceWeather } from "./adaptor/staticSpaceWeather.js";
import type { Clock } from "./domain/aggregate/clock.js";
import { EventId } from "./domain/aggregate/eventId.js";
import type { EventIdGenerator } from "./domain/aggregate/eventIdGenerator.js";
import type {
  CrewDoseResolver,
  EventContextDependencies,
  SpaceWeather,
} from "./useCase/dependencies.js";
import {
  registerMoonbaseRoutes,
  session08InitialPermit,
  type Environment,
} from "./web/routes.js";

export type CreateAppOptions = Readonly<{
  clock?: Clock;
  doses?: CrewDoseResolver;
  eventIdGenerator?: EventIdGenerator;
  isProduction?: boolean;
  spaceWeather?: SpaceWeather;
}>;

export type DatabaseBackedAppOptions = Readonly<{
  clock?: Clock;
  databasePath: string;
  doses?: CrewDoseResolver;
  eventIdGenerator?: EventIdGenerator;
  isProduction: boolean;
  migrationsFolder: string;
  spaceWeather?: SpaceWeather;
}>;

export type DatabaseBackedApp = Hono & Readonly<{ close: () => void }>;

const defaultEffects: EventContextDependencies = {
  clock: {
    now: () => moonbaseFixture.approvedAt,
    lunarDay: () => moonbaseFixture.lunarDay,
  },
  eventIdGenerator: {
    generate: () => EventId.parse(moonbaseFixture.eventId),
  },
};

const defaultEnvironment: Environment = {
  doses: createFixtureCrewDoseResolver(moonbaseFixture.crewDoseMicroSv),
  spaceWeather: createStaticSpaceWeather(),
};

const createHonoApp = (
  database: SqliteDatabase,
  effects: EventContextDependencies,
  environment: Environment,
  isProduction: boolean,
): Hono => {
  const app = new Hono();
  const store = createEvaApprovedStore(database, session08InitialPermit);
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
  registerMoonbaseRoutes(app, store, effects, environment);
  app.onError((_error, context) => context.text("Internal Server Error", 500));
  return app;
};

const createDatabaseBackedAppFromDatabase = (
  database: SqliteDatabase,
  effects: EventContextDependencies,
  environment: Environment,
  isProduction: boolean,
): DatabaseBackedApp =>
  Object.assign(createHonoApp(database, effects, environment, isProduction), {
    close: () => database.close(),
  });

const mergeEffects = (
  clock: Clock | undefined,
  eventIdGenerator: EventIdGenerator | undefined,
): EventContextDependencies => ({
  clock: clock ?? defaultEffects.clock,
  eventIdGenerator: eventIdGenerator ?? defaultEffects.eventIdGenerator,
});

const mergeEnvironment = (
  doses: CrewDoseResolver | undefined,
  spaceWeather: SpaceWeather | undefined,
): Environment => ({
  doses: doses ?? defaultEnvironment.doses,
  spaceWeather: spaceWeather ?? defaultEnvironment.spaceWeather,
});

export const createApp = (options: CreateAppOptions = {}): DatabaseBackedApp => {
  const database = createSqliteDatabase(":memory:");

  try {
    migrateDatabase(database);
    return createDatabaseBackedAppFromDatabase(
      database,
      mergeEffects(options.clock, options.eventIdGenerator),
      mergeEnvironment(options.doses, options.spaceWeather),
      options.isProduction === true,
    );
  } catch (error) {
    database.close();
    throw error;
  }
};

export const createDatabaseBackedApp = ({
  clock,
  databasePath,
  doses,
  eventIdGenerator,
  isProduction,
  migrationsFolder,
  spaceWeather,
}: DatabaseBackedAppOptions): DatabaseBackedApp => {
  const database = createSqliteDatabase(databasePath);

  try {
    migrateDatabase(database, migrationsFolder);
    return createDatabaseBackedAppFromDatabase(
      database,
      mergeEffects(clock, eventIdGenerator),
      mergeEnvironment(doses, spaceWeather),
      isProduction,
    );
  } catch (error) {
    database.close();
    throw error;
  }
};
