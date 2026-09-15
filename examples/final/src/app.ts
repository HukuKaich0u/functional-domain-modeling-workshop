import { randomUUID } from "node:crypto";

import { inertia } from "@hono/inertia";
import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";

import { createAuthenticationMiddleware } from "./adaptor/primary/web/middleware/authentication.js";
import { createSharedPropsMiddleware } from "./adaptor/primary/web/middleware/sharedProps.js";
import type { WebEnvironment } from "./adaptor/primary/web/pageProps.js";
import { createRootView } from "./adaptor/primary/web/rootView.js";
import { registerAuthRoutes } from "./adaptor/primary/web/routes/authRoutes.js";
import { registerDashboardRoutes } from "./adaptor/primary/web/routes/dashboardRoutes.js";
import { registerEventRoutes } from "./adaptor/primary/web/routes/eventRoutes.js";
import { registerPermitRoutes } from "./adaptor/primary/web/routes/permitRoutes.js";
import { registerSegmentRoutes } from "./adaptor/primary/web/routes/segmentRoutes.js";
import { registerSpaceWeatherRoutes } from "./adaptor/primary/web/routes/spaceWeatherRoutes.js";
import { registerUserRoutes } from "./adaptor/primary/web/routes/userRoutes.js";
import { registerWorkerRoutes } from "./adaptor/primary/web/routes/workerRoutes.js";
import { scryptPasswordHasher } from "./adaptor/secondary/authentication/scryptPasswordHasher.js";
import { sessionTokenGenerator } from "./adaptor/secondary/authentication/sessionToken.js";
import {
  createSqliteDatabase,
  migrateDatabase,
  type SqliteDatabase,
} from "./adaptor/secondary/sqlite/db.js";
import { createEventHistoryReader } from "./adaptor/secondary/sqlite/query/eventHistoryReader.js";
import { createInstallationStatusQuery } from "./adaptor/secondary/sqlite/query/installationStatusQuery.js";
import { createEquipmentCheckByPermitIdResolver } from "./adaptor/secondary/sqlite/resolver/equipmentCheckResolver.js";
import {
  createPermitByIdResolver,
  createPermitListResolver,
} from "./adaptor/secondary/sqlite/resolver/permitResolver.js";
import {
  createSegmentByIdResolver,
  createSegmentListResolver,
} from "./adaptor/secondary/sqlite/resolver/segmentResolver.js";
import {
  createSessionByIdResolver,
  createSessionByTokenHashResolver,
} from "./adaptor/secondary/sqlite/resolver/sessionResolver.js";
import {
  createCurrentSpaceWeatherResolver,
  createSpaceWeatherListResolver,
} from "./adaptor/secondary/sqlite/resolver/spaceWeatherResolver.js";
import {
  createUserByEmailResolver,
  createUserByIdResolver,
  createUserListResolver,
} from "./adaptor/secondary/sqlite/resolver/userResolver.js";
import {
  createWorkerByIdResolver,
  createWorkerListResolver,
} from "./adaptor/secondary/sqlite/resolver/workerResolver.js";
import { createEquipmentCheckEventStore } from "./adaptor/secondary/sqlite/store/equipmentCheckEventStore.js";
import { createInitialAdminSetupStore } from "./adaptor/secondary/sqlite/store/initialAdminSetupStore.js";
import { createLockoutReleaseStore } from "./adaptor/secondary/sqlite/store/lockoutReleaseStore.js";
import { createPermitEventStore } from "./adaptor/secondary/sqlite/store/permitEventStore.js";
import {
  createLockoutRemovedStore,
  createLockoutTaggedStore,
  createSegmentDeletedStore,
  createSegmentRegisteredStore,
  createSegmentUpdatedStore,
} from "./adaptor/secondary/sqlite/store/segmentEventStore.js";
import { createSessionEventStore } from "./adaptor/secondary/sqlite/store/sessionEventStore.js";
import { createSpaceWeatherEventStore } from "./adaptor/secondary/sqlite/store/spaceWeatherEventStore.js";
import {
  createUserDeletedEventStore,
  createUserEventStore,
} from "./adaptor/secondary/sqlite/store/userEventStore.js";
import {
  createWorkerDeletedStore,
  createWorkerRegisteredStore,
  createWorkerUpdatedStore,
} from "./adaptor/secondary/sqlite/store/workerEventStore.js";
import type { Clock } from "./domain/aggregate/clock.js";
import { EventId } from "./domain/aggregate/eventId.js";
import type { EventIdGenerator } from "./domain/aggregate/eventIdGenerator.js";
import { LunarDay } from "./domain/aggregate/lunarDay.js";
import { Timestamp } from "./domain/aggregate/timestamp.js";
import { EquipmentCheckId } from "./domain/equipmentCheck/index.js";
import type { InstallationStatusQuery } from "./domain/installation/installationStatusQuery.js";
import { SessionId } from "./domain/session/sessionId.js";
import type { SessionByTokenHashResolver } from "./domain/session/sessionResolver.js";
import { SpaceWeatherReportId } from "./domain/spaceWeather/index.js";
import { PasswordHash } from "./domain/user/passwordHash.js";
import { UserId } from "./domain/user/userId.js";
import type { UserByIdResolver } from "./domain/user/userResolver.js";
import { AbortPermitUseCase, type AbortPermitUseCase as AbortPermit } from "./useCase/abortPermitUseCase.js";
import { ApproveEvaUseCase, type ApproveEvaUseCase as ApproveEva } from "./useCase/approveEvaUseCase.js";
import { ClosePermitUseCase, type ClosePermitUseCase as ClosePermit } from "./useCase/closePermitUseCase.js";
import { CreateUserUseCase, type CreateUserUseCase as CreateUser } from "./useCase/createUserUseCase.js";
import { DeleteSegmentUseCase, type DeleteSegmentUseCase as DeleteSegment } from "./useCase/deleteSegmentUseCase.js";
import { DeleteUserUseCase, type DeleteUserUseCase as DeleteUser } from "./useCase/deleteUserUseCase.js";
import { DeleteWorkerUseCase, type DeleteWorkerUseCase as DeleteWorker } from "./useCase/deleteWorkerUseCase.js";
import { GetDashboardUseCase, type GetDashboardUseCase as GetDashboard } from "./useCase/getDashboardUseCase.js";
import { GetPermitUseCase, type GetPermitUseCase as GetPermit } from "./useCase/getPermitUseCase.js";
import { GetSegmentUseCase, type GetSegmentUseCase as GetSegment } from "./useCase/getSegmentUseCase.js";
import { GetWorkerUseCase, type GetWorkerUseCase as GetWorker } from "./useCase/getWorkerUseCase.js";
import { ListEventsUseCase, type ListEventsUseCase as ListEvents } from "./useCase/listEventsUseCase.js";
import { ListPermitsUseCase, type ListPermitsUseCase as ListPermits } from "./useCase/listPermitsUseCase.js";
import { ListSegmentsUseCase, type ListSegmentsUseCase as ListSegments } from "./useCase/listSegmentsUseCase.js";
import { ListSpaceWeatherUseCase, type ListSpaceWeatherUseCase as ListSpaceWeather } from "./useCase/listSpaceWeatherUseCase.js";
import { ListUsersUseCase, type ListUsersUseCase as ListUsers } from "./useCase/listUsersUseCase.js";
import { ListWorkersUseCase, type ListWorkersUseCase as ListWorkers } from "./useCase/listWorkersUseCase.js";
import { LockOutSegmentUseCase, type LockOutSegmentUseCase as LockOutSegment } from "./useCase/lockOutSegmentUseCase.js";
import { LogInUseCase, type LogInUseCase as LogIn } from "./useCase/logInUseCase.js";
import { LogOutUseCase, type LogOutUseCase as LogOut } from "./useCase/logOutUseCase.js";
import { RecordEgressUseCase, type RecordEgressUseCase as RecordEgress } from "./useCase/recordEgressUseCase.js";
import { RecordEquipmentCheckUseCase, type RecordEquipmentCheckUseCase as RecordEquipmentCheck } from "./useCase/recordEquipmentCheckUseCase.js";
import { RecordReturnUseCase, type RecordReturnUseCase as RecordReturn } from "./useCase/recordReturnUseCase.js";
import { RegisterSegmentUseCase, type RegisterSegmentUseCase as RegisterSegment } from "./useCase/registerSegmentUseCase.js";
import { RegisterWorkerUseCase, type RegisterWorkerUseCase as RegisterWorker } from "./useCase/registerWorkerUseCase.js";
import { ReleaseLockoutUseCase, type ReleaseLockoutUseCase as ReleaseLockout } from "./useCase/releaseLockoutUseCase.js";
import { ReportSpaceWeatherUseCase, type ReportSpaceWeatherUseCase as ReportSpaceWeather } from "./useCase/reportSpaceWeatherUseCase.js";
import { RequestPermitUseCase, type RequestPermitUseCase as RequestPermit } from "./useCase/requestPermitUseCase.js";
import { ResetUserPasswordUseCase, type ResetUserPasswordUseCase as ResetUserPassword } from "./useCase/resetUserPasswordUseCase.js";
import {
  SetUpInitialAdminUseCase,
  type SetUpInitialAdminUseCase as SetUpInitialAdmin,
} from "./useCase/setUpInitialAdminUseCase.js";
import { UpdateSegmentUseCase, type UpdateSegmentUseCase as UpdateSegment } from "./useCase/updateSegmentUseCase.js";
import { UpdateUserUseCase, type UpdateUserUseCase as UpdateUser } from "./useCase/updateUserUseCase.js";
import { UpdateWorkerUseCase, type UpdateWorkerUseCase as UpdateWorker } from "./useCase/updateWorkerUseCase.js";

