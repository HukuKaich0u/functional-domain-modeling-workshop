import { describe, expect, test } from "vitest";

import { segmentsTable, usersTable, workersTable } from "../../src/adaptor/secondary/sqlite/schema.js";
import {
  createStaffedHarness,
  credentials,
  page,
  post,
  registerOperations,
  requestPermit,
} from "../support/webHarness.js";

describe("系統区間と隊員の管理", () => {
  test("隊員の一覧と被ばく量は地上管制と Admin だけが見る", async () => {
    const { harness, adminCookie, groundControlCookie, baseCommanderCookie, electricianCookie } = await createStaffedHarness();
    await registerOperations(harness, groundControlCookie);

    await expect((await page(harness, "/workers", groundControlCookie)).json()).resolves.toMatchObject({
      component: "Workers/Index",
      props: {
        workers: [
          { workerId: "W-01", qualification: "Electrician", radiationExposureMicroSv: 12_000 },
          { workerId: "W-02", qualification: "General", radiationExposureMicroSv: 8_000 },
        ],
      },
    });
    expect((await page(harness, "/workers", adminCookie)).status).toBe(200);
    expect((await page(harness, "/workers", baseCommanderCookie)).status).toBe(403);
    expect((await page(harness, "/workers/W-01", electricianCookie)).status).toBe(403);
    expect((await post(harness, "/workers", { workerId: "W-03", qualification: "General", radiationExposureMicroSv: "0" }, baseCommanderCookie)).status).toBe(403);
  });

  test("隊員番号の重複と書式の不備はフォームに戻し、進行中の許可がある隊員は削除できない", async () => {
    const { harness, groundControlCookie } = await createStaffedHarness();
    await registerOperations(harness, groundControlCookie);

    const duplicate = await post(harness, "/workers", { workerId: "W-01", qualification: "General", radiationExposureMicroSv: "0" }, groundControlCookie);
    await expect(duplicate.json()).resolves.toMatchObject({
      component: "Workers/Form",
      props: { mode: "create", errors: { workerId: expect.stringContaining("既に登録") } },
    });
    const malformed = await post(harness, "/workers", { workerId: "worker-3", qualification: "Pilot", radiationExposureMicroSv: "-5" }, groundControlCookie);
    await expect(malformed.json()).resolves.toMatchObject({
      props: { errors: { workerId: expect.any(String), qualification: expect.any(String), radiationExposureMicroSv: expect.any(String) } },
    });
    expect(harness.database.select().from(workersTable).all()).toHaveLength(2);

    await requestPermit(harness, groundControlCookie);
    const blocked = await post(harness, "/workers/W-01/delete", {}, groundControlCookie);
    expect(blocked.headers.get("location")).toBe("/workers?error=worker-has-active-permit");
    expect((await post(harness, "/workers/W-09/delete", {}, groundControlCookie)).status).toBe(404);
    expect((await post(harness, "/permits/EVA-0412/abort", { reason: "計画変更" }, groundControlCookie)).status).toBe(303);
    expect((await post(harness, "/workers/W-01/delete", {}, groundControlCookie)).headers.get("location")).toBe("/workers");
    expect(harness.database.select().from(workersTable).all().map(({ workerId }) => workerId)).toEqual(["W-02"]);
  });

  test("系統区間は全員が見られ、登録と削除は地上管制、札は電気主任が扱う", async () => {
    const { harness, groundControlCookie, baseCommanderCookie, electricianCookie } = await createStaffedHarness();
    await registerOperations(harness, groundControlCookie);

    await expect((await page(harness, "/segments", electricianCookie)).json()).resolves.toMatchObject({
      component: "Segments/Index",
      props: { segments: [{ segmentId: "PV-07", label: "PV-07 給電区間", lockout: { kind: "Energized" } }], canRegister: false },
    });
    expect((await post(harness, "/segments", { segmentId: "PV-08", label: "PV-08 給電区間" }, electricianCookie)).status).toBe(403);
    expect((await post(harness, "/segments/PV-07/lockout", { permitId: "EVA-0412" }, baseCommanderCookie)).status).toBe(403);
    const duplicate = await post(harness, "/segments", { segmentId: "PV-07", label: "重複" }, groundControlCookie);
    await expect(duplicate.json()).resolves.toMatchObject({
      component: "Segments/Form",
      props: { errors: { segmentId: expect.stringContaining("既に登録") } },
    });
    expect((await post(harness, "/segments/PV-07", { label: "PV-07 給電区間（北）" }, groundControlCookie)).status).toBe(303);
    expect(harness.database.select().from(segmentsTable).get()?.label).toBe("PV-07 給電区間（北）");

    await requestPermit(harness, groundControlCookie);
    const missingPermit = await post(harness, "/segments/PV-07/lockout", { permitId: "EVA-9999" }, electricianCookie);
    expect(missingPermit.headers.get("location")).toBe("/segments/PV-07?error=permit-not-found");
    expect((await post(harness, "/segments/PV-07/lockout", { permitId: "EVA-0412" }, electricianCookie)).status).toBe(303);
    const inUse = await post(harness, "/segments/PV-07/delete", {}, groundControlCookie);
    expect(inUse.headers.get("location")).toBe("/segments/PV-07?error=segment-in-use");
    await expect((await page(harness, "/segments/PV-07?error=segment-in-use", groundControlCookie)).json()).resolves.toMatchObject({
      props: { errors: { form: expect.stringContaining("削除できません") } },
    });
    expect((await page(harness, "/segments/PV-99", groundControlCookie)).status).toBe(404);
    expect((await page(harness, "/segments/not-a-segment", groundControlCookie)).status).toBe(404);
  });
});

