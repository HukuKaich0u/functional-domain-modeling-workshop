import { describe, expect, it } from "vitest";

import { checkApproval, reasonFromMessage } from "../src/approaches/01-procedural.js";
import {
  ApprovalRule,
  candidateFor,
  policyFor,
  type PermitCandidate,
} from "../src/approaches/02-object-oriented.js";
import { all, enoughOxygen, noFlareAlert } from "../src/approaches/03-functional.js";
import {
  approve,
  parseCandidate,
  type Crew,
  type WorkerId,
} from "../src/approaches/04-type-driven.js";
import { ApprovalRequestSchema, deriveFacts } from "../src/approaches/05-data-oriented.js";
import { explain, regulations } from "../src/approaches/06-rule-based.js";
import { decideFromEvents, toEvents } from "../src/approaches/07-event-driven.js";
import { runApproval } from "../src/approaches/08-actor-model.js";
import { createBoard } from "../src/approaches/09-reactive.js";
import { ask } from "../src/approaches/10-logic-programming.js";
import { sampleRequest, type Verdict } from "../src/approval/request.js";
import { multipleViolations, singleViolations } from "../src/approval/variants.js";

const variant = (reason: string) => {
  const found = singleViolations.find(([candidate]) => candidate === reason);
  if (found === undefined) throw new Error(`Missing variant: ${reason}`);
  return found[1];
};

describe("手続き型", () => {
  it("最初に破れた条件の文字列で止まり、後の条件は見ない", () => {
    expect(checkApproval(multipleViolations)).toEqual({
      ok: false,
      message: "oxygen too low for W-03",
    });
  });

  it("端末は文言の部分一致で理由を推定するため、文言が変わると誤分類する", () => {
    expect(reasonFromMessage("oxygen too low for W-04")).toBe("InsufficientOxygen");
    expect(reasonFromMessage("O2 reserve is short")).toBe("NightTime");
  });
});

describe("オブジェクト指向", () => {
  it("規則は7つのオブジェクトで、方針を変えずに規則を足せる", () => {
    class NamedRequesterRule extends ApprovalRule {
      constructor() {
        super("EquipmentCheckMissing");
      }

      isSatisfiedBy(candidate: PermitCandidate): boolean {
        return candidate.permitId.startsWith("EVA-");
      }
    }
    const policy = policyFor(sampleRequest);

    expect(policy.ruleCount).toBe(7);
    expect(policy.with(new NamedRequesterRule()).ruleCount).toBe(8);
    expect(policy.with(new NamedRequesterRule()).evaluate(candidateFor(sampleRequest))).toEqual({
      kind: "Approved",
    });
  });
});

describe("関数型", () => {
  it("条件は単独で試せ、合成の並べ方で判定が決まる", () => {
    expect(enoughOxygen(variant("InsufficientOxygen"))).toEqual(["InsufficientOxygen"]);
    expect(noFlareAlert(variant("InsufficientOxygen"))).toEqual([]);
    expect(all(enoughOxygen, noFlareAlert)(multipleViolations)).toEqual([
      "InsufficientOxygen",
      "FlareAlertActive",
    ]);
    expect(all()(multipleViolations)).toEqual([]);
  });
});

describe("型駆動", () => {
  it("構造の条件を通らない申請は ApprovalCandidate にならない", () => {
    expect(parseCandidate(variant("BuddyMissing"))).toEqual({
      ok: false,
      reasons: ["BuddyMissing"],
    });
    expect(parseCandidate(sampleRequest).ok).toBe(true);
  });

  it("相方のいない乗員と、parse を通さない入力は型エラーになる", () => {
    // @ts-expect-error 相方のいない乗員は Crew にならない
    const soloCrew: Crew = ["W-03" as WorkerId];
    // @ts-expect-error ApprovalRequest は parse を通さないと ApprovalCandidate にならない
    const verdict: Verdict = approve(sampleRequest, {
      radiationExposureOf: () => 0,
      flareAlert: "Clear",
      lunarDay: 1,
    });

    expect(soloCrew).toHaveLength(1);
    expect(verdict.kind).toBe("Approved");
  });
});

