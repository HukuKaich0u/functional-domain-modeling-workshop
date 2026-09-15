import { z } from "zod";

/**
 * 役割。Admin はシステム担当、GroundControl は地上管制、BaseCommander は基地長、
 * Electrician は電気主任。人は役割名で呼び、個人名は表示名にだけ持つ。
 */
export const userRoles = ["Admin", "GroundControl", "BaseCommander", "Electrician"] as const;
export const UserRoleSchema = z.enum(userRoles);
export type UserRole = z.infer<typeof UserRoleSchema>;