describe("ユーザー管理", () => {
  test("Admin だけがユーザーを扱い、最後の Admin と自分自身は削除できない", async () => {
    const { harness, adminCookie, groundControlCookie } = await createStaffedHarness();
    expect((await page(harness, "/users", groundControlCookie)).status).toBe(403);
    const list = await (await page(harness, "/users", adminCookie)).json();
    expect(list).toMatchObject({ component: "Users/Index" });
    const users = (list as { props: { users: Array<{ userId: string; role: string; email: string }> } }).props.users;
    expect(users.map(({ role }) => role).sort()).toEqual(["Admin", "BaseCommander", "Electrician", "GroundControl"]);
    expect(JSON.stringify(list)).not.toContain("scrypt$");

    const adminRow = users.find(({ role }) => role === "Admin");
    const groundControlRow = users.find(({ role }) => role === "GroundControl");
    expect(adminRow).toBeDefined();
    expect(groundControlRow).toBeDefined();
    expect((await post(harness, `/users/${adminRow!.userId}/delete`, {}, adminCookie)).headers.get("location")).toBe("/users?error=cannot-delete-self");

    const duplicateEmail = await post(harness, "/users", { ...credentials.groundControl, role: "Electrician" }, adminCookie);
    await expect(duplicateEmail.json()).resolves.toMatchObject({
      component: "Users/Form",
      props: { errors: { email: expect.any(String) } },
    });
    const invalidRole = await post(harness, "/users", { ...credentials.electricianB, role: "Receptionist" }, adminCookie);
    await expect(invalidRole.json()).resolves.toMatchObject({ props: { errors: { role: expect.any(String) } } });

    const promoted = await post(
      harness,
      `/users/${groundControlRow!.userId}`,
      { email: credentials.groundControl.email, name: credentials.groundControl.name, role: "Admin" },
      adminCookie,
    );
    expect(promoted.status).toBe(302);
    expect((await post(harness, `/users/${adminRow!.userId}/delete`, {}, adminCookie)).headers.get("location")).toBe("/users?error=cannot-delete-self");
    const demoteSecond = await post(
      harness,
      `/users/${groundControlRow!.userId}`,
      { email: credentials.groundControl.email, name: credentials.groundControl.name, role: "GroundControl" },
      adminCookie,
    );
    expect(demoteSecond.status).toBe(302);
    const demoteLast = await post(
      harness,
      `/users/${adminRow!.userId}`,
      { email: credentials.admin.email, name: credentials.admin.name, role: "Electrician" },
      adminCookie,
    );
    await expect(demoteLast.json()).resolves.toMatchObject({ props: { errors: { role: expect.stringContaining("最後の Admin") } } });

    const reset = await post(harness, `/users/${groundControlRow!.userId}/reset-password`, { password: "rotated password value" }, adminCookie);
    expect(reset.status).toBe(302);
    const relogin = await post(harness, "/login", { email: credentials.groundControl.email, password: "rotated password value" });
    expect(relogin.headers.get("location")).toBe("/");
    expect(harness.database.select().from(usersTable).all()).toHaveLength(4);
  });
});
