import type { Context, Hono } from "hono";
import { err, ok, type Result } from "neverthrow";
import { z } from "zod";

import { EquipmentNote, OxygenMinutes } from "../../../../domain/equipmentCheck/index.js";
import {
  AbortReason,
  EmergencyReason,
  PermitId,
  PermitPurpose,
  PlannedMinutes,
  ZoneId,
} from "../../../../domain/permit/index.js";
import type { PermitId as PermitIdType } from "../../../../domain/permit/index.js";
import { WorkerId } from "../../../../domain/worker/index.js";
import type { AbortPermitUseCase } from "../../../../useCase/abortPermitUseCase.js";
import type { ApproveEvaUseCase } from "../../../../useCase/approveEvaUseCase.js";
import type { ClosePermitUseCase } from "../../../../useCase/closePermitUseCase.js";
import type {
  EquipmentCheckView,
  GetPermitUseCase,
} from "../../../../useCase/getPermitUseCase.js";
import type { ListPermitsUseCase } from "../../../../useCase/listPermitsUseCase.js";
import type { ListSegmentsUseCase } from "../../../../useCase/listSegmentsUseCase.js";
import type { ListWorkersUseCase } from "../../../../useCase/listWorkersUseCase.js";
import type { PermitView } from "../../../../useCase/permitView.js";
import type { RecordEgressUseCase } from "../../../../useCase/recordEgressUseCase.js";
import type { RecordEquipmentCheckUseCase } from "../../../../useCase/recordEquipmentCheckUseCase.js";
import type { RecordReturnUseCase } from "../../../../useCase/recordReturnUseCase.js";
import type { RequestPermitUseCase } from "../../../../useCase/requestPermitUseCase.js";
import {
  parseBody,
  parseIdentifier,
  requireAbortAuthority,
  requireActor,
  requireBaseCommander,
  requireApprovalAuthority,
  requireElectrician,
  requireGroundControl,
} from "../middleware/requestBody.js";
import { withSharedProps } from "../middleware/sharedProps.js";
import { assertNever, respondToUseCaseError } from "../middleware/useCaseResponse.js";
import type { AuthenticatedActor, FieldErrors, WebEnvironment } from "../pageProps.js";
import { toSegmentPageView, type SegmentPageView } from "./segmentRoutes.js";

/**
 * 申請フォーム。作業許可番号と隊員番号は業務の識別子なので、人が入力する。
 * 区画と区間の取り違えは ZoneId と SegmentId の型で分け、ここでは ZoneId だけを受ける。
 */
const RequestPermitFormSchema = z.object({
  permitId: PermitId.schema,
  zoneId: ZoneId.schema,
  crewA: WorkerId.schema,
  crewB: WorkerId.schema,
  plannedMinutes: z.coerce.number().pipe(PlannedMinutes.schema),
  purpose: PermitPurpose.schema,
});
const checkboxToBoolean = z.preprocess(
  (value) =>
    value === undefined || value === "0" || value === "false" || value === false
      ? false
      : value === "1" || value === "true" || value === "on" || value === true
        ? true
        : value,
  z.boolean(),
);
const EquipmentCheckFormSchema = z.object({
  workerId: WorkerId.schema,
  oxygenMinutes: z.coerce.number().pipe(OxygenMinutes.schema),
  note: EquipmentNote.schema,
  needsMaintenance: checkboxToBoolean,
});
/** 帰還の記録。緊急帰還は理由だけを追加で受ける（規程第6条） */
const ReturnFormSchema = z.discriminatedUnion("returnKind", [
  z.object({ returnKind: z.literal("Planned") }),
  z.object({ returnKind: z.literal("Emergency"), reason: EmergencyReason.schema }),
]);
const AbortFormSchema = z.object({ reason: AbortReason.schema });
const PermitErrorSchema = z.enum([
  "invalid-state",
  "permit-conflict",
  "segment-conflict",
  "equipment-check-missing",
  "insufficient-oxygen",
  "worker-not-found",
  "exposure-limit-exceeded",
  "space-weather-unknown",
  "flare-alert-active",
  "buddy-missing",
  "segment-not-found",
  "segment-not-locked-out",
  "lockout-for-another-permit",
  "night-time",
  "lockout-tagged-by-another-user",
  "worker-not-in-crew",
]);
type PermitErrorCode = z.infer<typeof PermitErrorSchema>;

