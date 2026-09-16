import { err } from "neverthrow";
import { describe, expect, expectTypeOf, it } from "vitest";

import { createApp } from "../src/app.js";
import { createFixtureCrewExposureResolver } from "../src/adaptor/fixtureCrewExposureResolver.js";
import { createStaticSpaceWeather } from "../src/adaptor/staticSpaceWeather.js";
import { SegmentId } from "../src/domain/lockout/index.js";
import type { Approved, EvaPermit, Requested } from "../src/domain/permit/index.js";
import { PermitId, ZoneId } from "../src/domain/permit/index.js";
import { FlareAlert } from "../src/domain/spaceWeather/index.js";
import { RadiationExposure, WorkerId } from "../src/domain/worker/index.js";
import type { Dependencies } from "../src/useCase/dependencies.js";
import { ensurePermitFound, ensureRequested } from "../src/useCase/errors.js";
import type { ApproveEvaError } from "../src/useCase/errors.js"; // 要件: 許可なしと状態不正を、kindで区別できる開始承認エラーとして定義してください。
import { approveEva } from "../src/useCase/approveEva.js";
import type { approveEvaNoticeCodes } from "../src/web/routes.js"; // 要件: 開始承認エラーのkindをキーにした通知対応表を公開してください。
import { moonbaseFixture } from "../../fixtures/moonbase.js";

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

type PermitUnavailable = Readonly<{
  kind: "PermitUnavailable";
}>;

type ErrorWithNewVariant = ApproveEvaError | PermitUnavailable;

describe("Step 1: InvalidPermitState を値として返す", () => {
  it("Requested でない作業許可でも例外を投げない", () => {
    try {
      const result = ensureRequested(approved);
      expect(result).toEqual(err({
        kind: "InvalidPermitState",
        actual: "Approved",
      }));
    } catch {
      throw new Error("要件未達: 申請済でない作業許可は状態不正として返してください。");
    }
  });
});

describe("Step 2: PermitNotFound を値として返す", () => {
  it("作業許可が見つからなくても例外を投げない", () => {
    try {
      const result = ensurePermitFound(undefined, permitId);
      expect(result).toEqual(err({ kind: "PermitNotFound", permitId }));
    } catch {
      throw new Error("要件未達: 見つからない作業許可は許可なしとして返してください。");
    }
  });
});

describe("Step 3: andThen pipeline が失敗理由を運ぶ", () => {
  it("許可なしを保持し、保存しない", () => {
    let saveCalls = 0;
    const deps = createDependencies(undefined, {
      onSave: () => {
        saveCalls += 1;
      },
    });
    try {
      const result = approveEva(deps)(input);
      expect(result).toEqual(err({ kind: "PermitNotFound", permitId }));
      expect(saveCalls).toBe(0);
    } catch {
      throw new Error("要件未達: 許可なしの理由を保持し、保存を実行しないでください。");
    }
  });

  it("状態不正の後も保存しない", () => {
    let saveCalls = 0;
    const deps = createDependencies(approved, {
      onSave: () => {
        saveCalls += 1;
      },
    });
    try {
      const result = approveEva(deps)(input);
      expect(result).toEqual(err({
        kind: "InvalidPermitState",
        actual: "Approved",
      }));
      expect(saveCalls).toBe(0);
    } catch {
      throw new Error("要件未達: 状態不正の理由を保持し、保存を実行しないでください。");
    }
  });

  it("作業後の被ばく量が安全上限を超える失敗を Result のまま運び、保存しない", () => {
    let saveCalls = 0;
    const deps = createDependencies(requested, {
      onSave: () => {
        saveCalls += 1;
      },
      exposures: { "W-03": 31_500, "W-04": 49_900 },
    });
    try {
      const result = approveEva(deps)(input);
      expect(result).toEqual(err({ kind: "ExposureLimitExceeded", workerId: crew[1] }));
      expect(saveCalls).toBe(0);
    } catch {
      throw new Error("要件未達: 配布済みの判定が返す Err を例外に変換せず、そのまま運んでください。");
    }
  });

  it("保存障害を業務エラーへ変換せず例外として伝える", () => {
    const saveFailure = new Error("database unavailable");
    const deps = createDependencies(requested, {
      onSave: () => {
        throw saveFailure;
      },
    });

    expect(() => approveEva(deps)(input)).toThrow(saveFailure);
  });
});

describe("Step 4: 呼び出し側が業務エラーを漏れなく処理する", () => {
  it("状態不正を専用noticeへ変換する", async () => {
    const app = createApp();
    await post(app, `/permits/${moonbaseFixture.permitId}/approve`);
    const response = await post(app, `/permits/${moonbaseFixture.permitId}/approve`);

    if (response.headers.get("location") !== "/?notice=invalid-state") {
      throw new Error("要件未達: 状態不正を専用のお知らせへ変換してください。");
    }
  });

  it("許可なしを専用noticeへ変換する", async () => {
    const response = await post(createApp(), "/permits/EVA-9999/approve");

    expect(response.headers.get("location")).toBe("/?notice=not-found");
  });

  it("被ばく量が安全上限を超えた場合とフレア警報を専用noticeへ変換する", async () => {
    const exposureResponse = await post(
      createApp({
        exposures: createFixtureCrewExposureResolver({ "W-03": 31_500, "W-04": 49_900 }),
      }),
      `/permits/${moonbaseFixture.permitId}/approve`,
    );
    const flareResponse = await post(
      createApp({
        spaceWeather: createStaticSpaceWeather({
          kind: "Active",
          level: "S2",
          issuedAt: moonbaseFixture.requestedAt,
        }),
      }),
      `/permits/${moonbaseFixture.permitId}/approve`,
    );

    if (exposureResponse.headers.get("location") !== "/?notice=exposure-limit") {
      throw new Error("要件未達: 被ばく量が安全上限を超えた場合を専用のお知らせへ変換してください。");
    }
    if (flareResponse.headers.get("location") !== "/?notice=flare-alert") {
      throw new Error("要件未達: フレア警報中を専用のお知らせへ変換してください。");
    }
  });

  it("開始承認エラーのkindを通知対応表で漏れなく扱う", () => {
    expectTypeOf<keyof typeof approveEvaNoticeCodes>()
      .toEqualTypeOf<ApproveEvaError["kind"]>(); // 要件: 通知対応表は開始承認エラーのkindを過不足なくキーにしてください。
  });

  it("業務エラーを追加すると通知対応表の不足を型で検出する", () => {
    expectTypeOf<keyof typeof approveEvaNoticeCodes>()
      .not.toEqualTypeOf<ErrorWithNewVariant["kind"]>(); // 要件: 業務エラーを追加したら通知対応表にもキーを追加してください。
  });
});

const createDependencies = (
  resolved: EvaPermit | undefined,
  observer: Readonly<{
    onSave?: () => void;
    exposures?: Readonly<Record<string, number>>;
  }> = {},
): Dependencies => ({
  resolver: { resolveById: () => resolved },
  exposures: {
    resolve: (workerId) =>
      RadiationExposure.of(
        (observer.exposures ?? moonbaseFixture.crewExposureMicroSv)[workerId] ?? 0,
      ),
  },
  spaceWeather: { currentAlert: () => FlareAlert.clear },
  store: {
    save: () => {
      observer.onSave?.();
    },
  },
});

const post = async (
  app: ReturnType<typeof createApp>,
  path: string,
): Promise<Response> =>
  app.request(path, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "X-Inertia": "true",
      "X-Inertia-Version": "1",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      segmentId: moonbaseFixture.segmentId,
      equipmentChecks,
      approvedBy: "base-commander",
    }),
  });
