import { describe, expect, test } from "vitest";

import { Permission } from "../../src/domain/user/permission.js";
import { User } from "../../src/domain/user/user.js";
import { userRoles } from "../../src/domain/user/userRole.js";
import { admin, baseCommander, electrician, eventContext, groundControl } from "../support/fixtures.js";

describe("Permission", () => {
  test("4つの役割にそれぞれの担当がある", () => {
    expect(userRoles).toEqual(["Admin", "GroundControl", "BaseCommander", "Electrician"]);
    const matrix = [admin, groundControl, baseCommander, electrician].map((user) => ({
      role: user.kind,
      users: Permission.canManageUsers(user),
      operations: Permission.canManageOperations(user),
      approve: Permission.canApproveEva(user),
      lockout: Permission.canManageLockout(user),
      abort: Permission.canAbortEva(user),
      events: Permission.canViewEvents(user),
    }));
    expect(matrix).toEqual([
      { role: "Admin", users: true, operations: true, approve: true, lockout: true, abort: true, events: true },
      { role: "GroundControl", users: false, operations: true, approve: false, lockout: false, abort: true, events: false },
      { role: "BaseCommander", users: false, operations: false, approve: true, lockout: false, abort: true, events: false },
      { role: "Electrician", users: false, operations: false, approve: false, lockout: true, abort: false, events: false },
    ]);
  });

  test("利用者のイベントは表示名やメールアドレスをペイロードに出さない", () => {
    const created = User.create(eventContext(1))(groundControl);
    expect(created.eventPayload).toEqual({ userId: groundControl.userId, role: "GroundControl" });
    expect(JSON.stringify(created)).not.toContain("moonbase.test");
    const deleted = User.delete(eventContext(2))(groundControl);
    expect(deleted.aggregateState).toBeUndefined();
  });
});
