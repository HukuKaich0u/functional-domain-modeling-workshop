import { describe, expect, it } from "vitest";

import { toStatusLabel } from "../src/domain/permit/statusLabel.js";

describe("Session 03 setup", () => {
  it("申請済の作業許可を表示できる", () => {
    expect(toStatusLabel({ kind: "Requested" })).toBe("申請済");
    expect(toStatusLabel({ kind: "Returned" })).toBe("帰還済");
  });
});
