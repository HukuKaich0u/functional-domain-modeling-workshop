import { err, ok, ResultAsync } from "neverthrow";

import type {
  Approved,
  EvaApproved,
  EvaPermit,
  PermitId,
  Requested,
} from "../domain/permit/index.js";
import type { PermitResolver } from "../useCase/dependencies.js";
import type { PermitConflict } from "../useCase/errors.js";

export type PermitStore = PermitResolver &
  Readonly<{
    atomicStore: Readonly<{
      store: (event: EvaApproved) => ResultAsync<void, PermitConflict>;
    }>;
    workLog: Readonly<{ append: (event: EvaApproved) => Promise<void> }>;
    find: (permitId: string) => EvaPermit | undefined;
    reset: () => Requested;
    save: (permit: EvaPermit) => void;
    stateStore: Readonly<{ save: (permit: Approved) => Promise<void> }>;
  }>;

export const createInMemoryPermitStore = (
  initial: Requested,
  options: Readonly<{ failWorkLog?: boolean }> = {},
): PermitStore => {
  let permit: EvaPermit = initial;
  let events: ReadonlyArray<EvaApproved> = [];
  const find = (permitId: string | PermitId) =>
    permit.permitId === permitId ? permit : undefined;

  return {
    find,
    resolveById: find,
    reset: () => {
      permit = initial;
      events = [];
      return initial;
    },
    save: (next) => {
      permit = next;
    },
    stateStore: {
      save: async (next) => {
        permit = next;
      },
    },
    workLog: {
      append: async (event) => {
        if (options.failWorkLog === true) throw new Error("Work log unavailable");
        events = [...events, event];
      },
    },
    atomicStore: {
      store: (event) =>
        ResultAsync.fromSafePromise(
          (async () => {
            if (options.failWorkLog === true) {
              throw new Error("Work log unavailable");
            }
            const current = find(event.permitId);
            if (current === undefined || current.kind !== "Requested") {
              return err({
                kind: "PermitConflict",
                permitId: event.permitId,
              } as const);
            }
            permit = event.aggregateState;
            events = [...events, event];
            return ok(undefined);
          })(),
        ).andThen((result) => result),
    },
  };
};