type PermitRouteDependencies = Readonly<{
  listPermits: ListPermitsUseCase;
  getPermit: GetPermitUseCase;
  requestPermit: RequestPermitUseCase;
  recordEquipmentCheck: RecordEquipmentCheckUseCase;
  approveEva: ApproveEvaUseCase;
  recordEgress: RecordEgressUseCase;
  recordReturn: RecordReturnUseCase;
  closePermit: ClosePermitUseCase;
  abortPermit: AbortPermitUseCase;
  listSegments: ListSegmentsUseCase;
  listWorkers: ListWorkersUseCase;
  baseCommanderIsOutside: () => boolean;
}>;

export type PermitPageView = PermitView;
export type EquipmentCheckPageView = EquipmentCheckView;
export type PermitActions = Readonly<{
  recordEquipmentCheck: boolean;
  approve: boolean;
  egress: boolean;
  returnToBase: boolean;
  close: boolean;
  abort: boolean;
}>;
export type PermitZoneOption = Readonly<{ zoneId: string; label: string }>;
export type PermitWorkerOption = Readonly<{ workerId: string; qualification: string }>;

/** 役割と状態から、いま押せる操作だけを画面に出す。判定の権威は use case 側にある */
const actionsFor = (
  actor: AuthenticatedActor,
  permit: PermitView,
  baseCommanderIsOutside: boolean,
): PermitActions => {
  const commander = actor.user.kind === "Admin" || actor.user.kind === "BaseCommander";
  const approvalAuthority =
    commander || (actor.user.kind === "GroundControl" && baseCommanderIsOutside);
  const electrician = actor.user.kind === "Admin" || actor.user.kind === "Electrician";
  const abortAuthority = commander || actor.user.kind === "GroundControl";
  return {
    recordEquipmentCheck: commander && permit.kind === "Requested",
    approve: approvalAuthority && permit.kind === "Requested",
    egress: commander && permit.kind === "Approved",
    returnToBase: commander && permit.kind === "Outside",
    close: electrician && permit.kind === "Returned",
    abort: abortAuthority && (permit.kind === "Requested" || permit.kind === "Approved"),
  };
};

const detailErrors = (raw: string | undefined): FieldErrors => {
  const parsed = PermitErrorSchema.safeParse(raw);
  if (!parsed.success) return {};
  const code = parsed.data;
  switch (code) {
    case "invalid-state":
      return { form: "現在の作業許可の状態ではこの操作を実行できません。画面を更新して状態を確認してください。" };
    case "permit-conflict":
      return { form: "作業許可がほかの操作によって更新されました。最新の状態を確認してください。" };
    case "segment-conflict":
      return { form: "系統区間がほかの操作によって更新されました。最新の状態を確認してください。" };
    case "equipment-check-missing":
      return { form: "2名分の装備点検が記録されていません。（規程第2条）" };
    case "insufficient-oxygen":
      return { form: "酸素残時間が、予定作業時間と予備60分の合計に足りません。（規程第2条）" };
    case "worker-not-found":
      return { form: "登録されていない隊員が含まれています。" };
    case "exposure-limit-exceeded":
      return { form: "作業後の被ばく量が安全上限を超えるため承認できません。（規程第8条）" };
    case "space-weather-unknown":
      return { form: "宇宙天気の報告がありません。地上管制の報告を待ってください。（規程第5条）" };
    case "flare-alert-active":
      return { form: "フレア警報の発令中は承認できません。（規程第5条）" };
    case "buddy-missing":
      return { form: "相方が同じ作業許可に登録されていません。（規程第4条）" };
    case "segment-not-found":
      return { form: "作業区画に対応する系統区間が登録されていません。" };
    case "segment-not-locked-out":
      return { form: "作業区画の系統区間に遮断札が掛かっていません。（規程第3条）" };
    case "lockout-for-another-permit":
      return { form: "系統区間の遮断札は別の作業許可のものです。（事故報告 第3号）" };
    case "night-time":
      return { form: "月面日が第15日以降のため承認できません。（規程第10条）" };
    case "lockout-tagged-by-another-user":
      return { form: "遮断札は掛けた電気主任だけが外せます。（規程第3条）" };
    case "worker-not-in-crew":
      return { workerId: "この隊員は作業許可の2名に含まれていません。" };
    default:
      return assertNever(code);
  }
};