export type ApplicationDependencies = Readonly<{
  sessionByTokenHashResolver: SessionByTokenHashResolver;
  authenticatedUserByIdResolver: UserByIdResolver;
  installationStatusQuery: InstallationStatusQuery;
  setUpInitialAdmin: SetUpInitialAdmin;
  logIn: LogIn;
  logOut: LogOut;
  getDashboard: GetDashboard;
  listUsers: ListUsers;
  createUser: CreateUser;
  updateUser: UpdateUser;
  resetUserPassword: ResetUserPassword;
  deleteUser: DeleteUser;
  listSegments: ListSegments;
  getSegment: GetSegment;
  registerSegment: RegisterSegment;
  updateSegment: UpdateSegment;
  deleteSegment: DeleteSegment;
  lockOutSegment: LockOutSegment;
  releaseLockout: ReleaseLockout;
  listWorkers: ListWorkers;
  getWorker: GetWorker;
  registerWorker: RegisterWorker;
  updateWorker: UpdateWorker;
  deleteWorker: DeleteWorker;
  listPermits: ListPermits;
  getPermit: GetPermit;
  requestPermit: RequestPermit;
  recordEquipmentCheck: RecordEquipmentCheck;
  approveEva: ApproveEva;
  recordEgress: RecordEgress;
  recordReturn: RecordReturn;
  closePermit: ClosePermit;
  abortPermit: AbortPermit;
  listSpaceWeather: ListSpaceWeather;
  reportSpaceWeather: ReportSpaceWeather;
  listEvents: ListEvents;
  baseCommanderIsOutside: () => boolean;
  clock: Clock;
  isProduction: boolean;
}>;

