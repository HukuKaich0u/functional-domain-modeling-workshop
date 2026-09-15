import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { installationTable, sessionsTable, usersTable } from "../../src/adaptor/secondary/sqlite/schema.js";
import { cookiePair, createHarness, credentials, login, page, post, setup } from "../support/webHarness.js";

describe("初期設定とログイン", () => {
  test("未設定なら / と /login は /setup へ送り、設定後は /setup が /login へ送る", async () => {
    const harness = createHarness();
    expect((await page(harness, "/")).headers.get("location")).toBe("/setup");
    expect((await page(harness, "/login")).headers.get("location")).toBe("/setup");
    await expect((await page(harness, "/setup")).json()).resolves.toMatchObject({ component: "Setup" });

    const adminCookie = await setup(harness);
    expect(adminCookie).toMatch(/^moonbase_session=[a-f0-9]{64}$/);
    expect((await page(harness, "/setup", adminCookie)).headers.get("location")).toBe("/");
    expect((await page(harness, "/setup")).headers.get("location")).toBe("/login");
    expect(harness.database.select().from(installationTable).all()).toHaveLength(1);
  });

  test("二人目の初期設定は Admin を増やさず /login へ送る", async () => {
    const harness = createHarness();
    await setup(harness);
    const second = await post(harness, "/setup", { ...credentials.admin, email: "second@moonbase.test" });
    expect(second.status).toBe(302);
    expect(second.headers.get("location")).toBe("/login");
    expect(harness.database.select().from(usersTable).all()).toHaveLength(1);
  });

  test("入力の不備は Setup を再描画し、Admin を作らない", async () => {
    const harness = createHarness();
    const response = await post(harness, "/setup", { email: "not-an-email", name: "", password: "short" });
    await expect(response.json()).resolves.toMatchObject({
      component: "Setup",
      props: { errors: { email: expect.any(String), name: expect.any(String), password: expect.any(String) } },
    });
    expect(harness.database.select().from(usersTable).all()).toHaveLength(0);
  });

  test("誤った資格情報は同じ文言で拒み、正しい資格情報は session cookie を返す", async () => {
    const harness = createHarness();
    await setup(harness);
    const wrongPassword = await post(harness, "/login", { email: credentials.admin.email, password: "wrong password value" });
    const unknownEmail = await post(harness, "/login", { email: "nobody@moonbase.test", password: "wrong password value" });
    const wrongBody = await wrongPassword.json();
    const unknownBody = await unknownEmail.json();
    expect(wrongBody).toMatchObject({ component: "Login", props: { errors: { credentials: expect.any(String) } } });
    expect(unknownBody).toEqual(wrongBody);

    const cookie = await login(harness, credentials.admin);
    const dashboard = await page(harness, "/", cookie);
    await expect(dashboard.json()).resolves.toMatchObject({
      component: "Dashboard",
      props: { auth: { user: { role: "Admin" } } },
    });
    expect(harness.database.select().from(sessionsTable).all()).toHaveLength(2);
  });

  test("ログアウトは session を削除し cookie を消す。期限切れの cookie は無効になる", async () => {
    const harness = createHarness();
    const cookie = await setup(harness);
    const logout = await post(harness, "/logout", {}, cookie);
    expect(logout.status).toBe(302);
    expect(logout.headers.get("location")).toBe("/login");
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(harness.database.select().from(sessionsTable).all()).toHaveLength(0);
    expect((await page(harness, "/permits", cookie)).headers.get("location")).toBe("/login");

    const fresh = await login(harness, credentials.admin);
    harness.setTime("2026-09-16T01:30:00.000Z");
    const expired = await page(harness, "/permits", fresh);
    expect(expired.headers.get("location")).toBe("/login");
    expect(expired.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  test("別オリジンからのフォーム送信は CSRF で拒む", async () => {
    const harness = createHarness();
    const response = await post(harness, "/setup", credentials.admin, undefined, "https://evil.example");
    expect(response.status).toBe(403);
    expect(harness.database.select().from(usersTable).where(eq(usersTable.email, credentials.admin.email)).all()).toHaveLength(0);
  });

  test("session cookie は HttpOnly と SameSite=Lax を持ち、production では Secure が付く", async () => {
    const development = createHarness();
    const developmentCookie = (await post(development, "/setup", credentials.admin)).headers.get("set-cookie") ?? "";
    expect(developmentCookie).toContain("HttpOnly");
    expect(developmentCookie).toContain("SameSite=Lax");
    expect(developmentCookie).not.toContain("Secure");

    const production = createHarness(true);
    const productionResponse = await post(production, "/setup", credentials.admin);
    expect(cookiePair(productionResponse)).toMatch(/^moonbase_session=/);
    expect(productionResponse.headers.get("set-cookie")).toContain("Secure");
  });
});
