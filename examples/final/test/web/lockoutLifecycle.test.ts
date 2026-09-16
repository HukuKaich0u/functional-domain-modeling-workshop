import { describe, expect, test } from "vitest";

import { domainEventsTable } from "../../src/adaptor/secondary/sqlite/schema.js";
import {
  createStaffedHarness,
  page,
  post,
  recordEquipmentChecks,
  registerOperations,
  requestPermit,
} from "../support/webHarness.js";

describe("承認から完了まで遮断を維持する", () => {
  test("承認済の札は外せず、理由付きで中止してから掛けた本人が外す", async () => {
    const { harness, groundControlCookie, baseCommanderCookie, electricianCookie } = await createStaffedHarness();
    await registerOperations(harness, groundControlCookie);
    await requestPermit(harness, groundControlCookie);
    await recordEquipmentChecks(harness, baseCommanderCookie);
    await post(harness, "/segments/PV-07/lockout", { permitId: "EVA-0412" }, electricianCookie);
    expect((await post(harness, "/permits/EVA-0412/approve", {}, baseCommanderCookie)).headers.get("location")).toBe("/permits/EVA-0412");
    const before = harness.database.select().from(domainEventsTable).all().length;

    const release = await post(harness, "/segments/PV-07/release", {}, electricianCookie);
    expect(release.headers.get("location")).toBe("/segments/PV-07?error=permit-requires-lockout");
    expect(harness.database.select().from(domainEventsTable).all()).toHaveLength(before);
    await expect((await page(harness, "/permits/EVA-0412", baseCommanderCookie)).json()).resolves.toMatchObject({
      props: { permit: { kind: "Approved" }, segment: { lockout: { kind: "LockedOut" } } },
    });
    await expect((await page(harness, "/segments/PV-07?error=permit-requires-lockout", electricianCookie)).json()).resolves.toMatchObject({
      props: { errors: { form: expect.stringContaining("中止") } },
    });

    expect((await post(harness, "/permits/EVA-0412/abort", { reason: "設備を再確認するため中止" }, groundControlCookie)).headers.get("location")).toBe("/permits/EVA-0412");
    expect((await post(harness, "/segments/PV-07/release", {}, electricianCookie)).headers.get("location")).toBe("/segments/PV-07");
    expect((await post(harness, "/permits/EVA-0412/egress", {}, baseCommanderCookie)).headers.get("location")).toBe("/permits/EVA-0412?error=invalid-state");
    await expect((await page(harness, "/permits/EVA-0412", baseCommanderCookie)).json()).resolves.toMatchObject({
      props: { permit: { kind: "Aborted" }, segment: { lockout: { kind: "Energized" } } },
    });
  });
});
