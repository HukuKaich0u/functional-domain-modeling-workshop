import type { Context, Hono } from "hono";
import { z } from "zod";

import {
  CumulativeDose,
  WorkerId,
  WorkerQualification,
} from "../../../../domain/worker/index.js";
import type { Worker, WorkerId as WorkerIdType } from "../../../../domain/worker/index.js";
import type { DeleteWorkerUseCase } from "../../../../useCase/deleteWorkerUseCase.js";
import type { GetWorkerUseCase } from "../../../../useCase/getWorkerUseCase.js";
import type { ListWorkersUseCase } from "../../../../useCase/listWorkersUseCase.js";
import type { RegisterWorkerUseCase } from "../../../../useCase/registerWorkerUseCase.js";
import type { UpdateWorkerUseCase } from "../../../../useCase/updateWorkerUseCase.js";
import { parseBody, parseIdentifier, requireGroundControl } from "../middleware/requestBody.js";
import { withSharedProps } from "../middleware/sharedProps.js";
import { assertNever, respondToUseCaseError } from "../middleware/useCaseResponse.js";
import type { FieldErrors, WebEnvironment } from "../pageProps.js";

const WorkerProfileShape = {
  qualification: WorkerQualification.schema,
  cumulativeDoseMicroSv: z.coerce.number().pipe(CumulativeDose.schema),
};
const RegisterWorkerFormSchema = z.object({
  workerId: WorkerId.schema,
  ...WorkerProfileShape,
});
const UpdateWorkerFormSchema = z.object(WorkerProfileShape);
const WorkerErrorSchema = z.enum(["worker-has-active-permit"]);

type WorkerRouteDependencies = Readonly<{
  listWorkers: ListWorkersUseCase;
  getWorker: GetWorkerUseCase;
  registerWorker: RegisterWorkerUseCase;
  updateWorker: UpdateWorkerUseCase;
  deleteWorker: DeleteWorkerUseCase;
}>;

/**
 * 医務の窓口（地上管制と Admin）だけが開く画面の表現。
 * 累積線量はここで明示的に unwrap する。作業許可の画面や作業記録には出ない。
 */
export type WorkerPageView = Readonly<{
  workerId: WorkerIdType;
  qualification: Worker["qualification"];
  cumulativeDoseMicroSv: number;
}>;

const toPageView = (worker: Worker): WorkerPageView => ({
  workerId: worker.workerId,
  qualification: worker.qualification,
  cumulativeDoseMicroSv: worker.cumulativeDoseMicroSv.unwrap(),
});

const parseWorkerId = (context: Context<WebEnvironment>, raw: string) =>
  parseIdentifier(context, WorkerId.schema, raw);

const workerErrors = (raw: string | undefined): FieldErrors => {
  const parsed = WorkerErrorSchema.safeParse(raw);
  if (!parsed.success) return {};
  const code = parsed.data;
  switch (code) {
    case "worker-has-active-permit":
      return { form: "進行中の作業許可に登録されている隊員は削除できません。" };
    default:
      return assertNever(code);
  }
};

const renderCreate = (context: Context<WebEnvironment>, errors: FieldErrors = {}) =>
  context.render(
    "Workers/Form",
    withSharedProps(context, { mode: "create" as const, worker: null, errors }),
  );

const renderWorker = async (
  context: Context<WebEnvironment>,
  dependencies: WorkerRouteDependencies,
  workerId: WorkerIdType,
  errors: FieldErrors = {},
): Promise<Response> => {
  const actor = requireGroundControl(context);
  if (actor.isErr()) return actor.error;
  return dependencies.getWorker
    .run({ actorUserId: actor.value.user.userId, workerId })
    .match(
      ({ worker }) =>
        context.render(
          "Workers/Form",
          withSharedProps(context, { mode: "edit" as const, worker: toPageView(worker), errors }),
        ),
      (error) => {
        switch (error.kind) {
          case "Unauthorized":
            return respondToUseCaseError(context, { kind: "Unauthorized" });
          case "WorkerNotFound":
            return respondToUseCaseError(context, { kind: "NotFound" });
          default:
            return assertNever(error);
        }
      },
    );
};

