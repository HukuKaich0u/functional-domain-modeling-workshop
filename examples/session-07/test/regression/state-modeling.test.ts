import { describe, expect, it } from "vitest";

import { compileTypeFixture } from "./compileTypeFixture.js";

describe("S3 regression: 作業許可の状態を型で制約する", () => {
  it("Closed を渡す開始承認はコンパイルできない", () => {
    expect(compileTypeFixture("s3-closed-cannot-approve.ts")).toEqual([]);
  });

  it("reason を省く中止はコンパイルできない", () => {
    expect(compileTypeFixture("s3-abort-requires-reason.ts")).toEqual([]);
  });

  it("許可されない遷移元はコンパイルできない", () => {
    expect(compileTypeFixture("s3-transition-sources.ts")).toEqual([]);
  });

  it("7つ目の状態を足すと status label がコンパイルできない", () => {
    expect(compileTypeFixture("s3-status-exhaustive.ts")).toEqual([]);
  });
});

describe("S3 regression: 帰還の記録がない作業許可は完了にできない", () => {
  it("Outside を直接渡す呼び出しはコンパイルできない", () => {
    expect(compileTypeFixture("s3-close-requires-returned.ts")).toEqual([]);
  });
});
