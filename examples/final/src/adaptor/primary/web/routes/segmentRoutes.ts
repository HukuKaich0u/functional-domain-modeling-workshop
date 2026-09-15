import type { Context, Hono } from "hono";
import { z } from "zod";

import { PermitId } from "../../../../domain/permit/index.js";
import { SegmentId, SegmentLabel } from "../../../../domain/segment/index.js";
import type { Segment, SegmentId as SegmentIdType } from "../../../../domain/segment/index.js";
import type { DeleteSegmentUseCase } from "../../../../useCase/deleteSegmentUseCase.js";
import type { GetSegmentUseCase } from "../../../../useCase/getSegmentUseCase.js";
import type { ListSegmentsUseCase } from "../../../../useCase/listSegmentsUseCase.js";
import type { LockOutSegmentUseCase } from "../../../../useCase/lockOutSegmentUseCase.js";
import type { RegisterSegmentUseCase } from "../../../../useCase/registerSegmentUseCase.js";
import type { ReleaseLockoutUseCase } from "../../../../useCase/releaseLockoutUseCase.js";
import type { UpdateSegmentUseCase } from "../../../../useCase/updateSegmentUseCase.js";
import {
  parseBody,
  parseIdentifier,
  requireActor,
  requireElectrician,
  requireGroundControl,
} from "../middleware/requestBody.js";
import { withSharedProps } from "../middleware/sharedProps.js";
import { assertNever, respondToUseCaseError } from "../middleware/useCaseResponse.js";
import type { AuthenticatedActor, FieldErrors, WebEnvironment } from "../pageProps.js";

const RegisterSegmentFormSchema = z.object({
  segmentId: SegmentId.schema,
  label: SegmentLabel.schema,
});
const UpdateSegmentFormSchema = z.object({ label: SegmentLabel.schema });
const LockoutFormSchema = z.object({ permitId: PermitId.schema });
const SegmentErrorSchema = z.enum([
  "segment-in-use",
  "segment-already-locked-out",
  "segment-not-locked-out",
  "permit-not-found",
  "invalid-permit-state",
  "zone-segment-mismatch",
  "lockout-tagged-by-another-user",
  "permit-still-outside",
  "segment-conflict",
]);

type SegmentRouteDependencies = Readonly<{
  listSegments: ListSegmentsUseCase;
  getSegment: GetSegmentUseCase;
  registerSegment: RegisterSegmentUseCase;
  updateSegment: UpdateSegmentUseCase;
  deleteSegment: DeleteSegmentUseCase;
  lockOutSegment: LockOutSegmentUseCase;
  releaseLockout: ReleaseLockoutUseCase;
}>;

/** 遮断盤に貼る表現。掛けた者は userId のまま出し、表示名は出さない */
export type SegmentPageView = Readonly<{
  segmentId: SegmentIdType;
  label: string;
  lockout:
    | Readonly<{ kind: "Energized" }>
    | Readonly<{ kind: "LockedOut"; permitId: string; taggedBy: string; taggedAt: string }>;
}>;
export type SegmentActions = Readonly<{
  edit: boolean;
  delete: boolean;
  lockout: boolean;
  release: boolean;
}>;

export const toSegmentPageView = (segment: Segment): SegmentPageView => ({
  segmentId: segment.segmentId,
  label: segment.label,
  lockout:
    segment.lockout.kind === "Energized"
      ? { kind: "Energized" }
      : {
          kind: "LockedOut",
          permitId: segment.lockout.permitId,
          taggedBy: segment.lockout.taggedBy,
          taggedAt: segment.lockout.taggedAt,
        },
});

const actionsFor = (actor: AuthenticatedActor, segment: Segment): SegmentActions => {
  const groundControl = actor.user.kind === "Admin" || actor.user.kind === "GroundControl";
  const electrician = actor.user.kind === "Admin" || actor.user.kind === "Electrician";
  return {
    edit: groundControl,
    delete: groundControl && segment.lockout.kind === "Energized",
    lockout: electrician && segment.lockout.kind === "Energized",
    release: electrician && segment.lockout.kind === "LockedOut",
  };
};

const segmentErrors = (raw: string | undefined): FieldErrors => {
  const parsed = SegmentErrorSchema.safeParse(raw);
  if (!parsed.success) return {};
  const code = parsed.data;
  switch (code) {
    case "segment-in-use":
      return { form: "遮断中、または進行中の作業許可がある系統区間は削除できません。" };
    case "segment-already-locked-out":
      return { form: "この系統区間には既に遮断札が掛かっています。" };
    case "segment-not-locked-out":
      return { form: "この系統区間に遮断札は掛かっていません。" };
    case "permit-not-found":
      return { permitId: "入力した作業許可が見つかりません。" };
    case "invalid-permit-state":
      return { permitId: "遮断札を掛けられるのは申請済の作業許可だけです。" };
    case "zone-segment-mismatch":
      return { permitId: "作業許可の作業区画と、この系統区間が一致しません。（事故報告 第3号）" };
    case "lockout-tagged-by-another-user":
      return { form: "遮断札は掛けた電気主任だけが外せます。（規程第3条）" };
    case "permit-still-outside":
      return { form: "隊員が出発した後の札は、帰還後に完了の手続きで外します。" };
    case "segment-conflict":
      return { form: "系統区間がほかの操作によって更新されました。最新の状態を確認してください。" };
    default:
      return assertNever(code);
  }
};

