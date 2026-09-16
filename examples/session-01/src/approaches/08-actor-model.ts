import type { Approach } from "../approach.js";
import {
  violatedConditions,
  verdictFrom,
  segmentFor,
  type ApprovalRequest,
  type FlareAlert,
  type Verdict,
} from "../approval/request.js";

/**
 * メッセージ指向・Actor Model。判定に必要な事実は別々の担当（アクター）が持ち、共有しない。
 * 基地長アクターは各担当へ問い合わせのメッセージを送り、返事が揃った時点で判定する。
 * 地球との遅延 1.3 秒のように、返事の到着順が決まっていない前提で書く。
 */
export type Address =
  | "base-commander"
  | "medical-officer"
  | "ground-control"
  | "electrician"
  | "requester";

export type Message =
  | Readonly<{ kind: "ApprovalRequested"; request: ApprovalRequest; replyTo: Address }>
  | Readonly<{ kind: "ExposureQuery"; permitId: string; workerIds: readonly string[]; replyTo: Address }>
  | Readonly<{ kind: "ExposureReply"; permitId: string; exposures: Readonly<Record<string, number>> }>
  | Readonly<{ kind: "SpaceWeatherQuery"; permitId: string; replyTo: Address }>
  | Readonly<{ kind: "SpaceWeatherReply"; permitId: string; alert: FlareAlert; lunarDay: number }>
  | Readonly<{ kind: "LockoutQuery"; permitId: string; segmentId: string; replyTo: Address }>
  | Readonly<{ kind: "LockoutReply"; permitId: string; lockedOut: boolean }>
  | Readonly<{ kind: "ApprovalDecided"; permitId: string; verdict: Verdict }>;

export type Envelope = Readonly<{ to: Address; message: Message }>;

export interface ActorContext {
  send(to: Address, message: Message): void;
}

export type Actor = (message: Message, context: ActorContext) => void;

/** 1本のキューで順に配送する最小のランタイム。本物は並行・分散するが、モデルは同じ */
export class ActorSystem {
  private readonly actors = new Map<Address, Actor>();
  private readonly queue: Envelope[] = [];
  readonly log: Envelope[] = [];

  register(address: Address, actor: Actor): this {
    this.actors.set(address, actor);
    return this;
  }

  send(to: Address, message: Message): void {
    this.queue.push({ to, message });
  }

  run(): void {
    for (;;) {
      const envelope = this.queue.shift();
      if (envelope === undefined) return;
      const actor = this.actors.get(envelope.to);
      if (actor === undefined) throw new Error(`No actor is registered at ${envelope.to}`);
      this.log.push(envelope);
      actor(envelope.message, { send: (to, message) => this.send(to, message) });
    }
  }
}

export const medicalOfficer =
  (exposures: Readonly<Record<string, number>>): Actor =>
  (message, context) => {
    if (message.kind !== "ExposureQuery") return;
    context.send(message.replyTo, {
      kind: "ExposureReply",
      permitId: message.permitId,
      exposures: Object.fromEntries(
        message.workerIds.flatMap((workerId) => {
          const exposure = exposures[workerId];
          return exposure === undefined ? [] : [[workerId, exposure] as const];
        }),
      ),
    });
  };

export const groundControl =
  (alert: FlareAlert, lunarDay: number): Actor =>
  (message, context) => {
    if (message.kind !== "SpaceWeatherQuery") return;
    context.send(message.replyTo, {
      kind: "SpaceWeatherReply",
      permitId: message.permitId,
      alert,
      lunarDay,
    });
  };

export const electrician =
  (lockedOutSegmentIds: readonly string[]): Actor =>
  (message, context) => {
    if (message.kind !== "LockoutQuery") return;
    context.send(message.replyTo, {
      kind: "LockoutReply",
      permitId: message.permitId,
      lockedOut: lockedOutSegmentIds.includes(message.segmentId),
    });
  };

