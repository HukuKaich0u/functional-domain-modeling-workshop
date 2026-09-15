import type { User } from "../domain/user/user.js";
import type { UserEmail } from "../domain/user/userEmail.js";
import type { UserId } from "../domain/user/userId.js";
import type { UserName } from "../domain/user/userName.js";

export type UserView = Readonly<{
  kind: User["kind"];
  userId: UserId;
  email: UserEmail;
  name: UserName;
}>;

/** パスワードハッシュを除いた、管理画面向けの表現 */
export const toUserView = (user: User): UserView => ({
  kind: user.kind,
  userId: user.userId,
  email: user.email,
  name: user.name,
});
