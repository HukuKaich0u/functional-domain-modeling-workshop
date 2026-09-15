import { Link } from "@inertiajs/react";
import { useState, type ReactElement, type ReactNode } from "react";

import type { MoonbaseUserView } from "../contracts.js";
import { Icon, type IconName } from "./Icon.js";

export type NavigationKey =
  | "dashboard"
  | "permits"
  | "segments"
  | "workers"
  | "space-weather"
  | "users"
  | "events";

type AppShellProps = Readonly<{
  activeNavigation?: NavigationKey | undefined;
  children: ReactNode;
  title: string;
  user?: MoonbaseUserView | null | undefined;
}>;

type NavigationItem = Readonly<{
  href: string;
  icon: IconName;
  key: NavigationKey;
  label: string;
  roles: readonly MoonbaseUserView["role"][];
}>;

const allRoles: readonly MoonbaseUserView["role"][] = [
  "Admin",
  "GroundControl",
  "BaseCommander",
  "Electrician",
];

const navigationItems: readonly NavigationItem[] = [
  {
    key: "dashboard",
    href: "/",
    label: "作業状況ボード",
    icon: "dashboard",
    roles: allRoles,
  },
  {
    key: "permits",
    href: "/permits",
    label: "作業許可",
    icon: "permit",
    roles: allRoles,
  },
  {
    key: "segments",
    href: "/segments",
    label: "系統区間・遮断盤",
    icon: "bolt",
    roles: allRoles,
  },
  {
    key: "workers",
    href: "/workers",
    label: "隊員",
    icon: "helmet",
    roles: ["Admin", "GroundControl"],
  },
  {
    key: "space-weather",
    href: "/space-weather",
    label: "宇宙天気",
    icon: "sun",
    roles: allRoles,
  },
  {
    key: "users",
    href: "/users",
    label: "ユーザー",
    icon: "users",
    roles: ["Admin"],
  },
  {
    key: "events",
    href: "/events",
    label: "作業記録",
    icon: "events",
    roles: ["Admin"],
  },
];

export const AppShell = ({
  activeNavigation,
  children,
  title,
  user,
}: AppShellProps): ReactElement => {
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);

  if (user === undefined || user === null) {
    return (
      <div className="app-shell app-shell--public">
        <main className="app-content app-main">{children}</main>
      </div>
    );
  }

  return (
    <div
      className={
        isNavigationOpen
          ? "app-shell app-shell--navigation-open"
          : "app-shell"
      }
    >
      <button
        aria-controls="app-navigation"
        aria-expanded={isNavigationOpen}
        aria-label={isNavigationOpen ? "ナビゲーションを閉じる" : "ナビゲーションを開く"}
        className="navigation-toggle"
        onClick={() => setIsNavigationOpen((isOpen) => !isOpen)}
        type="button"
      >
        <Icon name="menu" />
      </button>
      <button
        aria-label="ナビゲーションを閉じる"
        className="navigation-backdrop"
        onClick={() => setIsNavigationOpen(false)}
        type="button"
      />
      <aside aria-label="アプリケーションサイドバー" className="app-sidebar">
        <div className="app-sidebar__brand">
          <Link className="brand" href="/">
            <Icon name="moon" />
            <span>MoonBase 日の出基地</span>
          </Link>
        </div>
        <nav
          aria-label="メインナビゲーション"
          className="app-navigation"
          id="app-navigation"
        >
          {navigationItems
            .filter((item) => item.roles.includes(user.role))
            .map((item) => (
              <Link
                aria-current={activeNavigation === item.key ? "page" : undefined}
                aria-label={item.label}
                className={
                  activeNavigation === item.key
                    ? "app-navigation__link app-navigation__link--active"
                    : "app-navigation__link"
                }
                href={item.href}
                key={item.key}
                title={item.label}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            ))}
        </nav>
        <div className="app-sidebar__user">
          <span className="role">{user.role}</span>
          <Link
            aria-label="ログアウト"
            as="button"
            className="app-sidebar__logout"
            href="/logout"
            method="post"
            title="ログアウト"
          >
            <Icon name="logout" />
            <span>ログアウト</span>
          </Link>
        </div>
      </aside>
      <main className="app-content app-main">
        <header className="top-bar">
          <p>{title}</p>
          <span>{user.role}</span>
        </header>
        <div className="app-content__inner">{children}</div>
      </main>
    </div>
  );
};