const parseSegmentId = (context: Context<WebEnvironment>, raw: string) =>
  parseIdentifier(context, SegmentId.schema, raw);
const detailUrl = (segmentId: SegmentIdType): string => `/segments/${segmentId}`;
const redirectWithError = (
  context: Context<WebEnvironment>,
  segmentId: SegmentIdType,
  code: z.infer<typeof SegmentErrorSchema>,
): Response => context.redirect(`${detailUrl(segmentId)}?error=${code}`, 303);

const renderCreate = (context: Context<WebEnvironment>, errors: FieldErrors = {}) =>
  context.render(
    "Segments/Form",
    withSharedProps(context, {
      mode: "create" as const,
      segment: null,
      actions: null,
      errors,
    }),
  );

const renderSegment = async (
  context: Context<WebEnvironment>,
  dependencies: SegmentRouteDependencies,
  segmentId: SegmentIdType,
  errors: FieldErrors = {},
): Promise<Response> => {
  const actor = requireActor(context);
  if (actor.isErr()) return actor.error;
  return dependencies.getSegment
    .run({ actorUserId: actor.value.user.userId, segmentId })
    .match(
      ({ segment }) =>
        context.render(
          "Segments/Form",
          withSharedProps(context, {
            mode: "edit" as const,
            segment: toSegmentPageView(segment),
            actions: actionsFor(actor.value, segment),
            errors,
          }),
        ),
      (error) => {
        switch (error.kind) {
          case "Unauthorized":
            return respondToUseCaseError(context, { kind: "Unauthorized" });
          case "SegmentNotFound":
            return respondToUseCaseError(context, { kind: "NotFound" });
          default:
            return assertNever(error);
        }
      },
    );
};

