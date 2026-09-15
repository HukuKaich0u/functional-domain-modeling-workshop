import type { ResultAsync } from "neverthrow";

import type { UserId } from "../domain/user/userId.js";
import type { UserByIdResolver } from "../domain/user/userResolver.js";
import type {
  EventHistoryReader,
  SanitizedAuditRecord,
} from "../domain/audit/eventHistoryReader.js";
import { ensureAdmin } from "./authorization.js";
import { ensureUserFound, type UnauthorizedError } from "./errors.js";

export type EventView = SanitizedAuditRecord;
export type UseCaseInput = Readonly<{ actorUserId: UserId }>;
export type UseCaseOk = Readonly<{ events: readonly EventView[] }>;
export type UseCaseError = UnauthorizedError;
export type UseCaseOutput = ResultAsync<UseCaseOk, UseCaseError>;
export type Dependencies = Readonly<{
  userResolver: UserByIdResolver;
  eventHistoryReader: EventHistoryReader;
}>;
export type ListEventsUseCase = Readonly<{
  run: (input: UseCaseInput) => UseCaseOutput;
}>;

/** 作業記録の閲覧は Admin だけ。読み手は伏せた値しか受け取らない */
const run =
  (dependencies: Dependencies) =>
  (input: UseCaseInput): UseCaseOutput =>
    dependencies.userResolver
      .resolveById(input.actorUserId)
      .andThen(ensureUserFound(input.actorUserId))
      .andThen(ensureAdmin)
      .andThen((admin) => dependencies.eventHistoryReader.list(admin))
      .map((events) => ({ events }));

export const ListEventsUseCase = {
  create: (dependencies: Dependencies): ListEventsUseCase => ({
    run: run(dependencies),
  }),
} as const;