describe("データ指向（DOP）", () => {
  it("境界のスキーマが壊れた入力を止め、事実は JSON にそのまま出せる", () => {
    expect(ApprovalRequestSchema.safeParse({ ...sampleRequest, lunarDay: 30 }).success).toBe(false);
    expect(ApprovalRequestSchema.safeParse({ ...sampleRequest, permitId: "0412" }).success).toBe(false);

    const facts = deriveFacts(ApprovalRequestSchema.parse(sampleRequest));
    expect(JSON.parse(JSON.stringify(facts))).toEqual(facts);
    expect(facts["oxygen.requiredMinutes"]).toBe(240);
  });
});

describe("宣言型・ルールベース", () => {
  it("7条文の宣言がそのまま判定の説明になる", () => {
    expect(regulations).toHaveLength(7);
    expect(explain(variant("InsufficientOxygen"))).toContain(
      "× 第2条 酸素残時間が予定作業時間と予備60分の合計以上である",
    );
    expect(explain(sampleRequest).every((line) => line.startsWith("○"))).toBe(true);
  });
});

describe("イベント駆動", () => {
  it("警報が出て解除された履歴を再生すると承認に戻る", () => {
    const events = toEvents(sampleRequest);

    expect(decideFromEvents([...events, { kind: "FlareAlertIssued" }])).toEqual({
      kind: "EvaApprovalRejected",
      permitId: sampleRequest.permitId,
      reasons: ["FlareAlertActive"],
    });
    expect(
      decideFromEvents([...events, { kind: "FlareAlertIssued" }, { kind: "FlareAlertCleared" }]),
    ).toEqual({ kind: "EvaApproved", permitId: sampleRequest.permitId });
    expect(
      decideFromEvents([...events, { kind: "LockoutTagRemoved", segmentId: "PV-07" }]),
    ).toMatchObject({ kind: "EvaApprovalRejected", reasons: ["SegmentNotLockedOut"] });
  });
});

describe("メッセージ指向・Actor Model", () => {
  it("基地長は3者へ問い合わせ、返事が揃ってから判定を返す", () => {
    const { verdict, log } = runApproval(sampleRequest);

    expect(verdict).toEqual({ kind: "Approved" });
    expect(log.map(({ to, message }) => `${message.kind} -> ${to}`)).toEqual([
      "ApprovalRequested -> base-commander",
      "ExposureQuery -> medical-officer",
      "SpaceWeatherQuery -> ground-control",
      "LockoutQuery -> electrician",
      "ExposureReply -> base-commander",
      "SpaceWeatherReply -> base-commander",
      "LockoutReply -> base-commander",
      "ApprovalDecided -> requester",
    ]);
  });
});

describe("Reactive Programming", () => {
  it("フレア警報のセルが変わると判定と購読者が追従する", () => {
    const board = createBoard(sampleRequest);
    const seen: Verdict[] = [];
    board.verdict$.subscribe((verdict) => seen.push(verdict));

    board.flareAlert$.set("Warning");
    expect(board.verdict$.value).toEqual({ kind: "Rejected", reasons: ["FlareAlertActive"] });

    board.flareAlert$.set("Clear");
    expect(board.verdict$.value).toEqual({ kind: "Approved" });
    expect(seen).toHaveLength(2);
  });
});

describe("Logic Programming", () => {
  it("approvable(P) を問い合わせ、破れた条文は導かれた事実として残る", () => {
    expect(ask(sampleRequest).approvable).toBe(true);

    const answer = ask(variant("NightTime"));
    expect(answer.approvable).toBe(false);
    expect(answer.violations).toEqual(["NightTime"]);
    expect(answer.db.holds("violation", sampleRequest.permitId, "NightTime")).toBe(true);
    expect(answer.db.holds("approvable", sampleRequest.permitId)).toBe(false);
  });
});
