import type { Context } from "hono";
import { err, ok, ResultAsync, type Result } from "neverthrow";
import type { z } from "zod";

import type { AuthenticatedActor, WebEnvironment } from "../pageProps.js";
import { issuesToFieldErrors, respondToUseCaseError, type ValidationError } from "./useCaseResponse.js";

/**
 * 外部から来た値の境界。フォームでも JSON でも、zod schema を通った値だけが先へ進む。
 * 宇宙天気の報告は地上管制のシステムから JSON で届くこともある。
 */
export const parseBody = <TOutput, TInput>(
  context: Context<WebEnvironment>,
  schema: z.ZodType<TOutput, z.ZodTypeDef, TInput>,
): ResultAsync<TOutput, ValidationError> =>
  ResultAsync.fromPromise(
    context.req.header("content-type")?.startsWith("application/json") === true
      ? context.req.json()
      : context.req.parseBody(),
    (): ValidationError => ({
      kind: "ValidationError",
      errors: { form: "入力内容を確認してください" },
    }),
  ).andThen((body) => {
    const parsed = schema.safeParse(body);
    return parsed.success
      ? ok(parsed.data)
      : err({
          kind: "ValidationError",
          errors: issuesToFieldErrors(parsed.error.issues),
        } as const satisfies ValidationError);
  });

/** URL の識別子を branded 型へ。書式が違えば存在しない扱いにする */
export const parseIdentifier = <T>(
  context: Context<WebEnvironment>,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  raw: string,
): Result<T, Response> => {
  const parsed = schema.safeParse(raw);
  return parsed.success
    ? ok(parsed.data)
    : err(respondToUseCaseError(context, { kind: "NotFound" }));
};

export const requireActor = (
  context: Context<WebEnvironment>,
): Result<AuthenticatedActor, Response> => {
  const actor = context.get("actor");
  return actor === undefined
    ? err(respondToUseCaseError(context, { kind: "Unauthenticated" }))
    : ok(actor);
};

const requireRole =
  (allowed: readonly AuthenticatedActor["user"]["kind"][]) =>
  (context: Context<WebEnvironment>): Result<AuthenticatedActor, Response> =>
    requireActor(context).andThen((actor) =>
      allowed.includes(actor.user.kind)
        ? ok(actor)
        : err(respondToUseCaseError(context, { kind: "Unauthorized" })),
    );

/** 地上管制。系統区間・隊員の登録、作業許可の申請、宇宙天気の報告 */
export const requireGroundControl = requireRole(["Admin", "GroundControl"]);
/** 基地長。装備点検、開始承認、出発と帰還の記録 */
export const requireBaseCommander = requireRole(["Admin", "BaseCommander"]);
/** 電気主任。遮断札と完了 */
export const requireElectrician = requireRole(["Admin", "Electrician"]);
/** 中止は地上管制または基地長 */
export const requireAbortAuthority = requireRole(["Admin", "GroundControl", "BaseCommander"]);
