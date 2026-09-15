import type { Approach } from "../approach.js";
import {
  approved,
  verdictFrom,
  violatedConditions,
  type ApprovalRequest,
  type EquipmentCheck,
  type FlareAlert,
  type RejectionReason,
  type Verdict,
} from "../approval/request.js";

/**
 * イベント駆動。判定に必要な事実は、別々の担当が別々の時刻に起こした出来事として届く。
 * 出来事を順に畳み込んで（fold）現在の状態を作り、判定の結果もまた出来事として出す。
 * 履歴が残るので、フレア警報が出て解除された経緯まで再生（replay）できる。
 */
export type DomainEvent =
  | Readonly<{ kind: "ApprovalRequested"; permitId: string; zoneId: string; plannedMinutes: number }>
  | Readonly<{ kind: "CrewAssigned"; permitId: string; workerId: string }>
  | Readonly<{ kind: "EquipmentChecked"; workerId: string; oxygenMinutes: number; checkedAt: string }>
  | Readonly<{ kind: "DoseReported"; workerId: string; microSv: number }>
  | Readonly<{ kind: "FlareAlertIssued" }>
  | Readonly<{ kind: "FlareAlertCleared" }>
  | Readonly<{ kind: "LockoutTagHung"; segmentId: string }>
  | Readonly<{ kind: "LockoutTagRemoved"; segmentId: string }>
  | Readonly<{ kind: "LunarDayAdvanced"; lunarDay: number }>;

export type ApprovalState = Readonly<{
  permitId: string | undefined;
  zoneId: string | undefined;
  plannedMinutes: number;
  crew: readonly string[];
  equipmentChecks: Readonly<Record<string, EquipmentCheck>>;
  crewDoseMicroSv: Readonly<Record<string, number>>;
  flareAlert: FlareAlert;
  lockedOutSegmentIds: readonly string[];
  lunarDay: number;
}>;

export const initialState: ApprovalState = {
  permitId: undefined,
  zoneId: undefined,
  plannedMinutes: 0,
  crew: [],
  equipmentChecks: {},
  crewDoseMicroSv: {},
  flareAlert: "Clear",
  lockedOutSegmentIds: [],
  lunarDay: 1,
};

/** 出来事を1つ受け取り、次の状態を返す。前の状態は変更しない */
export const apply = (state: ApprovalState, event: DomainEvent): ApprovalState => {
  switch (event.kind) {
    case "ApprovalRequested":
      return {
        ...state,
        permitId: event.permitId,
        zoneId: event.zoneId,
        plannedMinutes: event.plannedMinutes,
      };
    case "CrewAssigned":
      return { ...state, crew: [...state.crew, event.workerId] };
    case "EquipmentChecked":
      return {
        ...state,
        equipmentChecks: {
          ...state.equipmentChecks,
          [event.workerId]: {
            workerId: event.workerId,
            oxygenMinutes: event.oxygenMinutes,
            checkedAt: event.checkedAt,
          },
        },
      };
    case "DoseReported":
      return {
        ...state,
        crewDoseMicroSv: { ...state.crewDoseMicroSv, [event.workerId]: event.microSv },
      };
    case "FlareAlertIssued":
      return { ...state, flareAlert: "Warning" };
    case "FlareAlertCleared":
      return { ...state, flareAlert: "Clear" };
    case "LockoutTagHung":
      return { ...state, lockedOutSegmentIds: [...state.lockedOutSegmentIds, event.segmentId] };
    case "LockoutTagRemoved":
      return {
        ...state,
        lockedOutSegmentIds: state.lockedOutSegmentIds.filter(
          (segmentId) => segmentId !== event.segmentId,
        ),
      };
    case "LunarDayAdvanced":
      return { ...state, lunarDay: event.lunarDay };
  }
};

export const replay = (events: readonly DomainEvent[]): ApprovalState =>
  events.reduce(apply, initialState);

export type ApprovalDecided =
  | Readonly<{ kind: "EvaApproved"; permitId: string }>
  | Readonly<{ kind: "EvaApprovalRejected"; permitId: string; reasons: readonly RejectionReason[] }>;

/** 判定は状態から導く純粋関数。関数型の書き方と同じで、違いは入力が出来事の履歴であること */
export const decideFromState = (state: ApprovalState): ApprovalDecided => {
  const permitId = state.permitId ?? "unknown";
  const reasons = violatedConditions({
    permitId,
    zoneId: state.zoneId ?? "",
    crew: state.crew,
    plannedMinutes: state.plannedMinutes,
    equipmentChecks: Object.values(state.equipmentChecks),
    crewDoseMicroSv: state.crewDoseMicroSv,
    flareAlert: state.flareAlert,
    lockedOutSegmentIds: state.lockedOutSegmentIds,
    lunarDay: state.lunarDay,
  });
  return reasons.length === 0
    ? { kind: "EvaApproved", permitId }
    : { kind: "EvaApprovalRejected", permitId, reasons };
};

export const decideFromEvents = (events: readonly DomainEvent[]): ApprovalDecided =>
  decideFromState(replay(events));

/** 比較のための橋渡し。一括の入力を、担当ごとの出来事の列に分解する */
export const toEvents = (request: ApprovalRequest): readonly DomainEvent[] => [
  {
    kind: "ApprovalRequested",
    permitId: request.permitId,
    zoneId: request.zoneId,
    plannedMinutes: request.plannedMinutes,
  },
  ...request.crew.map(
    (workerId): DomainEvent => ({ kind: "CrewAssigned", permitId: request.permitId, workerId }),
  ),
  ...request.equipmentChecks.map(
    (check): DomainEvent => ({ kind: "EquipmentChecked", ...check }),
  ),
  ...Object.entries(request.crewDoseMicroSv).map(
    ([workerId, microSv]): DomainEvent => ({ kind: "DoseReported", workerId, microSv }),
  ),
  ...(request.flareAlert === "Clear" ? [] : [{ kind: "FlareAlertIssued" } as const]),
  ...request.lockedOutSegmentIds.map(
    (segmentId): DomainEvent => ({ kind: "LockoutTagHung", segmentId }),
  ),
  { kind: "LunarDayAdvanced", lunarDay: request.lunarDay },
];

const toVerdict = (decided: ApprovalDecided): Verdict =>
  decided.kind === "EvaApproved" ? approved : verdictFrom(decided.reasons);

export const eventDriven: Approach = {
  id: "event-driven",
  name: "イベント駆動",
  tier: "比較",
  reporting: "all",
  summary:
    "事実を出来事の履歴として受け取り、畳み込んだ状態から判定し、結果も出来事として出す。経緯を再生できる。",
  decide: (request) => toVerdict(decideFromEvents(toEvents(request))),
};
