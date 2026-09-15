import type { Approach } from "../approach.js";
import {
  CREW_SIZE,
  DOSE_LIMIT_MICRO_SV,
  LAST_DAYLIGHT_LUNAR_DAY,
  predictedDoseMicroSv,
  rejectionReasons,
  requiredOxygenMinutes,
  segmentFor,
  verdictFrom,
  type ApprovalRequest,
  type RejectionReason,
} from "../approval/request.js";

/**
 * Logic Programming。事実（fact）と規則（rule）を宣言し、「この許可は承認できるか」を問い合わせる（query）。
 * 手順は書かない。評価器が規則を事実に当て、新しい事実が導けなくなるまで（固定点）繰り返す。Datalog の最小形。
 */
export type Term = string | number;
export type Fact = readonly [predicate: string, ...args: Term[]];
export type Pattern = readonly (Term | "_")[];

export class FactBase {
  private readonly facts = new Map<string, Fact>();

  constructor(facts: Iterable<Fact> = []) {
    for (const fact of facts) this.assert(fact);
  }

  /** 事実を追加する。既知なら false */
  assert(fact: Fact): boolean {
    const key = JSON.stringify(fact);
    if (this.facts.has(key)) return false;
    this.facts.set(key, fact);
    return true;
  }

  /** 述語名と引数の型で問い合わせる。`_` は何にでも一致する */
  query(predicate: string, ...pattern: Pattern): readonly Fact[] {
    return [...this.facts.values()].filter(
      (fact) =>
        fact[0] === predicate &&
        pattern.every((term, index) => term === "_" || fact[index + 1] === term),
    );
  }

  holds(predicate: string, ...pattern: Pattern): boolean {
    return this.query(predicate, ...pattern).length > 0;
  }

  get size(): number {
    return this.facts.size;
  }
}

/** 規則。既知の事実から新しい事実を導く「〜ならば」の宣言 */
export type Rule = Readonly<{
  head: string;
  body: string;
  derive: (db: FactBase) => Iterable<Fact>;
}>;

const asNumber = (term: Term | undefined): number =>
  typeof term === "number" ? term : Number.NaN;

const asString = (term: Term | undefined): string =>
  typeof term === "string" ? term : String(term);

const permits = (db: FactBase) =>
  db.query("permit", "_", "_", "_").map((fact) => ({
    permitId: asString(fact[1]),
    zoneId: asString(fact[2]),
    plannedMinutes: asNumber(fact[3]),
  }));

const crewOf = (db: FactBase, permitId: string): readonly string[] =>
  db.query("crew", permitId, "_").map((fact) => asString(fact[2]));

export const violationRules: readonly Rule[] = [
  {
    head: "violation(P, EquipmentCheckMissing)",
    body: "permit(P, _, _), crew(P, W), not checked(W, _)",
    *derive(db) {
      for (const { permitId } of permits(db)) {
        for (const workerId of crewOf(db, permitId)) {
          if (!db.holds("checked", workerId, "_")) {
            yield ["violation", permitId, "EquipmentCheckMissing"];
          }
        }
      }
    },
  },
  {
    head: "violation(P, InsufficientOxygen)",
    body: "permit(P, _, Minutes), crew(P, W), checked(W, Oxygen), Oxygen < Minutes + 60",
    *derive(db) {
      for (const { permitId, plannedMinutes } of permits(db)) {
        for (const workerId of crewOf(db, permitId)) {
          for (const check of db.query("checked", workerId, "_")) {
            if (asNumber(check[2]) < requiredOxygenMinutes(plannedMinutes)) {
              yield ["violation", permitId, "InsufficientOxygen"];
            }
          }
        }
      }
    },
  },
  {
    head: "violation(P, DoseLimitExceeded)",
    body: "permit(P, _, Minutes), crew(P, W), (not dose(W, _) ; dose(W, D), D + predicted(Minutes) > 50000)",
    *derive(db) {
      for (const { permitId, plannedMinutes } of permits(db)) {
        for (const workerId of crewOf(db, permitId)) {
          const doses = db.query("dose", workerId, "_");
          if (doses.length === 0) yield ["violation", permitId, "DoseLimitExceeded"];
          for (const dose of doses) {
            if (asNumber(dose[2]) + predictedDoseMicroSv(plannedMinutes) > DOSE_LIMIT_MICRO_SV) {
              yield ["violation", permitId, "DoseLimitExceeded"];
            }
          }
        }
      }
    },
  },
  {
    head: "violation(P, FlareAlertActive)",
    body: "permit(P, _, _), flareAlert(Warning)",
    *derive(db) {
      if (!db.holds("flareAlert", "Warning")) return;
      for (const { permitId } of permits(db)) yield ["violation", permitId, "FlareAlertActive"];
    },
  },
  {
    head: "violation(P, BuddyMissing)",
    body: "permit(P, _, _), count(crew(P, _)) != 2",
    *derive(db) {
      for (const { permitId } of permits(db)) {
        if (crewOf(db, permitId).length !== CREW_SIZE) {
          yield ["violation", permitId, "BuddyMissing"];
        }
      }
    },
  },
  {
    head: "violation(P, SegmentNotLockedOut)",
    body: "permit(P, Zone, _), feeds(Segment, Zone), not lockedOut(Segment)",
    *derive(db) {
      for (const { permitId, zoneId } of permits(db)) {
        for (const feed of db.query("feeds", "_", zoneId)) {
          if (!db.holds("lockedOut", asString(feed[1]))) {
            yield ["violation", permitId, "SegmentNotLockedOut"];
          }
        }
      }
    },
  },
  {
    head: "violation(P, NightTime)",
    body: "permit(P, _, _), lunarDay(D), D > 14",
    *derive(db) {
      const night = db
        .query("lunarDay", "_")
        .some((fact) => asNumber(fact[1]) > LAST_DAYLIGHT_LUNAR_DAY);
      if (!night) return;
      for (const { permitId } of permits(db)) yield ["violation", permitId, "NightTime"];
    },
  },
];

