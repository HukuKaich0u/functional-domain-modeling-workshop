import type { EventContext } from "../aggregate/eventContext.js";
import type { CumulativeDose } from "./cumulativeDose.js";
import {
  createWorkerDeleted,
  createWorkerRegistered,
  createWorkerUpdated,
  type WorkerDeleted,
  type WorkerRegistered,
  type WorkerUpdated,
} from "./workerEvent.js";
import type { WorkerId } from "./workerId.js";
import type { WorkerQualification } from "./workerQualification.js";

export type Worker = Readonly<{
  workerId: WorkerId;
  qualification: WorkerQualification;
  cumulativeDoseMicroSv: CumulativeDose;
}>;

export type WorkerProfile = Readonly<Omit<Worker, "workerId">>;

const register = (context: EventContext) => (worker: Worker): WorkerRegistered =>
  createWorkerRegistered(context, worker);

/** 医務が累積線量を更新する。値は Sensitive のまま状態に入る */
const update =
  (context: EventContext) =>
  (worker: Worker, profile: WorkerProfile): WorkerUpdated =>
    createWorkerUpdated(context, { workerId: worker.workerId, ...profile } as const satisfies Worker);

const remove = (context: EventContext) => (worker: Worker): WorkerDeleted =>
  createWorkerDeleted(context, worker.workerId);

export const Worker = {
  register,
  update,
  delete: remove,
} as const;
