import type { Approach } from "../approach.js";
import type {
  ApprovalRequest,
  EquipmentCheck,
  RejectionReason,
  Verdict,
} from "../approval/request.js";

/**
 * 手続き型。S0 の旧コードに、運用担当が条件を一つずつ足していった形。
 * 上から順に確かめ、最初に破れた条件で return する。数値は使う場所にそのまま書く。
 */
export type CheckResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; message: string }>;

export const checkApproval = (request: ApprovalRequest): CheckResult => {
  const crewChecks: EquipmentCheck[] = [];
  for (const workerId of request.crew) {
    let found: EquipmentCheck | null = null;
    for (const check of request.equipmentChecks) {
      if (check.workerId === workerId) {
        found = check;
      }
    }
    if (found === null) {
      return { ok: false, message: `equipment check missing for ${workerId}` };
    }
    crewChecks.push(found);
  }

  for (const check of crewChecks) {
    if (check.oxygenMinutes < request.plannedMinutes + 60) {
      return { ok: false, message: `oxygen too low for ${check.workerId}` };
    }
  }

  const predicted = Math.ceil((request.plannedMinutes / 60) * 60);
  for (const workerId of request.crew) {
    const dose = request.crewDoseMicroSv[workerId];
    if (dose === undefined || dose + predicted > 50000) {
      return { ok: false, message: `dose limit exceeded for ${workerId}` };
    }
  }

  if (request.flareAlert !== "Clear") {
    return { ok: false, message: "flare alert is active" };
  }

  const uniqueCrew: string[] = [];
  for (const workerId of request.crew) {
    if (!uniqueCrew.includes(workerId)) {
      uniqueCrew.push(workerId);
    }
  }
  if (uniqueCrew.length !== 2) {
    return { ok: false, message: "buddy is not registered" };
  }

  let lockedOut = false;
  for (const segmentId of request.lockedOutSegmentIds) {
    if (segmentId === request.zoneId) {
      lockedOut = true;
    }
  }
  if (!lockedOut) {
    return { ok: false, message: `segment ${request.zoneId} is not locked out` };
  }

  if (request.lunarDay > 14) {
    return { ok: false, message: "night time" };
  }

  return { ok: true };
};

/**
 * 端末側は文字列の部分一致で理由を見分ける。
 * S0 の `error.message.includes` と同じで、文言を変えると分岐が静かに壊れる。
 */
export const reasonFromMessage = (message: string): RejectionReason => {
  if (message.includes("equipment check")) return "EquipmentCheckMissing";
  if (message.includes("oxygen")) return "InsufficientOxygen";
  if (message.includes("dose")) return "DoseLimitExceeded";
  if (message.includes("flare")) return "FlareAlertActive";
  if (message.includes("buddy")) return "BuddyMissing";
  if (message.includes("locked out")) return "SegmentNotLockedOut";
  return "NightTime";
};

const decide = (request: ApprovalRequest): Verdict => {
  const result = checkApproval(request);
  return result.ok
    ? { kind: "Approved" }
    : { kind: "Rejected", reasons: [reasonFromMessage(result.message)] };
};

export const procedural: Approach = {
  id: "procedural",
  name: "手続き型",
  tier: "比較",
  reporting: "first",
  summary:
    "上から順に確かめ、最初に破れた条件で止まる。条件は if 文の並び、理由は文字列。",
  decide,
};
