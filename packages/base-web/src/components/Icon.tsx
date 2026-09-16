import type { ReactElement } from "react";

export type IconName =
  | "activity"
  | "bolt"
  | "calendar"
  | "dashboard"
  | "events"
  | "followUp"
  | "helmet"
  | "logout"
  | "menu"
  | "moon"
  | "owners"
  | "permit"
  | "plus"
  | "sun"
  | "users";

const paths: Readonly<Record<IconName, ReactElement>> = {
  activity: <path d="M3 12h4l2-7 4 14 2-7h6" />,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  calendar: <path d="M7 3v4m10-4v4M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />,
  dashboard: <path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z" />,
  events: <path d="M5 4h14v16H5V4Zm3 4h8m-8 4h8m-8 4h5" />,
  followUp: <path d="M4 5h16v11H8l-4 4V5Zm4 4h8m-8 3h5" />,
  helmet: <path d="M5 14a7 7 0 0 1 14 0v3H5v-3Zm-1 3h16v2H4v-2Zm4-3a4 4 0 0 1 8 0" />,
  logout: <path d="M10 5H5v14h5m4-10 4 3-4 3m-7-3h11" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  owners: <path d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1m6-9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm10 9v-1a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
  permit: <path d="M8 4h8l2 2v14H6V6l2-2Zm1 6h6m-6 4h6m-6 4h4M9 4v3h6V4" />,
  plus: <path d="M12 5v14m-7-7h14" />,
  sun: <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />,
  users: <path d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1m14-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
};

export type IconProps = Readonly<{ name: IconName }>;

export const Icon = ({ name }: IconProps): ReactElement => (
  <svg
    aria-hidden="true"
    className="icon"
    fill="none"
    focusable="false"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.8"
    viewBox="0 0 24 24"
  >
    {paths[name]}
  </svg>
);