export const registerWorkerRoutes = (
  app: Hono<WebEnvironment>,
  dependencies: WorkerRouteDependencies,
): void => {
  app.get("/workers", async (context) => {
    const actor = requireGroundControl(context);
    if (actor.isErr()) return actor.error;
    return dependencies.listWorkers
      .run({ actorUserId: actor.value.user.userId })
      .match(
        ({ workers }) =>
          context.render(
            "Workers/Index",
            withSharedProps(context, {
              workers: workers.map(toPageView),
              errors: workerErrors(context.req.query("error")),
            }),
          ),
        () => respondToUseCaseError(context, { kind: "Unauthorized" }),
      );
  });

  app.get("/workers/new", (context) => {
    const actor = requireGroundControl(context);
    return actor.match(
      () => renderCreate(context),
      (response) => response,
    );
  });

  app.post("/workers", async (context) => {
    const actor = requireGroundControl(context);
    if (actor.isErr()) return actor.error;
    const parsed = await parseBody(context, RegisterWorkerFormSchema);
    if (parsed.isErr()) return renderCreate(context, parsed.error.errors);
    return dependencies.registerWorker
      .run({ actorUserId: actor.value.user.userId, ...parsed.value })
      .match(
        () => context.redirect("/workers", 303),
        (error) => {
          switch (error.kind) {
            case "Unauthorized":
              return respondToUseCaseError(context, { kind: "Unauthorized" });
            case "WorkerAlreadyExists":
              return renderCreate(context, { workerId: "この隊員番号は既に登録されています。" });
            case "IdentityGenerationFailed":
              return respondToUseCaseError(context, { kind: "InternalServerError" });
            default:
              return assertNever(error);
          }
        },
      );
  });

  app.get("/workers/:workerId", (context) => {
    const workerId = parseWorkerId(context, context.req.param("workerId"));
    return workerId.match(
      (value) => renderWorker(context, dependencies, value),
      (response) => response,
    );
  });

  app.post("/workers/:workerId", async (context) => {
    const actor = requireGroundControl(context);
    if (actor.isErr()) return actor.error;
    const workerId = parseWorkerId(context, context.req.param("workerId"));
    if (workerId.isErr()) return workerId.error;
    const parsed = await parseBody(context, UpdateWorkerFormSchema);
    if (parsed.isErr()) {
      return renderWorker(context, dependencies, workerId.value, parsed.error.errors);
    }
    return dependencies.updateWorker
      .run({ actorUserId: actor.value.user.userId, workerId: workerId.value, ...parsed.value })
      .match(
        () => context.redirect("/workers", 303),
        (error) => {
          switch (error.kind) {
            case "Unauthorized":
              return respondToUseCaseError(context, { kind: "Unauthorized" });
            case "WorkerNotFound":
              return respondToUseCaseError(context, { kind: "NotFound" });
            case "IdentityGenerationFailed":
              return respondToUseCaseError(context, { kind: "InternalServerError" });
            default:
              return assertNever(error);
          }
        },
      );
  });

  app.post("/workers/:workerId/delete", async (context) => {
    const actor = requireGroundControl(context);
    if (actor.isErr()) return actor.error;
    const workerId = parseWorkerId(context, context.req.param("workerId"));
    if (workerId.isErr()) return workerId.error;
    return dependencies.deleteWorker
      .run({ actorUserId: actor.value.user.userId, workerId: workerId.value })
      .match(
        () => context.redirect("/workers", 303),
        (error) => {
          switch (error.kind) {
            case "Unauthorized":
              return respondToUseCaseError(context, { kind: "Unauthorized" });
            case "WorkerNotFound":
              return respondToUseCaseError(context, { kind: "NotFound" });
            case "WorkerHasActivePermit":
              return context.redirect("/workers?error=worker-has-active-permit", 303);
            case "IdentityGenerationFailed":
              return respondToUseCaseError(context, { kind: "InternalServerError" });
            default:
              return assertNever(error);
          }
        },
      );
  });
};