const parsePermitId = (context: Context<WebEnvironment>, raw: string) =>
  parseIdentifier(context, PermitId.schema, raw);
const detailUrl = (permitId: PermitIdType): string => `/permits/${permitId}`;
const redirectWithError = (
  context: Context<WebEnvironment>,
  permitId: PermitIdType,
  code: PermitErrorCode,
): Response => context.redirect(`${detailUrl(permitId)}?error=${code}`, 303);
const internalServerError = (context: Context<WebEnvironment>): Response =>
  respondToUseCaseError(context, { kind: "InternalServerError" });

const renderPermit = async (
  context: Context<WebEnvironment>,
  dependencies: PermitRouteDependencies,
  permitId: PermitIdType,
  errors: FieldErrors = {},
): Promise<Response> => {
  const actor = requireActor(context);
  if (actor.isErr()) return actor.error;
  return dependencies.getPermit
    .run({ actorUserId: actor.value.user.userId, permitId })
    .match(
      ({ permit, equipmentChecks, segment }) =>
        context.render(
          "Permits/Show",
          withSharedProps(context, {
            permit,
            equipmentChecks,
            segment: segment === undefined ? null : toSegmentPageView(segment),
            actions: actionsFor(actor.value, permit, dependencies.baseCommanderIsOutside()),
            errors,
          }),
        ),
      (error) => {
        switch (error.kind) {
          case "Unauthorized":
            return respondToUseCaseError(context, { kind: "Unauthorized" });
          case "PermitNotFound":
            return respondToUseCaseError(context, { kind: "NotFound" });
          default:
            return assertNever(error);
        }
      },
    );
};

const loadRequestOptions = async (
  context: Context<WebEnvironment>,
  dependencies: PermitRouteDependencies,
): Promise<
  Result<
    Readonly<{ zones: readonly PermitZoneOption[]; workers: readonly PermitWorkerOption[] }>,
    Response
  >
> => {
  const actor = requireGroundControl(context);
  if (actor.isErr()) return err(actor.error);
  const segments = await dependencies.listSegments.run({ actorUserId: actor.value.user.userId });
  if (segments.isErr()) {
    return err(respondToUseCaseError(context, { kind: "Unauthorized" }));
  }
  const workers = await dependencies.listWorkers.run({ actorUserId: actor.value.user.userId });
  return workers
    .map(({ workers: values }) => ({
      zones: segments.value.segments.map((segment) => ({
        zoneId: segment.segmentId as string,
        label: segment.label as string,
      })),
      /** 被ばく量は申請画面に出さない。資格だけを選択肢の補助にする */
      workers: values.map((worker) => ({
        workerId: worker.workerId as string,
        qualification: worker.qualification as string,
      })),
    }))
    .mapErr(() => respondToUseCaseError(context, { kind: "Unauthorized" }));
};

const renderRequest = async (
  context: Context<WebEnvironment>,
  dependencies: PermitRouteDependencies,
  errors: FieldErrors = {},
): Promise<Response> => {
  const options = await loadRequestOptions(context, dependencies);
  return options.match(
    (values) => context.render("Permits/New", withSharedProps(context, { ...values, errors })),
    (response) => response,
  );
};

