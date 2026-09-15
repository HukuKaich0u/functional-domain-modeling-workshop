import { err, ok, ResultAsync } from "neverthrow";

import type {
  EvaApproved,
  EvaPermit,
  PermitId,
} from "../domain/permit/index.js";
import type {
  EvaApprovedStore,
  PermitResolver,
} from "../useCase/dependencies.js";

export type InMemoryEvaApprovedStore = Readonly<{
  resolver: PermitResolver;
  store: EvaApprovedStore;
  permits: () => ReadonlyArray<EvaPermit>;
  events: () => ReadonlyArray<EvaApproved>;
  replace: (permit: EvaPermit) => void;
  reset: (permits: ReadonlyArray<EvaPermit>) => void;
  storeCalls: () => number;
}>;

export type InMemoryStoreOptions = Readonly<{
  beforeCommit?: (event: EvaApproved) => Promise<void>;
}>;

export const createInMemoryEvaApprovedStore = (
  initialPermits: ReadonlyArray<EvaPermit>,
  options: InMemoryStoreOptions = {},
): InMemoryEvaApprovedStore => {
  let permits = new Map<PermitId, EvaPermit>(
    initialPermits.map((permit) => [permit.permitId, permit]),
  );
  let events: ReadonlyArray<EvaApproved> = [];
  let storeCalls = 0;

  const resolver: PermitResolver = {
    resolveById: (permitId) => permits.get(permitId),
  };

  const store: EvaApprovedStore = {
    store: (event) => {
      storeCalls += 1;
      return ResultAsync.fromSafePromise(
        (async () => {
          await options.beforeCommit?.(event);
          const current = permits.get(event.permitId);
          if (current === undefined) {
            throw new Error(`Permit missing at commit: ${event.permitId}`);
          }
          if (current.kind !== "Requested") {
            return err({
              kind: "PermitConflict",
              permitId: event.permitId,
            } as const);
          }

          const nextPermits = new Map(permits);
          nextPermits.set(event.permitId, event.aggregateState);
          const nextEvents = [...events, event];

          permits = nextPermits;
          events = nextEvents;

          return ok(undefined);
        })(),
      ).andThen((result) => result);
    },
  };

  return {
    resolver,
    store,
    permits: () => [...permits.values()],
    events: () => [...events],
    replace: (permit) => {
      const nextPermits = new Map(permits);
      nextPermits.set(permit.permitId, permit);
      permits = nextPermits;
    },
    reset: (nextPermits) => {
      permits = new Map(nextPermits.map((permit) => [permit.permitId, permit]));
      events = [];
      storeCalls = 0;
    },
    storeCalls: () => storeCalls,
  };
};
