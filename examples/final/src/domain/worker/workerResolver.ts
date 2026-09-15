import type { ResultAsync } from "neverthrow";

import type { Worker } from "./worker.js";
import type { WorkerId } from "./workerId.js";

export type WorkerByIdResolver = Readonly<{
  resolveById: (workerId: WorkerId) => ResultAsync<Worker | undefined, never>;
}>;

export type WorkerListResolver = Readonly<{
  resolveAll: () => ResultAsync<readonly Worker[], never>;
}>;