export const registerPermitRoutes = (
  app: Hono<WebEnvironment>,
  dependencies: PermitRouteDependencies,
): void => {
  app.get("/permits", async (context) => {
    const actor = requireActor(context);
    if (actor.isErr()) return actor.error;
    return dependencies.listPermits
      .run({ actorUserId: actor.value.user.userId })
      .match(
        ({ permits }) =>
          context.render(
            "Permits/Index",
            withSharedProps(context, {
              permits,
              canRequest:
                actor.value.user.kind === "Admin" || actor.value.user.kind === "GroundControl",
            }),
          ),
        () => respondToUseCaseError(context, { kind: "Unauthorized" }),
      );
  });

  app.get("/permits/new", (context) => renderRequest(context, dependencies));

  app.post("/permits", async (context) => {
    const actor = requireGroundControl(context);
    if (actor.isErr()) return actor.error;
    const parsed = await parseBody(context, RequestPermitFormSchema);
    if (parsed.isErr()) return renderRequest(context, dependencies, parsed.error.errors);
    const { crewA, crewB, ...rest } = parsed.value;
    return dependencies.requestPermit
      .run({ actorUserId: actor.value.user.userId, crew: [crewA, crewB], ...rest })
      .match(
        ({ permit }) => context.redirect(detailUrl(permit.permitId), 303),
        (error) => {
          switch (error.kind) {
            case "Unauthorized":
              return respondToUseCaseError(context, { kind: "Unauthorized" });
            case "BuddyMissing":
              return renderRequest(context, dependencies, {
                crewB: "相方には別の隊員を選んでください。（規程第4条）",
              });
            case "WorkerNotFound":
              return renderRequest(context, dependencies, {
                [error.workerId === crewA ? "crewA" : "crewB"]: "選択した隊員が見つかりません。",
              });
            case "SegmentNotFound":
              return renderRequest(context, dependencies, {
                zoneId: "作業区画に対応する系統区間が登録されていません。",
              });
            case "PermitConflict":
              return renderRequest(context, dependencies, {
                permitId: "この作業許可番号は既に使われています。",
              });
            case "IdentityGenerationFailed":
              return internalServerError(context);
            default:
              return assertNever(error);
          }
        },
      );
  });

  app.get("/permits/:permitId", (context) => {
    const permitId = parsePermitId(context, context.req.param("permitId"));
    return permitId.match(
      (value) =>
        renderPermit(context, dependencies, value, detailErrors(context.req.query("error"))),
      (response) => response,
    );
  });

  app.post("/permits/:permitId/equipment-checks", async (context) => {
    const actor = requireBaseCommander(context);
    if (actor.isErr()) return actor.error;
    const permitId = parsePermitId(context, context.req.param("permitId"));
    if (permitId.isErr()) return permitId.error;
    const parsed = await parseBody(context, EquipmentCheckFormSchema);
    if (parsed.isErr()) {
      return renderPermit(context, dependencies, permitId.value, parsed.error.errors);
    }
    return dependencies.recordEquipmentCheck
      .run({ actorUserId: actor.value.user.userId, permitId: permitId.value, ...parsed.value })
      .match(
        () => context.redirect(detailUrl(permitId.value), 303),
        (error) => {
          switch (error.kind) {
            case "Unauthorized":
              return respondToUseCaseError(context, { kind: "Unauthorized" });
            case "PermitNotFound":
              return respondToUseCaseError(context, { kind: "NotFound" });
            case "InvalidPermitState":
              return redirectWithError(context, permitId.value, "invalid-state");
            case "WorkerNotInCrew":
              return redirectWithError(context, permitId.value, "worker-not-in-crew");
            case "IdentityGenerationFailed":
              return internalServerError(context);
            default:
              return assertNever(error);
          }
        },
      );
  });

  /** 開始承認。7条件のどれで止まったかを、そのまま画面の文言に写す */
  app.post("/permits/:permitId/approve", async (context) => {
    const actor = requireApprovalAuthority(context);
    if (actor.isErr()) return actor.error;
    const permitId = parsePermitId(context, context.req.param("permitId"));
    if (permitId.isErr()) return permitId.error;
    return dependencies.approveEva
      .run({ actorUserId: actor.value.user.userId, permitId: permitId.value })
      .match(
        () => context.redirect(detailUrl(permitId.value), 303),
        (error) => {
          switch (error.kind) {
            case "Unauthorized":
              return respondToUseCaseError(context, { kind: "Unauthorized" });
            case "PermitNotFound":
              return respondToUseCaseError(context, { kind: "NotFound" });
            case "InvalidPermitState":
              return redirectWithError(context, permitId.value, "invalid-state");
            case "EquipmentCheckMissing":
              return redirectWithError(context, permitId.value, "equipment-check-missing");
            case "InsufficientOxygen":
              return redirectWithError(context, permitId.value, "insufficient-oxygen");
            case "WorkerNotFound":
              return redirectWithError(context, permitId.value, "worker-not-found");
            case "ExposureLimitExceeded":
              return redirectWithError(context, permitId.value, "exposure-limit-exceeded");
            case "SpaceWeatherUnknown":
              return redirectWithError(context, permitId.value, "space-weather-unknown");
            case "FlareAlertActive":
              return redirectWithError(context, permitId.value, "flare-alert-active");
            case "BuddyMissing":
              return redirectWithError(context, permitId.value, "buddy-missing");
            case "SegmentNotFound":
              return redirectWithError(context, permitId.value, "segment-not-found");
            case "SegmentNotLockedOut":
              return redirectWithError(context, permitId.value, "segment-not-locked-out");
            case "LockoutForAnotherPermit":
              return redirectWithError(context, permitId.value, "lockout-for-another-permit");
            case "NightTime":
              return redirectWithError(context, permitId.value, "night-time");
            case "PermitConflict":
              return redirectWithError(context, permitId.value, "permit-conflict");
            case "IdentityGenerationFailed":
              return internalServerError(context);
            default:
              return assertNever(error);
          }
        },
      );
  });

  app.post("/permits/:permitId/egress", async (context) => {
    const actor = requireBaseCommander(context);
    if (actor.isErr()) return actor.error;
    const permitId = parsePermitId(context, context.req.param("permitId"));
    if (permitId.isErr()) return permitId.error;
    return dependencies.recordEgress
      .run({ actorUserId: actor.value.user.userId, permitId: permitId.value })
      .match(
        () => context.redirect(detailUrl(permitId.value), 303),
        (error) => {
          switch (error.kind) {
            case "Unauthorized":
              return respondToUseCaseError(context, { kind: "Unauthorized" });
            case "PermitNotFound":
              return respondToUseCaseError(context, { kind: "NotFound" });
            case "InvalidPermitState":
              return redirectWithError(context, permitId.value, "invalid-state");
            case "PermitConflict":
              return redirectWithError(context, permitId.value, "permit-conflict");
            case "IdentityGenerationFailed":
              return internalServerError(context);
            default:
              return assertNever(error);
          }
        },
      );
  });

  app.post("/permits/:permitId/return", async (context) => {
    const actor = requireBaseCommander(context);
    if (actor.isErr()) return actor.error;
    const permitId = parsePermitId(context, context.req.param("permitId"));
    if (permitId.isErr()) return permitId.error;
    const parsed = await parseBody(context, ReturnFormSchema);
    if (parsed.isErr()) {
      return renderPermit(context, dependencies, permitId.value, parsed.error.errors);
    }
    const returnRecord =
      parsed.value.returnKind === "Planned"
        ? ({ kind: "Planned" } as const)
        : ({ kind: "Emergency", reason: parsed.value.reason } as const);
    return dependencies.recordReturn
      .run({ actorUserId: actor.value.user.userId, permitId: permitId.value, returnRecord })
      .match(
        () => context.redirect(detailUrl(permitId.value), 303),
        (error) => {
          switch (error.kind) {
            case "Unauthorized":
              return respondToUseCaseError(context, { kind: "Unauthorized" });
            case "PermitNotFound":
              return respondToUseCaseError(context, { kind: "NotFound" });
            case "InvalidPermitState":
              return redirectWithError(context, permitId.value, "invalid-state");
            case "PermitConflict":
              return redirectWithError(context, permitId.value, "permit-conflict");
            case "IdentityGenerationFailed":
              return internalServerError(context);
            default:
              return assertNever(error);
          }
        },
      );
  });

  /** 完了。遮断札の取り外しと完了は1つの transaction で保存される */
  app.post("/permits/:permitId/close", async (context) => {
    const actor = requireElectrician(context);
    if (actor.isErr()) return actor.error;
    const permitId = parsePermitId(context, context.req.param("permitId"));
    if (permitId.isErr()) return permitId.error;
    return dependencies.closePermit
      .run({ actorUserId: actor.value.user.userId, permitId: permitId.value })
      .match(
        () => context.redirect(detailUrl(permitId.value), 303),
        (error) => {
          switch (error.kind) {
            case "Unauthorized":
              return respondToUseCaseError(context, { kind: "Unauthorized" });
            case "PermitNotFound":
              return respondToUseCaseError(context, { kind: "NotFound" });
            case "InvalidPermitState":
              return redirectWithError(context, permitId.value, "invalid-state");
            case "SegmentNotFound":
              return redirectWithError(context, permitId.value, "segment-not-found");
            case "SegmentNotLockedOut":
              return redirectWithError(context, permitId.value, "segment-not-locked-out");
            case "LockoutForAnotherPermit":
              return redirectWithError(context, permitId.value, "lockout-for-another-permit");
            case "LockoutTaggedByAnotherUser":
              return redirectWithError(context, permitId.value, "lockout-tagged-by-another-user");
            case "SegmentConflict":
              return redirectWithError(context, permitId.value, "segment-conflict");
            case "PermitConflict":
              return redirectWithError(context, permitId.value, "permit-conflict");
            case "IdentityGenerationFailed":
              return internalServerError(context);
            default:
              return assertNever(error);
          }
        },
      );
  });

  app.post("/permits/:permitId/abort", async (context) => {
    const actor = requireAbortAuthority(context);
    if (actor.isErr()) return actor.error;
    const permitId = parsePermitId(context, context.req.param("permitId"));
    if (permitId.isErr()) return permitId.error;
    const parsed = await parseBody(context, AbortFormSchema);
    if (parsed.isErr()) {
      return renderPermit(context, dependencies, permitId.value, parsed.error.errors);
    }
    return dependencies.abortPermit
      .run({ actorUserId: actor.value.user.userId, permitId: permitId.value, reason: parsed.value.reason })
      .match(
        () => context.redirect(detailUrl(permitId.value), 303),
        (error) => {
          switch (error.kind) {
            case "Unauthorized":
              return respondToUseCaseError(context, { kind: "Unauthorized" });
            case "PermitNotFound":
              return respondToUseCaseError(context, { kind: "NotFound" });
            case "InvalidPermitState":
              return redirectWithError(context, permitId.value, "invalid-state");
            case "PermitConflict":
              return redirectWithError(context, permitId.value, "permit-conflict");
            case "IdentityGenerationFailed":
              return internalServerError(context);
            default:
              return assertNever(error);
          }
        },
      );
  });
};

export const ensureKnownPermitError = (code: string): Result<PermitErrorCode, string> => {
  const parsed = PermitErrorSchema.safeParse(code);
  return parsed.success ? ok(parsed.data) : err(code);
};
