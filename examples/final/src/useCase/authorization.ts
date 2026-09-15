import { err, ok, type Result } from "neverthrow";

import { Permission } from "../domain/user/permission.js";
import type { Admin, User } from "../domain/user/user.js";
import type { UnauthorizedError } from "./errors.js";

const unauthorized = (user: User): UnauthorizedError => ({
  kind: "Unauthorized",
  actorUserId: user.userId,
});

export const ensureAdmin = (user: User): Result<Admin, UnauthorizedError> =>
  user.kind === "Admin" ? ok(user) : err(unauthorized(user));

/** 地上管制と Admin。系統区間・隊員の登録、作業許可の申請、宇宙天気の報告 */
export const ensureCanManageOperations = (user: User): Result<User, UnauthorizedError> =>
  Permission.canManageOperations(user) ? ok(user) : err(unauthorized(user));

/** 基地長と Admin。装備点検の記録、開始承認、出発と帰還の記録 */
export const ensureCanApproveEva = (user: User): Result<User, UnauthorizedError> =>
  Permission.canApproveEva(user) ? ok(user) : err(unauthorized(user));

/** 電気主任と Admin。遮断札と完了 */
export const ensureCanManageLockout = (user: User): Result<User, UnauthorizedError> =>
  Permission.canManageLockout(user) ? ok(user) : err(unauthorized(user));

/** 地上管制、基地長、Admin。中止 */
export const ensureCanAbortEva = (user: User): Result<User, UnauthorizedError> =>
  Permission.canAbortEva(user) ? ok(user) : err(unauthorized(user));
