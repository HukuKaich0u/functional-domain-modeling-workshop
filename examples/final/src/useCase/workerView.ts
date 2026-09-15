import type { Worker } from "../domain/worker/index.js";

/** 累積線量は Sensitive のまま渡す。表示側が明示的に unwrap する */
export type WorkerView = Worker;

export const toWorkerView = (worker: Worker): WorkerView => worker;
