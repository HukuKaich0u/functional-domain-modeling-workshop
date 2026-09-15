import type { Context } from "hono";

import type { MoonbaseNotice, Notice } from "./contracts.js";

const noticesByCode: Readonly<Record<string, Exclude<Notice, null>>> = {
  "not-implemented": { kind: "FeatureNotImplemented" },
  "invalid-state": { kind: "InvalidAppointmentState" },
  "not-found": { kind: "AppointmentNotFound" },
  conflict: { kind: "AppointmentConflict" },
};

const moonbaseNoticesByCode: Readonly<
  Record<string, Exclude<MoonbaseNotice, null>>
> = {
  "not-implemented": { kind: "FeatureNotImplemented" },
  "invalid-state": { kind: "InvalidPermitState" },
  "not-found": { kind: "PermitNotFound" },
  conflict: { kind: "PermitConflict" },
  "dose-limit": { kind: "DoseLimitExceeded" },
  "flare-alert": { kind: "FlareAlertActive" },
  oxygen: { kind: "InsufficientOxygen" },
  night: { kind: "NightTime" },
};

export const noticeFromCode = (raw: string | undefined): Notice =>
  raw === undefined ? null : (noticesByCode[raw] ?? null);

export const moonbaseNoticeFromCode = (
  raw: string | undefined,
): MoonbaseNotice =>
  raw === undefined ? null : (moonbaseNoticesByCode[raw] ?? null);

export const notImplemented = (context: Context): Response =>
  context.redirect("/?notice=not-implemented", 303);