type CompositionOptions = Readonly<{
  baseCommanderIsOutside?: () => boolean;
  clock?: Clock;
  isProduction: boolean;
}>;

/** 教材の簡略化。日の出基地の月面日は、基準日からの経過日数を 29 日周期に畳んで求める */
const LUNAR_CYCLE_DAYS = 29;
const lunarEpochMs = Date.parse("2026-01-01T00:00:00.000Z");
const lunarDayAt = (date: Date) => {
  const elapsedDays = Math.floor((date.getTime() - lunarEpochMs) / 86_400_000);
  const index = ((elapsedDays % LUNAR_CYCLE_DAYS) + LUNAR_CYCLE_DAYS) % LUNAR_CYCLE_DAYS;
  return LunarDay.schema.parse(index + 1);
};

/** 地球時（UTC）と月面日。副作用はここに閉じ、use case は Clock を受け取るだけにする */
const systemClock: Clock = {
  now: () => Timestamp.schema.parse(new Date().toISOString()),
  lunarDay: () => lunarDayAt(new Date()),
};
const eventIdGenerator: EventIdGenerator = {
  generate: () => EventId.schema.parse(randomUUID()),
};
const userIdGenerator = {
  generate: () => UserId.schema.parse(randomUUID()),
} as const;
const sessionIdGenerator = {
  generate: () => SessionId.schema.parse(randomUUID()),
} as const;
const equipmentCheckIdGenerator = {
  generate: () => EquipmentCheckId.schema.parse(randomUUID()),
} as const;
const spaceWeatherReportIdGenerator = {
  generate: () => SpaceWeatherReportId.schema.parse(randomUUID()),
} as const;
const dummyPasswordHash = PasswordHash.schema.parse(
  `scrypt$${"D".repeat(22)}==$${"E".repeat(86)}==`,
);

