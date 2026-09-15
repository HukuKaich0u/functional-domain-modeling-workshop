import { describe, expectTypeOf, it } from "vitest";

import type {
  Closed,
  Outside,
} from "../src/domain/permit/permit.js";
import { toStatusLabel } from "../src/domain/permit/statusLabel.js";
import {
  abort,
  approve,
  close,
  egress,
} from "../src/domain/permit/transitions.js";

describe("Step 1", () => {
  it("完了した作業許可から開始を承認できない", () => {
    expectTypeOf<Closed>().not.toMatchTypeOf<Parameters<typeof approve>[0]>(); // 要件: 完了した作業許可から開始を承認できない型にしてください。
  });
});

describe("Step 2", () => {
  it("中止には必ず理由を残す", () => {
    expectTypeOf<undefined>().not.toMatchTypeOf<Parameters<typeof abort>[1]>(); // 要件: 中止の理由を省略できない型にしてください。
  });
});

describe("Step 3", () => {
  it("作業中の許可を再度出発させられない", () => {
    expectTypeOf<Outside>().not.toMatchTypeOf<Parameters<typeof egress>[0]>(); // 要件: 作業中の許可を再度出発させられない型にしてください。
  });

  it("帰還の記録前に完了にできない", () => {
    expectTypeOf<Outside>().not.toMatchTypeOf<Parameters<typeof close>[0]>(); // 要件: 帰還の記録前に完了にできない型にしてください。
  });
});

describe("Step 4", () => {
  it("未定義の作業許可の状態を表示対象にできない", () => {
    expectTypeOf<Readonly<{ kind: "Deferred" }>>().not.toMatchTypeOf<Parameters<typeof toStatusLabel>[0]>(); // 要件: 未定義の作業許可の状態には表示名を付けられない型にしてください。
  });
});
