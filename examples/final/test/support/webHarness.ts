import { objectToFormData } from "@inertiajs/core";
import { expect } from "vitest";

import { createSqliteDatabase, migrateDatabase } from "../../src/adaptor/secondary/sqlite/db.js";
import { LunarDay } from "../../src/domain/aggregate/lunarDay.js";
import { Timestamp } from "../../src/domain/aggregate/timestamp.js";
import { createApp, createApplicationDependencies } from "../../src/app.js";

export const inertiaHeaders = {
  Accept: "application/json",
  "X-Inertia": "true",
  "X-Inertia-Version": "1",
} as const;

export const credentials = {
  admin: { email: "admin@moonbase.test", name: "System Admin", password: "correct horse battery staple" },
  groundControl: { email: "ground-control@moonbase.test", name: "Ground Control", password: "ground control password" },
  baseCommander: { email: "base-commander@moonbase.test", name: "Base Commander", password: "base commander password" },
  electrician: { email: "electrician-a@moonbase.test", name: "Electrician a", password: "electrician a password" },
  electricianB: { email: "electrician-b@moonbase.test", name: "Electrician b", password: "electrician b password" },
} as const;

export const createHarness = (isProduction = false) => {
  let currentTime = Timestamp.schema.parse("2026-09-15T01:30:00.000Z");
  let currentLunarDay = LunarDay.schema.parse(7);
  const database = createSqliteDatabase(":memory:");
  migrateDatabase(database);
  const dependencies = createApplicationDependencies(database, {
    clock: { now: () => currentTime, lunarDay: () => currentLunarDay },
    isProduction,
  });
  const app = createApp(dependencies);
  return {
    app,
    database,
    dependencies,
    setTime: (value: string) => {
      currentTime = Timestamp.schema.parse(value);
    },
    setLunarDay: (value: number) => {
      currentLunarDay = LunarDay.schema.parse(value);
    },
  } as const;
};
export type Harness = ReturnType<typeof createHarness>;

export const cookiePair = (response: Response): string => {
  const cookie = response.headers.get("set-cookie");
  expect(cookie).not.toBeNull();
  return cookie?.split(";")[0] ?? "";
};

export const post = (
  harness: Harness,
  path: string,
  values: Readonly<Record<string, string>>,
  cookie?: string,
  origin = "http://localhost",
) =>
  harness.app.request(path, {
    method: "POST",
    body: new URLSearchParams(values),
    headers: {
      ...inertiaHeaders,
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: origin,
      ...(cookie === undefined ? {} : { Cookie: cookie }),
    },
  });

export const postJson = (harness: Harness, path: string, body: unknown, cookie: string) =>
  harness.app.request(path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      ...inertiaHeaders,
      "Content-Type": "application/json",
      Origin: "http://localhost",
      Cookie: cookie,
    },
  });

export const postInertiaFormData = (
  harness: Harness,
  path: string,
  values: Parameters<typeof objectToFormData>[0],
  cookie: string,
) =>
  harness.app.request(path, {
    method: "POST",
    body: objectToFormData(values),
    headers: { ...inertiaHeaders, Origin: "http://localhost", Cookie: cookie },
  });

export const page = (harness: Harness, path: string, cookie?: string) =>
  harness.app.request(path, {
    headers: { ...inertiaHeaders, ...(cookie === undefined ? {} : { Cookie: cookie }) },
  });

export const setup = async (harness: Harness): Promise<string> =>
  cookiePair(await post(harness, "/setup", credentials.admin));

export const login = async (
  harness: Harness,
  values: Readonly<{ email: string; password: string }>,
): Promise<string> => cookiePair(await post(harness, "/login", { email: values.email, password: values.password }));

export const createUser = async (
  harness: Harness,
  adminCookie: string,
  values: Readonly<{ email: string; name: string; password: string }>,
  role: "GroundControl" | "BaseCommander" | "Electrician",
): Promise<string> => {
  const response = await post(harness, "/users", { ...values, role }, adminCookie);
  expect(response.status).toBe(302);
  return login(harness, values);
};

/** 初期設定と4役割のログインまでを済ませた状態 */
export const createStaffedHarness = async () => {
  const harness = createHarness();
  const adminCookie = await setup(harness);
  const groundControlCookie = await createUser(harness, adminCookie, credentials.groundControl, "GroundControl");
  const baseCommanderCookie = await createUser(harness, adminCookie, credentials.baseCommander, "BaseCommander");
  const electricianCookie = await createUser(harness, adminCookie, credentials.electrician, "Electrician");
  return { harness, adminCookie, groundControlCookie, baseCommanderCookie, electricianCookie } as const;
};

export const registerOperations = async (
  harness: Harness,
  groundControlCookie: string,
  options: Readonly<{ exposureB?: number; alertLevel?: string }> = {},
) => {
  expect((await post(harness, "/segments", { segmentId: "PV-07", label: "PV-07 給電区間" }, groundControlCookie)).status).toBe(303);
  expect((await post(harness, "/workers", { workerId: "W-01", qualification: "Electrician", radiationExposureMicroSv: "12000" }, groundControlCookie)).status).toBe(303);
  expect(
    (await post(
      harness,
      "/workers",
      { workerId: "W-02", qualification: "General", radiationExposureMicroSv: String(options.exposureB ?? 8_000) },
      groundControlCookie,
    )).status,
  ).toBe(303);
  expect(
    (await post(
      harness,
      "/space-weather",
      { issuedAt: "2026-09-15T01:00:00.000Z", alertLevel: options.alertLevel ?? "none", stations: "GOES-19, ACE" },
      groundControlCookie,
    )).status,
  ).toBe(303);
};

export const requestPermit = async (harness: Harness, groundControlCookie: string, permitId = "EVA-0412") => {
  const response = await post(
    harness,
    "/permits",
    {
      permitId,
      zoneId: "PV-07",
      crewA: "W-01",
      crewB: "W-02",
      plannedMinutes: "120",
      purpose: "PV-07 の接続箱を交換する",
    },
    groundControlCookie,
  );
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(`/permits/${permitId}`);
};

export const recordEquipmentChecks = async (harness: Harness, baseCommanderCookie: string, permitId = "EVA-0412", oxygenMinutes = 200) => {
  for (const workerId of ["W-01", "W-02"]) {
    const response = await post(
      harness,
      `/permits/${permitId}/equipment-checks`,
      { workerId, oxygenMinutes: String(oxygenMinutes), note: `${workerId} のスーツを点検した`, needsMaintenance: "0" },
      baseCommanderCookie,
    );
    expect(response.status).toBe(303);
  }
};