export const createApplicationDependencies = (
  database: SqliteDatabase,
  options: CompositionOptions,
): ApplicationDependencies => {
  const clock = options.clock ?? systemClock;
  const baseCommanderIsOutside = options.baseCommanderIsOutside ?? (() => false);

  const sessionByTokenHashResolver = createSessionByTokenHashResolver(database);
  const sessionByIdResolver = createSessionByIdResolver(database);
  const authenticatedUserByIdResolver = createUserByIdResolver(database);
  const installationStatusQuery = createInstallationStatusQuery(database);
  const loginUserByEmailResolver = createUserByEmailResolver(database);
  const userByIdResolver = createUserByIdResolver(database);
  const userByEmailResolver = createUserByEmailResolver(database);
  const userListResolver = createUserListResolver(database);
  const segmentByIdResolver = createSegmentByIdResolver(database);
  const segmentListResolver = createSegmentListResolver(database);
  const workerByIdResolver = createWorkerByIdResolver(database);
  const workerListResolver = createWorkerListResolver(database);
  const permitByIdResolver = createPermitByIdResolver(database);
  const permitListResolver = createPermitListResolver(database);
  const equipmentCheckResolver = createEquipmentCheckByPermitIdResolver(database);
  const currentSpaceWeatherResolver = createCurrentSpaceWeatherResolver(database);
  const spaceWeatherListResolver = createSpaceWeatherListResolver(database);
  const eventHistoryReader = createEventHistoryReader(database);

  const sessionEventStore = createSessionEventStore(database);
  const initialAdminSetupStore = createInitialAdminSetupStore(database);
  const userEventStore = createUserEventStore(database);
  const userDeletedEventStore = createUserDeletedEventStore(database);
  const segmentRegisteredStore = createSegmentRegisteredStore(database);
  const segmentUpdatedStore = createSegmentUpdatedStore(database);
  const segmentDeletedStore = createSegmentDeletedStore(database);
  const lockoutTaggedStore = createLockoutTaggedStore(database);
  const lockoutRemovedStore = createLockoutRemovedStore(database);
  const workerRegisteredStore = createWorkerRegisteredStore(database);
  const workerUpdatedStore = createWorkerUpdatedStore(database);
  const workerDeletedStore = createWorkerDeletedStore(database);
  const permitEventStore = createPermitEventStore(database);
  const lockoutReleaseStore = createLockoutReleaseStore(database);
  const equipmentCheckEventStore = createEquipmentCheckEventStore(database);
  const spaceWeatherEventStore = createSpaceWeatherEventStore(database);

  return {
    sessionByTokenHashResolver,
    authenticatedUserByIdResolver,
    installationStatusQuery,
    setUpInitialAdmin: SetUpInitialAdminUseCase.create({
      initialAdminSetupStore,
      passwordHasher: scryptPasswordHasher,
      sessionTokenGenerator,
      clock,
      eventIdGenerator,
      userIdGenerator,
      sessionIdGenerator,
    }),
    logIn: LogInUseCase.create({
      userResolver: loginUserByEmailResolver,
      sessionCreatedStore: sessionEventStore,
      passwordHasher: scryptPasswordHasher,
      dummyPasswordHash,
      sessionTokenGenerator,
      clock,
      eventIdGenerator,
      sessionIdGenerator,
    }),
    logOut: LogOutUseCase.create({
      sessionResolver: sessionByIdResolver,
      sessionDeletedStore: sessionEventStore,
      clock,
      eventIdGenerator,
    }),
    getDashboard: GetDashboardUseCase.create({
      userResolver: userByIdResolver,
      permitListResolver,
      segmentListResolver,
      workerListResolver,
      spaceWeatherResolver: currentSpaceWeatherResolver,
    }),
    listUsers: ListUsersUseCase.create({
      userByIdResolver,
      userListResolver,
    }),
    createUser: CreateUserUseCase.create({
      userByIdResolver,
      userByEmailResolver,
      userCreatedStore: userEventStore,
      passwordHasher: scryptPasswordHasher,
      clock,
      eventIdGenerator,
      userIdGenerator,
    }),
    updateUser: UpdateUserUseCase.create({
      userByIdResolver,
      userByEmailResolver,
      userUpdatedStore: userEventStore,
      clock,
      eventIdGenerator,
    }),
    resetUserPassword: ResetUserPasswordUseCase.create({
      userResolver: userByIdResolver,
      userPasswordResetStore: userEventStore,
      passwordHasher: scryptPasswordHasher,
      clock,
      eventIdGenerator,
    }),
    deleteUser: DeleteUserUseCase.create({
      userByIdResolver,
      userListResolver,
      userDeletedStore: userDeletedEventStore,
      clock,
      eventIdGenerator,
    }),
    listSegments: ListSegmentsUseCase.create({
      userResolver: userByIdResolver,
      segmentResolver: segmentListResolver,
    }),
    getSegment: GetSegmentUseCase.create({
      userResolver: userByIdResolver,
      segmentResolver: segmentByIdResolver,
    }),
    registerSegment: RegisterSegmentUseCase.create({
      userResolver: userByIdResolver,
      segmentRegisteredStore,
      clock,
      eventIdGenerator,
    }),
    updateSegment: UpdateSegmentUseCase.create({
      userResolver: userByIdResolver,
      segmentResolver: segmentByIdResolver,
      segmentUpdatedStore,
      clock,
      eventIdGenerator,
    }),
    deleteSegment: DeleteSegmentUseCase.create({
      userResolver: userByIdResolver,
      segmentResolver: segmentByIdResolver,
      segmentDeletedStore,
      clock,
      eventIdGenerator,
    }),
    lockOutSegment: LockOutSegmentUseCase.create({
      userResolver: userByIdResolver,
      segmentResolver: segmentByIdResolver,
      permitResolver: permitByIdResolver,
      lockoutTaggedStore,
      clock,
      eventIdGenerator,
    }),
    releaseLockout: ReleaseLockoutUseCase.create({
      userResolver: userByIdResolver,
      segmentResolver: segmentByIdResolver,
      permitResolver: permitByIdResolver,
      lockoutRemovedStore,
      clock,
      eventIdGenerator,
    }),
    listWorkers: ListWorkersUseCase.create({
      userResolver: userByIdResolver,
      workerResolver: workerListResolver,
    }),
    getWorker: GetWorkerUseCase.create({
      userResolver: userByIdResolver,
      workerResolver: workerByIdResolver,
    }),
    registerWorker: RegisterWorkerUseCase.create({
      userResolver: userByIdResolver,
      workerRegisteredStore,
      clock,
      eventIdGenerator,
    }),
    updateWorker: UpdateWorkerUseCase.create({
      userResolver: userByIdResolver,
      workerResolver: workerByIdResolver,
      workerUpdatedStore,
      clock,
      eventIdGenerator,
    }),
    deleteWorker: DeleteWorkerUseCase.create({
      userResolver: userByIdResolver,
      workerResolver: workerByIdResolver,
      workerDeletedStore,
      clock,
      eventIdGenerator,
    }),
    listPermits: ListPermitsUseCase.create({
      userResolver: userByIdResolver,
      permitListResolver,
    }),
    getPermit: GetPermitUseCase.create({
      userResolver: userByIdResolver,
      permitResolver: permitByIdResolver,
      equipmentCheckResolver,
      segmentResolver: segmentByIdResolver,
    }),
    requestPermit: RequestPermitUseCase.create({
      userResolver: userByIdResolver,
      workerResolver: workerByIdResolver,
      segmentResolver: segmentByIdResolver,
      permitRequestedStore: permitEventStore,
      clock,
      eventIdGenerator,
    }),
    recordEquipmentCheck: RecordEquipmentCheckUseCase.create({
      userResolver: userByIdResolver,
      permitResolver: permitByIdResolver,
      equipmentCheckRecordedStore: equipmentCheckEventStore,
      equipmentCheckIdGenerator,
      clock,
      eventIdGenerator,
    }),
    approveEva: ApproveEvaUseCase.create({
      userResolver: userByIdResolver,
      permitResolver: permitByIdResolver,
      equipmentCheckResolver,
      workerResolver: workerByIdResolver,
      spaceWeatherResolver: currentSpaceWeatherResolver,
      segmentResolver: segmentByIdResolver,
      evaApprovedStore: permitEventStore,
      clock,
      eventIdGenerator,
      baseCommanderIsOutside,
    }),
    recordEgress: RecordEgressUseCase.create({
      userResolver: userByIdResolver,
      permitResolver: permitByIdResolver,
      crewEgressedStore: permitEventStore,
      clock,
      eventIdGenerator,
    }),
    recordReturn: RecordReturnUseCase.create({
      userResolver: userByIdResolver,
      permitResolver: permitByIdResolver,
      crewReturnedStore: permitEventStore,
      clock,
      eventIdGenerator,
    }),
    closePermit: ClosePermitUseCase.create({
      userResolver: userByIdResolver,
      permitResolver: permitByIdResolver,
      segmentResolver: segmentByIdResolver,
      lockoutReleaseStore,
      clock,
      eventIdGenerator,
    }),
    abortPermit: AbortPermitUseCase.create({
      userResolver: userByIdResolver,
      permitResolver: permitByIdResolver,
      permitAbortedStore: permitEventStore,
      clock,
      eventIdGenerator,
    }),
    listSpaceWeather: ListSpaceWeatherUseCase.create({
      userResolver: userByIdResolver,
      spaceWeatherResolver: spaceWeatherListResolver,
    }),
    reportSpaceWeather: ReportSpaceWeatherUseCase.create({
      userResolver: userByIdResolver,
      spaceWeatherReportedStore: spaceWeatherEventStore,
      reportIdGenerator: spaceWeatherReportIdGenerator,
      clock,
      eventIdGenerator,
    }),
    listEvents: ListEventsUseCase.create({
      userResolver: userByIdResolver,
      eventHistoryReader,
    }),
    baseCommanderIsOutside,
    clock,
    isProduction: options.isProduction,
  };
};

