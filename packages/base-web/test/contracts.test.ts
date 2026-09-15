import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import {
  moonbaseNoticeFromCode,
  noticeFromCode,
  notImplemented,
} from "../src/server.js";

describe("noticeFromCode", () => {
  it("許可したcodeだけをnoticeへ変換する", () => {
    expect(noticeFromCode("not-implemented")).toEqual({
      kind: "FeatureNotImplemented",
    });
    expect(noticeFromCode("invalid-state")).toEqual({
      kind: "InvalidAppointmentState",
    });
    expect(noticeFromCode("not-found")).toEqual({
      kind: "AppointmentNotFound",
    });
    expect(noticeFromCode("conflict")).toEqual({
      kind: "AppointmentConflict",
    });
  });

  it("任意の文字列をnoticeへ流さない", () => {
    expect(noticeFromCode("<script>alert(1)</script>")).toBeNull();
    expect(noticeFromCode(undefined)).toBeNull();
  });
});

describe("moonbaseNoticeFromCode", () => {
  it("MoonBase の失敗種別だけをnoticeへ変換する", () => {
    expect(moonbaseNoticeFromCode("invalid-state")).toEqual({
      kind: "InvalidPermitState",
    });
    expect(moonbaseNoticeFromCode("not-found")).toEqual({ kind: "PermitNotFound" });
    expect(moonbaseNoticeFromCode("conflict")).toEqual({ kind: "PermitConflict" });
    expect(moonbaseNoticeFromCode("dose-limit")).toEqual({ kind: "DoseLimitExceeded" });
    expect(moonbaseNoticeFromCode("flare-alert")).toEqual({ kind: "FlareAlertActive" });
    expect(moonbaseNoticeFromCode("oxygen")).toEqual({ kind: "InsufficientOxygen" });
    expect(moonbaseNoticeFromCode("night")).toEqual({ kind: "NightTime" });
    expect(moonbaseNoticeFromCode("<script>alert(1)</script>")).toBeNull();
    expect(moonbaseNoticeFromCode(undefined)).toBeNull();
  });
});

describe("notImplemented", () => {
  it("POST後の遷移をGETへ固定する", async () => {
    const app = new Hono().post("/feature", notImplemented);

    const response = await app.request("/feature", { method: "POST" });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/?notice=not-implemented");
  });
});
