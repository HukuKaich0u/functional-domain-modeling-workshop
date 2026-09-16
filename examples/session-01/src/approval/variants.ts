import { sampleRequest, type ApprovalRequest, type RejectionReason } from "./request.js";

const [workerA, workerB] = sampleRequest.crew;
if (workerA === undefined || workerB === undefined) {
  throw new Error("The sample request must register two workers");
}
const [checkA, checkB] = sampleRequest.equipmentChecks;
if (checkA === undefined || checkB === undefined) {
  throw new Error("The sample request must contain two equipment checks");
}

/** 条件を1つだけ破った申請。10通りすべてが同じ理由を返すことを確かめる */
export const singleViolations: readonly (readonly [RejectionReason, ApprovalRequest])[] = [
  ["EquipmentCheckMissing", { ...sampleRequest, equipmentChecks: [checkA] }],
  [
    "InsufficientOxygen",
    { ...sampleRequest, equipmentChecks: [checkA, { ...checkB, oxygenMinutes: 200 }] },
  ],
  [
    "ExposureLimitExceeded",
    {
      ...sampleRequest,
      crewExposureMicroSv: { ...sampleRequest.crewExposureMicroSv, [workerB]: 49_900 },
    },
  ],
  ["FlareAlertActive", { ...sampleRequest, flareAlert: "Warning" }],
  ["BuddyMissing", { ...sampleRequest, crew: [workerA, workerA] }],
  ["SegmentNotLockedOut", { ...sampleRequest, lockedOutSegmentIds: ["PV-01"] }],
  ["NightTime", { ...sampleRequest, lunarDay: 15 }],
];

/** 酸素不足、フレア警報、相方なし、夜間の4条件が同時に破れた申請 */
export const multipleViolations: ApprovalRequest = {
  ...sampleRequest,
  crew: [workerA],
  equipmentChecks: [{ ...checkA, oxygenMinutes: 200 }],
  flareAlert: "Warning",
  lunarDay: 15,
};

export const multipleViolationReasons: readonly RejectionReason[] = [
  "InsufficientOxygen",
  "FlareAlertActive",
  "BuddyMissing",
  "NightTime",
];

/** 型で表した条件（1, 5, 6）のうち、multipleViolations で破れているもの */
export const multipleStructuralReasons: readonly RejectionReason[] = ["BuddyMissing"];