export const createApp = (dependencies: ApplicationDependencies) => {
  const app = new Hono<WebEnvironment>();

  app.use("*", secureHeaders());
  app.use("*", csrf());
  app.use(
    "*",
    inertia({ version: "1", rootView: createRootView(dependencies.isProduction) }),
  );
  app.use(
    "*",
    createAuthenticationMiddleware({
      sessionResolver: dependencies.sessionByTokenHashResolver,
      userResolver: dependencies.authenticatedUserByIdResolver,
      clock: dependencies.clock,
      isProduction: dependencies.isProduction,
    }),
  );
  app.use("*", createSharedPropsMiddleware());

  registerAuthRoutes(app, {
    installationStatusQuery: dependencies.installationStatusQuery,
    setUpInitialAdmin: dependencies.setUpInitialAdmin,
    logIn: dependencies.logIn,
    logOut: dependencies.logOut,
    clock: dependencies.clock,
    isProduction: dependencies.isProduction,
  });
  registerDashboardRoutes(app, {
    installationStatusQuery: dependencies.installationStatusQuery,
    getDashboard: dependencies.getDashboard,
  });
  registerUserRoutes(app, {
    listUsers: dependencies.listUsers,
    createUser: dependencies.createUser,
    updateUser: dependencies.updateUser,
    resetUserPassword: dependencies.resetUserPassword,
    deleteUser: dependencies.deleteUser,
  });
  registerSegmentRoutes(app, {
    listSegments: dependencies.listSegments,
    getSegment: dependencies.getSegment,
    registerSegment: dependencies.registerSegment,
    updateSegment: dependencies.updateSegment,
    deleteSegment: dependencies.deleteSegment,
    lockOutSegment: dependencies.lockOutSegment,
    releaseLockout: dependencies.releaseLockout,
  });
  registerWorkerRoutes(app, {
    listWorkers: dependencies.listWorkers,
    getWorker: dependencies.getWorker,
    registerWorker: dependencies.registerWorker,
    updateWorker: dependencies.updateWorker,
    deleteWorker: dependencies.deleteWorker,
  });
  registerPermitRoutes(app, {
    listPermits: dependencies.listPermits,
    getPermit: dependencies.getPermit,
    requestPermit: dependencies.requestPermit,
    recordEquipmentCheck: dependencies.recordEquipmentCheck,
    approveEva: dependencies.approveEva,
    recordEgress: dependencies.recordEgress,
    recordReturn: dependencies.recordReturn,
    closePermit: dependencies.closePermit,
    abortPermit: dependencies.abortPermit,
    listSegments: dependencies.listSegments,
    listWorkers: dependencies.listWorkers,
    baseCommanderIsOutside: dependencies.baseCommanderIsOutside,
  });
  registerSpaceWeatherRoutes(app, {
    listSpaceWeather: dependencies.listSpaceWeather,
    reportSpaceWeather: dependencies.reportSpaceWeather,
  });
  registerEventRoutes(app, { listEvents: dependencies.listEvents });

  app.onError((error) =>
    error instanceof HTTPException
      ? error.getResponse()
      : new Response("Internal Server Error", { status: 500 }),
  );
  return app;
};

export type DatabaseBackedApplicationOptions = Readonly<{
  databasePath: string;
  migrationsFolder: string;
  isProduction: boolean;
}>;

export const createDatabaseBackedApp = (
  options: DatabaseBackedApplicationOptions,
) => {
  const database = createSqliteDatabase(options.databasePath);
  migrateDatabase(database, options.migrationsFolder);
  return createApp(
    createApplicationDependencies(database, {
      isProduction: options.isProduction,
    }),
  );
};