/** 否定を含む規則は、否定する述語が出そろった後の層で評価する（層化） */
export const approvalRules: readonly Rule[] = [
  {
    head: "approvable(P)",
    body: "permit(P, _, _), not violation(P, _)",
    *derive(db) {
      for (const { permitId } of permits(db)) {
        if (!db.holds("violation", permitId, "_")) yield ["approvable", permitId];
      }
    },
  },
];

export const strata: readonly (readonly Rule[])[] = [violationRules, approvalRules];

/** 導ける事実がなくなるまで規則を当てる */
export const saturate = (db: FactBase, rules: readonly Rule[]): FactBase => {
  for (;;) {
    let changed = false;
    for (const rule of rules) {
      for (const fact of rule.derive(db)) {
        if (db.assert(fact)) changed = true;
      }
    }
    if (!changed) return db;
  }
};

export const factsFrom = (request: ApprovalRequest): readonly Fact[] => [
  ["permit", request.permitId, request.zoneId, request.plannedMinutes],
  ...request.crew.map((workerId): Fact => ["crew", request.permitId, workerId]),
  ...request.equipmentChecks.map((check): Fact => ["checked", check.workerId, check.oxygenMinutes]),
  ...Object.entries(request.crewDoseMicroSv).map(([workerId, dose]): Fact => ["dose", workerId, dose]),
  ["flareAlert", request.flareAlert],
  ["feeds", segmentFor(request.zoneId), request.zoneId],
  ...request.lockedOutSegmentIds.map((segmentId): Fact => ["lockedOut", segmentId]),
  ["lunarDay", request.lunarDay],
];

const toReason = (term: Term | undefined): RejectionReason => {
  const found = rejectionReasons.find((reason) => reason === term);
  if (found === undefined) throw new Error(`Unknown rejection reason: ${String(term)}`);
  return found;
};

export type Answer = Readonly<{
  approvable: boolean;
  violations: readonly RejectionReason[];
  db: FactBase;
}>;

/** 問い合わせ。事実を載せ、層ごとに飽和させ、approvable と violation を読む */
export const ask = (request: ApprovalRequest): Answer => {
  const db = new FactBase(factsFrom(request));
  for (const stratum of strata) saturate(db, stratum);
  return {
    approvable: db.holds("approvable", request.permitId),
    violations: db.query("violation", request.permitId, "_").map((fact) => toReason(fact[2])),
    db,
  };
};

export const logicProgramming: Approach = {
  id: "logic-programming",
  name: "Logic Programming",
  tier: "展望",
  reporting: "all",
  summary:
    "事実と規則を宣言し、承認できるかを問い合わせる。評価器が固定点まで導出し、破れた条文も導かれた事実として残る。",
  decide: (request) => verdictFrom(ask(request).violations),
};
