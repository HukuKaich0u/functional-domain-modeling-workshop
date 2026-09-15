import { describe, expect, it } from "vitest";

import { FlareAlert } from "../../src/domain/spaceWeather/index.js";
import { SegmentId } from "../../src/domain/lockout/index.js";
import type { Approved, EvaPermit, Requested } from "../../src/domain/permit/index.js";
import { PermitId, ZoneId } from "../../src/domain/permit/index.js";
import { CumulativeDose, WorkerId } from "../../src/domain/worker/index.js";
import type { Dependencies } from "../../src/useCase/dependencies.js";
import { ensurePermitFound, ensureRequested } from "../../src/useCase/errors.js";
import { approveEva } from "../../src/useCase/approveEva.js";
import { moonbaseFixture } from "../../../fixtures/moonbase.js";
import { compileWithAdditionalApproveEvaError } from "./compileTypeFixture.js";

const permitId = PermitId.parse(moonbaseFixture.permitId);
const crew = [
  WorkerId.parse(moonbaseFixture.crew[0]),
  WorkerId.parse(moonbaseFixture.crew[1]),
] as const;
const equipmentChecks = [
  { workerId: crew[0], oxygenMinutes: moonbaseFixture.oxygenMinutes, checkedAt: moonbaseFixture.checkedAt },
  { workerId: crew[1], oxygenMinutes: moonbaseFixture.oxygenMinutes, checkedAt: moonbaseFixture.checkedAt },
] as const;
const requested = {
  kind: "Requested",
  permitId,
  zoneId: ZoneId.parse(moonbaseFixture.zoneId),
  crew,
  plannedMinutes: moonbaseFixture.plannedMinutes,
  requestedAt: moonbaseFixture.requestedAt,
} as const satisfies Requested;
const approved = {
  ...requested,
  kind: "Approved",
  segmentId: SegmentId.parse(moonbaseFixture.segmentId),
  equipmentChecks,
  approvedAt: moonbaseFixture.approvedAt,
  approvedBy: "base-commander",
} as const satisfies Approved;
const input = {
  permitId,
  segmentId: SegmentId.parse(moonbaseFixture.segmentId),
  equipmentChecks,
  approvedBy: "base-commander",
  approvedAt: moonbaseFixture.approvedAt,
  lunarDay: moonbaseFixture.lunarDay,
} as const;

describe("S6 Step 1 regression: InvalidPermitState を値として返す", () => {
  it("Requested でない作業許可を kind で識別できる", () => {
    const result = ensureRequested(approved);
    expect(result.isErr() && result.error).toEqual({
      kind: "InvalidPermitState",
      actual: "Approved",
    });
  });
});

describe("S6 Step 2 regression: PermitNotFound を値として返す", () => {
  it("見つからない permitId をエラーへ残す", () => {
    const result = ensurePermitFound(undefined, permitId);
    expect(result.isErr() && result.error).toEqual({
      kind: "PermitNotFound",
      permitId,
    });
  });
});

describe("S6 Step 3 regression: andThen pipeline が失敗理由を運ぶ", () => {
  it("許可なしを InvalidPermitState に潰さず保存しない", () => {
    const observer = { saveCalls: 0 };
    const result = approveEva(createDependencies(undefined, observer))(input);

    expect(result.isErr() && result.error).toEqual({
      kind: "PermitNotFound",
      permitId,
    });
    expect(observer).toEqual({ saveCalls: 0 });
  });

  it("ドメインの状態遷移で Requested を Approved にして保存する", () => {
    const observer = { saveCalls: 0 };
    const result = approveEva(createDependencies(requested, observer))(input);

    expect(result.isOk() && result.value).toEqual(approved);
    expect(observer).toEqual({ saveCalls: 1 });
  });

  it("状態不正なら保存しない", () => {
    const observer = { saveCalls: 0 };
    const result = approveEva(createDependencies(approved, observer))(input);

    expect(result.isErr() && result.error.kind).toBe("InvalidPermitState");
    expect(observer).toEqual({ saveCalls: 0 });
  });

  it("線量上限を超える作業員がいれば、誰かだけを返して保存しない", () => {
    const observer = { saveCalls: 0 };
    const result = approveEva(
      createDependencies(requested, observer, {
        doses: { "W-03": 31_500, "W-04": 49_900 },
      }),
    )(input);

    expect(result.isErr() && result.error).toEqual({
      kind: "DoseLimitExceeded",
      workerId: crew[1],
    });
    expect(observer).toEqual({ saveCalls: 0 });
  });

  it("フレア警報中は承認せず保存しない", () => {
    const observer = { saveCalls: 0 };
    const result = approveEva(
      createDependencies(requested, observer, {
        alert: { kind: "Active", level: "S3", issuedAt: moonbaseFixture.requestedAt },
      }),
    )(input);

    expect(result.isErr() && result.error).toEqual({ kind: "FlareAlertActive" });
    expect(observer).toEqual({ saveCalls: 0 });
  });

  it("保存障害を業務エラーへ変換せず例外として伝える", () => {
    const saveError = new Error("database unavailable");
    const observer = { saveCalls: 0, saveError };

    expect(() => approveEva(createDependencies(requested, observer))(input)).toThrow(saveError);
    expect(observer.saveCalls).toBe(1);
  });
});

describe("S6 Step 4 regression: 端末側が業務エラーを漏れなく処理する", () => {
  it("業務エラーを追加すると未対応の分岐がコンパイルエラーになる", () => {
    // 開始スナップショットの routes は通知対応表（Record）も持つため、種類の追加は
    // 対応表の不足としても検出される。
    expect(compileWithAdditionalApproveEvaError()).toEqual([
      expect.stringContaining("PermitUnavailable"),
    ]);
  });
});

const createDependencies = (
  resolved: EvaPermit | undefined,
  observer: {
    saveCalls: number;
    saveError?: Error;
  },
  options: Readonly<{
    doses?: Readonly<Record<string, number>>;
    alert?: FlareAlert;
  }> = {},
): Dependencies => ({
  resolver: { resolveById: () => resolved },
  doses: {
    resolve: (workerId) =>
      CumulativeDose.of(
        (options.doses ?? moonbaseFixture.crewDoseMicroSv)[workerId] ?? 0,
      ),
  },
  spaceWeather: { currentAlert: () => options.alert ?? FlareAlert.clear },
  store: {
    save: () => {
      observer.saveCalls += 1;
      if (observer.saveError !== undefined) {
        throw observer.saveError;
      }
    },
  },
});
