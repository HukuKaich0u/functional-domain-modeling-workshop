import type { Worker } from "../domain/worker/index.js";

/** 被ばく量は Sensitive のまま渡す。表示側が明示的に unwrap する */
export type WorkerView = Worker;

export const toWorkerView = (worker: Worker): WorkerView => worker;
