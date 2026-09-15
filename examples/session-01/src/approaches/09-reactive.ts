import type { Approach } from "../approach.js";
import {
  violatedConditions,
  verdictFrom,
  type ApprovalRequest,
  type EquipmentCheck,
  type FlareAlert,
  type Verdict,
} from "../approval/request.js";

/**
 * Reactive Programming。事実を「時間とともに変わる値」として持ち、判定はそれらから導かれる値として宣言する。
 * 入力のどれかが変わると判定が自動で更新され、購読者（作業状況ボード）へ通知される。
 */
export type Listener<T> = (value: T) => void;
export type Unsubscribe = () => void;

export interface Stream<T> {
  readonly value: T;
  subscribe(listener: Listener<T>): Unsubscribe;
}

/** 現在値を持ち、変更を購読者へ流す最小のセル */
export class Cell<T> implements Stream<T> {
  private readonly listeners = new Set<Listener<T>>();

  constructor(private current: T) {}

  get value(): T {
    return this.current;
  }

  set(next: T): void {
    if (Object.is(next, this.current)) return;
    this.current = next;
    for (const listener of this.listeners) listener(next);
  }

  update(transform: (current: T) => T): void {
    this.set(transform(this.current));
  }

  subscribe(listener: Listener<T>): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** 入力から導かれる値。入力のどれかが変わるたびに再計算する */
export const derive = <Out>(
  inputs: readonly Stream<unknown>[],
  project: () => Out,
): Stream<Out> => {
  const cell = new Cell(project());
  for (const input of inputs) input.subscribe(() => cell.set(project()));
  return cell;
};

export type ApprovalBoard = Readonly<{
  crew$: Cell<readonly string[]>;
  equipmentChecks$: Cell<readonly EquipmentCheck[]>;
  crewDose$: Cell<Readonly<Record<string, number>>>;
  flareAlert$: Cell<FlareAlert>;
  lockedOutSegments$: Cell<readonly string[]>;
  lunarDay$: Cell<number>;
  verdict$: Stream<Verdict>;
}>;

export const createBoard = (request: ApprovalRequest): ApprovalBoard => {
  const crew$ = new Cell(request.crew);
  const equipmentChecks$ = new Cell(request.equipmentChecks);
  const crewDose$ = new Cell(request.crewDoseMicroSv);
  const flareAlert$ = new Cell(request.flareAlert);
  const lockedOutSegments$ = new Cell(request.lockedOutSegmentIds);
  const lunarDay$ = new Cell(request.lunarDay);

  const verdict$ = derive(
    [crew$, equipmentChecks$, crewDose$, flareAlert$, lockedOutSegments$, lunarDay$],
    () =>
      verdictFrom(
        violatedConditions({
          permitId: request.permitId,
          zoneId: request.zoneId,
          plannedMinutes: request.plannedMinutes,
          crew: crew$.value,
          equipmentChecks: equipmentChecks$.value,
          crewDoseMicroSv: crewDose$.value,
          flareAlert: flareAlert$.value,
          lockedOutSegmentIds: lockedOutSegments$.value,
          lunarDay: lunarDay$.value,
        }),
      ),
  );

  return { crew$, equipmentChecks$, crewDose$, flareAlert$, lockedOutSegments$, lunarDay$, verdict$ };
};

export const reactive: Approach = {
  id: "reactive",
  name: "Reactive Programming",
  tier: "展望",
  reporting: "all",
  summary:
    "事実を変わり続ける値として持ち、判定をそこから導かれる値として宣言する。入力が変われば判定と表示が追従する。",
  decide: (request) => createBoard(request).verdict$.value,
};