export const registerSegmentRoutes = (
  app: Hono<WebEnvironment>,
  dependencies: SegmentRouteDependencies,
): void => {
  app.get("/segments", async (context) => {
    const actor = requireActor(context);
    if (actor.isErr()) return actor.error;
    return dependencies.listSegments
      .run({ actorUserId: actor.value.user.userId })
      .match(
        ({ segments }) =>
          context.render(
            "Segments/Index",
            withSharedProps(context, {
              segments: segments.map(toSegmentPageView),
              canRegister:
                actor.value.user.kind === "Admin" || actor.value.user.kind === "GroundControl",
            }),
          ),
        () => respondToUseCaseError(context, { kind: "Unauthorized" }),
      );
  });

  app.get("/segments/new", (context) => {
    const actor = requireGroundControl(context);
    return actor.match(
      () => renderCreate(context),
      (response) => response,
    );
  });

  app.post("/segments", async (context) => {
    const actor = requireGroundControl(context);
    if (actor.isErr()) return actor.error;
    const parsed = await parseBody(context, RegisterSegmentFormSchema);
    if (parsed.isErr()) return renderCreate(context, parsed.error.errors);
    return dependencies.registerSegment
      .run({ actorUserId: actor.value.user.userId, ...parsed.value })
      .match(
        ({ segment }) => context.redirect(detailUrl(segment.segmentId), 303),
        (error) => {
          switch (error.kind) {
            case "Unauthorized":
              return respondToUseCaseError(context, { kind: "Unauthorized" });
            case "SegmentAlreadyExists":
              return renderCreate(context, { segmentId: "この系統区間は既に登録されています。" });
            case "IdentityGenerationFailed":
              return respondToUseCaseError(context, { kind: "InternalServerError" });
            default:
              return assertNever(error);
          }
        },
      );
  });

  app.get("/segments/:segmentId", (context) => {
    const segmentId = parseSegmentId(context, context.req.param("segmentId"));
    return segmentId.match(
      (value) =>
        renderSegment(context, dependencies, value, segmentErrors(context.req.query("error"))),
      (response) => response,
    );
  });

  app.post("/segments/:segmentId", async (context) => {
    const actor = requireGroundControl(context);
    if (actor.isErr()) return actor.error;
    const segmentId = parseSegmentId(context, context.req.param("segmentId"));
    if (segmentId.isErr()) return segmentId.error;
    const parsed = await parseBody(context, UpdateSegmentFormSchema);
    if (parsed.isErr()) {
      return renderSegment(context, dependencies, segmentId.value, parsed.error.errors);
    }
    return dependencies.updateSegment
      .run({ actorUserId: actor.value.user.userId, segmentId: segmentId.value, ...parsed.value })
      .match(
        () => context.redirect("/segments", 303),
        (error) => {
          switch (error.kind) {
            case "Unauthorized":
              return respondToUseCaseError(context, { kind: "Unauthorized" });
            case "SegmentNotFound":
              return respondToUseCaseError(context, { kind: "NotFound" });
            case "IdentityGenerationFailed":
              return respondToUseCaseError(context, { kind: "InternalServerError" });
            default:
              return assertNever(error);
          }
        },
      );
  });

  app.post("/segments/:segmentId/delete", async (context) => {
    const actor = requireGroundControl(context);
    if (actor.isErr()) return actor.error;
    const segmentId = parseSegmentId(context, context.req.param("segmentId"));
    if (segmentId.isErr()) return segmentId.error;
    return dependencies.deleteSegment
      .run({ actorUserId: actor.value.user.userId, segmentId: segmentId.value })
      .match(
        () => context.redirect("/segments", 303),
        (error) => {
          switch (error.kind) {
            case "Unauthorized":
              return respondToUseCaseError(context, { kind: "Unauthorized" });
            case "SegmentNotFound":
              return respondToUseCaseError(context, { kind: "NotFound" });
            case "SegmentInUse":
              return redirectWithError(context, segmentId.value, "segment-in-use");
            case "IdentityGenerationFailed":
              return respondToUseCaseError(context, { kind: "InternalServerError" });
            default:
              return assertNever(error);
          }
        },
      );
  });

  /** 遮断して札を掛ける。札には作業許可番号を書く（規程第3条） */
  app.post("/segments/:segmentId/lockout", async (context) => {
    const actor = requireElectrician(context);
    if (actor.isErr()) return actor.error;
    const segmentId = parseSegmentId(context, context.req.param("segmentId"));
    if (segmentId.isErr()) return segmentId.error;
    const parsed = await parseBody(context, LockoutFormSchema);
    if (parsed.isErr()) {
      return renderSegment(context, dependencies, segmentId.value, parsed.error.errors);
    }
    return dependencies.lockOutSegment
      .run({
        actorUserId: actor.value.user.userId,
        segmentId: segmentId.value,
        permitId: parsed.value.permitId,
      })
      .match(
        () => context.redirect(detailUrl(segmentId.value), 303),
        (error) => {
          switch (error.kind) {
            case "Unauthorized":
              return respondToUseCaseError(context, { kind: "Unauthorized" });
            case "SegmentNotFound":
              return respondToUseCaseError(context, { kind: "NotFound" });
            case "SegmentAlreadyLockedOut":
              return redirectWithError(context, segmentId.value, "segment-already-locked-out");
            case "PermitNotFound":
              return redirectWithError(context, segmentId.value, "permit-not-found");
            case "InvalidPermitState":
              return redirectWithError(context, segmentId.value, "invalid-permit-state");
            case "ZoneSegmentMismatch":
              return redirectWithError(context, segmentId.value, "zone-segment-mismatch");
            case "SegmentConflict":
              return redirectWithError(context, segmentId.value, "segment-conflict");
            case "IdentityGenerationFailed":
              return respondToUseCaseError(context, { kind: "InternalServerError" });
            default:
              return assertNever(error);
          }
        },
      );
  });

  /** 出発前に中止された許可などの札を、掛けた者が外す */
  app.post("/segments/:segmentId/release", async (context) => {
    const actor = requireElectrician(context);
    if (actor.isErr()) return actor.error;
    const segmentId = parseSegmentId(context, context.req.param("segmentId"));
    if (segmentId.isErr()) return segmentId.error;
    return dependencies.releaseLockout
      .run({ actorUserId: actor.value.user.userId, segmentId: segmentId.value })
      .match(
        () => context.redirect(detailUrl(segmentId.value), 303),
        (error) => {
          switch (error.kind) {
            case "Unauthorized":
              return respondToUseCaseError(context, { kind: "Unauthorized" });
            case "SegmentNotFound":
              return respondToUseCaseError(context, { kind: "NotFound" });
            case "SegmentNotLockedOut":
              return redirectWithError(context, segmentId.value, "segment-not-locked-out");
            case "LockoutTaggedByAnotherUser":
              return redirectWithError(context, segmentId.value, "lockout-tagged-by-another-user");
            case "PermitNotFound":
              return redirectWithError(context, segmentId.value, "permit-not-found");
            case "PermitStillOutside":
              return redirectWithError(context, segmentId.value, "permit-still-outside");
            case "SegmentConflict":
              return redirectWithError(context, segmentId.value, "segment-conflict");
            case "IdentityGenerationFailed":
              return respondToUseCaseError(context, { kind: "InternalServerError" });
            default:
              return assertNever(error);
          }
        },
      );
  });
};
