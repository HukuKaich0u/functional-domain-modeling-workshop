import { ResultAsync } from "neverthrow";

import type { Clock } from "../domain/aggregate/clock.js";
import type { EventContext } from "../domain/aggregate/eventContext.js";
import type { EventIdGenerator } from "../domain/aggregate/eventIdGenerator.js";
import type { UserId } from "../domain/user/userId.js";
import type { IdentityGenerationFailed } from "./errors.js";

export type EventContextDependencies = Readonly<{
  clock: Clock;
  eventIdGenerator: EventIdGenerator;
}>;

/** 時刻、月面日、記録IDを1回の実行で一度だけ生成する */
export const createEventContext = (
  dependencies: EventContextDependencies,
  actorUserId: UserId,
): EventContext => ({
  eventId: dependencies.eventIdGenerator.generate(),
  occurredAt: dependencies.clock.now(),
  lunarDay: dependencies.clock.lunarDay(),
  actorUserId,
});

/** 生成が例外を投げる場合を IdentityGenerationFailed に写す */
export const createEvent = <T>(produce: () => T) =>
  ResultAsync.fromPromise(
    Promise.resolve().then(produce),
    (): IdentityGenerationFailed => ({ kind: "IdentityGenerationFailed" }),
  );