type PendingApproval = Readonly<{
  request: ApprovalRequest;
  replyTo: Address;
  exposures: Readonly<Record<string, number>> | undefined;
  weather: Readonly<{ alert: FlareAlert; lunarDay: number }> | undefined;
  lockedOut: boolean | undefined;
}>;

const decidePending = (pending: PendingApproval): Verdict =>
  verdictFrom(
    violatedConditions({
      ...pending.request,
      crewExposureMicroSv: pending.exposures ?? {},
      flareAlert: pending.weather?.alert ?? "Warning",
      lunarDay: pending.weather?.lunarDay ?? Number.POSITIVE_INFINITY,
      lockedOutSegmentIds:
        pending.lockedOut === true ? [segmentFor(pending.request.zoneId)] : [],
    }),
  );

/** 基地長。自分では持たない事実を問い合わせ、返事が揃ったら判定する。内部状態は外から触れない */
export const baseCommander = (): Actor => {
  const pendingApprovals = new Map<string, PendingApproval>();

  return (message, context) => {
    if (message.kind === "ApprovalRequested") {
      const { request } = message;
      pendingApprovals.set(request.permitId, {
        request,
        replyTo: message.replyTo,
        exposures: undefined,
        weather: undefined,
        lockedOut: undefined,
      });
      context.send("medical-officer", {
        kind: "ExposureQuery",
        permitId: request.permitId,
        workerIds: request.crew,
        replyTo: "base-commander",
      });
      context.send("ground-control", {
        kind: "SpaceWeatherQuery",
        permitId: request.permitId,
        replyTo: "base-commander",
      });
      context.send("electrician", {
        kind: "LockoutQuery",
        permitId: request.permitId,
        segmentId: segmentFor(request.zoneId),
        replyTo: "base-commander",
      });
      return;
    }

    if (
      message.kind !== "ExposureReply" &&
      message.kind !== "SpaceWeatherReply" &&
      message.kind !== "LockoutReply"
    ) {
      return;
    }

    const pending = pendingApprovals.get(message.permitId);
    if (pending === undefined) return;
    const updated: PendingApproval =
      message.kind === "ExposureReply"
        ? { ...pending, exposures: message.exposures }
        : message.kind === "SpaceWeatherReply"
          ? { ...pending, weather: { alert: message.alert, lunarDay: message.lunarDay } }
          : { ...pending, lockedOut: message.lockedOut };
    pendingApprovals.set(message.permitId, updated);

    if (updated.exposures === undefined || updated.weather === undefined || updated.lockedOut === undefined) {
      return;
    }
    pendingApprovals.delete(message.permitId);
    context.send(updated.replyTo, {
      kind: "ApprovalDecided",
      permitId: message.permitId,
      verdict: decidePending(updated),
    });
  };
};

export type ApprovalRun = Readonly<{ verdict: Verdict; log: readonly Envelope[] }>;

export const runApproval = (request: ApprovalRequest): ApprovalRun => {
  const reply: { verdict: Verdict | undefined } = { verdict: undefined };
  const system = new ActorSystem()
    .register("base-commander", baseCommander())
    .register("medical-officer", medicalOfficer(request.crewExposureMicroSv))
    .register("ground-control", groundControl(request.flareAlert, request.lunarDay))
    .register("electrician", electrician(request.lockedOutSegmentIds))
    .register("requester", (message) => {
      if (message.kind === "ApprovalDecided") reply.verdict = message.verdict;
    });

  system.send("base-commander", { kind: "ApprovalRequested", request, replyTo: "requester" });
  system.run();

  if (reply.verdict === undefined) throw new Error("The base commander did not reply");
  return { verdict: reply.verdict, log: system.log };
};

export const actorModel: Approach = {
  id: "actor-model",
  name: "メッセージ指向・Actor Model",
  tier: "展望",
  reporting: "all",
  summary:
    "事実の持ち主ごとにアクターを置き、メッセージで問い合わせる。共有状態がなく、返事の順序に依存しない。",
  decide: (request) => runApproval(request).verdict,
};
