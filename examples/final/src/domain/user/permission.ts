import type { User } from "./user.js";

const isAdmin = (user: User) => user.kind === "Admin";

const canManageUsers = (user: User): boolean => isAdmin(user);
/** 系統区間と隊員の登録、作業許可の申請と中止、宇宙天気の報告 */
const canManageOperations = (user: User): boolean =>
  user.kind === "Admin" || user.kind === "GroundControl";
/** 基地長とAdmin。開始承認だけは、基地長が船外にいる間の地上管制も含む */
const canApproveEva = (user: User, baseCommanderIsOutside = false): boolean =>
  user.kind === "Admin" ||
  user.kind === "BaseCommander" ||
  (user.kind === "GroundControl" && baseCommanderIsOutside);
/** 遮断札を掛ける・外す、作業許可の完了 */
const canManageLockout = (user: User): boolean =>
  user.kind === "Admin" || user.kind === "Electrician";
/** 中止は地上管制または基地長（規程第6条） */
const canAbortEva = (user: User): boolean =>
  user.kind === "Admin" || user.kind === "GroundControl" || user.kind === "BaseCommander";
const canViewEvents = (user: User): boolean => isAdmin(user);

export const Permission = {
  isAdmin,
  canManageUsers,
  canManageOperations,
  canApproveEva,
  canManageLockout,
  canAbortEva,
  canViewEvents,
} as const;
