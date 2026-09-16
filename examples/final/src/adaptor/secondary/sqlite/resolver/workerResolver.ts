import { eq } from "drizzle-orm";
import { ResultAsync } from "neverthrow";
import { z } from "zod";

import { RadiationExposure, WorkerId, WorkerQualification } from "../../../../domain/worker/index.js";
import type {
  Worker,
  WorkerByIdResolver,
  WorkerListResolver,
} from "../../../../domain/worker/index.js";
import type { SqliteDatabase } from "../db.js";
import { workersTable } from "../schema.js";

const WorkerRowSchema = z.object({
  workerId: WorkerId.schema,
  qualification: WorkerQualification.schema,
  radiationExposureMicroSv: RadiationExposure.schema,
});

/** 行から隊員を組み立てる。被ばく量はこの時点で Sensitive に包まれる */
export const parseWorkerRow = (raw: unknown): Worker => WorkerRowSchema.parse(raw);

export const createWorkerByIdResolver = (db: SqliteDatabase): WorkerByIdResolver => ({
  resolveById: (workerId) =>
    ResultAsync.fromSafePromise(
      Promise.resolve().then(() => {
        const row = db.select().from(workersTable).where(eq(workersTable.workerId, workerId)).get();
        return row === undefined ? undefined : parseWorkerRow(row);
      }),
    ),
});

export const createWorkerListResolver = (db: SqliteDatabase): WorkerListResolver => ({
  resolveAll: () =>
    ResultAsync.fromSafePromise(
      Promise.resolve().then(() => db.select().from(workersTable).all().map(parseWorkerRow)),
    ),
});
