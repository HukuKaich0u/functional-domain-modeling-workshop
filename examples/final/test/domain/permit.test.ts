import { describe, expect, test } from "vitest";

import { AbortReason, EmergencyReason, EvaPermit } from "../../src/domain/permit/index.js";
import type { Approved, EvaPermit as Permit } from "../../src/domain/permit/index.js";
import { approved, eventContext, ids, outside, requested, returned } from "../support/fixtures.js";

describe("EvaPermit の状態遷移", () => {
  test("申請は Requested の状態と PermitRequested を作る", () => {
    const event = EvaPermit.request(eventContext(1))({ ...requested });
    expect(event.kind).toBe("PermitRequested");
    expect(event.aggregateName).toBe("EvaPermit");
    expect(event.aggregateState.kind).toBe("Requested");
    expect(event.eventPayload).toEqual({ permitId: ids.permit, zoneId: ids.zone });
    expect(event.lunarDay).toBe(7);
  });

  test("開始承認は承認者、地球時、月面日を実行コンテキストから一度だけ取る", () => {
    const context = eventContext(2, { actorUserId: ids.baseCommander });
    const event = EvaPermit.approve(context)(requested, { segmentId: ids.segment });
    expect(event.kind).toBe("EvaApproved");
    expect(event.aggregateState).toMatchObject({
      kind: "Approved",
      segmentId: ids.segment,
      approvedBy: ids.baseCommander,
      approvedAt: context.occurredAt,
      approvalLunarDay: context.lunarDay,
    });
    expect(event.eventPayload).toEqual({
      permitId: ids.permit,
      segmentId: ids.segment,
      approvedAt: context.occurredAt,
      approvedBy: ids.baseCommander,
    });
  });

  test("出発、帰還、完了は前の状態を引き継ぎながら時刻を積む", () => {
    const egressed = EvaPermit.egress(eventContext(3))(approved);
    expect(egressed.aggregateState.kind).toBe("Outside");
    expect(egressed.aggregateState.egressAt).toBe(eventContext(3).occurredAt);

    const emergency = EvaPermit.returnToBase(eventContext(4))(egressed.aggregateState, {
      kind: "Emergency",
      reason: EmergencyReason.schema.parse("フレア警報 S2 の発令"),
    });
    expect(emergency.aggregateState.kind).toBe("Returned");
    expect(emergency.eventPayload).toEqual({ permitId: ids.permit, returnKind: "Emergency" });

    const closed = EvaPermit.close(eventContext(5))(emergency.aggregateState);
    expect(closed.aggregateState.kind).toBe("Closed");
    expect(closed.aggregateState.lockoutRemovedAt).toBe(eventContext(5).occurredAt);
    expect(closed.aggregateState.closedAt).toBe(eventContext(5).occurredAt);
    expect(closed.eventPayload).toEqual({ permitId: ids.permit, segmentId: ids.segment });
  });

  test("中止は申請済と承認済から理由付きでだけ行える（規程第6条）", () => {
    const reason = AbortReason.schema.parse("フレア警報のため");
    const fromRequested = EvaPermit.abort(eventContext(6, { actorUserId: ids.groundControl }))(requested, reason);
    const fromApproved = EvaPermit.abort(eventContext(7))(approved, reason);
    expect(fromRequested.aggregateState.kind).toBe("Aborted");
    expect(fromRequested.aggregateState.abortedBy).toBe(ids.groundControl);
    expect(fromApproved.aggregateState.abortReason).toBe(reason);
    // @ts-expect-error 出発後（Outside）の許可は中止できない
    EvaPermit.abort(eventContext(8))(outside, reason);
    // @ts-expect-error 帰還済（Returned）の許可も中止できない
    EvaPermit.abort(eventContext(9))(returned, reason);
  });

  test("承認済でない許可を出発させる呼び出しはコンパイルで止まる", () => {
    // @ts-expect-error Requested は egress の入力にならない
    EvaPermit.egress(eventContext(10))(requested);
    // @ts-expect-error Approved は returnToBase の入力にならない
    EvaPermit.returnToBase(eventContext(11))(approved, { kind: "Planned" });
    // @ts-expect-error Outside は close の入力にならない
    EvaPermit.close(eventContext(12))(outside);
    expect(true).toBe(true);
  });

  test("Requested に承認済の項目を混ぜた値は型が拒む", () => {
    const invalid = {
      ...requested,
      // @ts-expect-error Requested は approvedBy を持たない
      approvedBy: ids.baseCommander,
    } as const satisfies Permit;
    const approvedShape: Approved = approved;
    expect(approvedShape.kind).toBe("Approved");
    expect(invalid.kind).toBe("Requested");
  });

  test("完了と中止以外は進行中、承認から帰還までは遮断を維持する", () => {
    const aborted = EvaPermit.abort(eventContext(13))(requested, AbortReason.schema.parse("x")).aggregateState;
    const closed = EvaPermit.close(eventContext(14))(returned).aggregateState;
    expect([requested, approved, outside, returned].map(EvaPermit.isActive)).toEqual([true, true, true, true]);
    expect([aborted, closed].map(EvaPermit.isActive)).toEqual([false, false]);
    expect([requested, approved, outside, returned, aborted, closed].map(EvaPermit.requiresLockout)).toEqual([false, true, true, true, false, false]);
  });
});
