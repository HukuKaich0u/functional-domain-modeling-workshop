/**
 * MoonBase の線画アイコンのパス定義。絵文字の代わりに使う。
 * 24px グリッド、線幅 1.5px 前提で描いている。
 */
export type MoonbaseIconName =
  | "moon"
  | "permit"
  | "suit"
  | "exposure"
  | "sun"
  | "tag"
  | "roles"
  | "log"
  | "panel"
  | "antenna"
  | "compass"
  | "bolt"
  | "arrow";

export const moonbaseIconPaths: Readonly<Record<MoonbaseIconName, string>> = {
  moon: '<path d="M14.5 3.5a8.5 8.5 0 1 0 6 14.9A9 9 0 0 1 14.5 3.5Z"/>',
  permit:
    '<rect x="5" y="3.5" width="14" height="17" rx="1.5"/><path d="M9 3.5h6v3H9z"/><path d="M8.5 11h7M8.5 14.5h7M8.5 18h4"/>',
  suit: '<circle cx="12" cy="9" r="5.5"/><path d="M8.5 9h7"/><path d="M6.5 21v-3.5a5.5 5.5 0 0 1 11 0V21"/>',
  exposure:
    '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="1.5"/><path d="M12 3.5v5M5.3 16.5l4.3-2.5M18.7 16.5l-4.3-2.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7 7 17M17 7l1.7-1.7"/>',
  tag: '<path d="M4.5 12.5v-8h8l7 7-8 8z"/><circle cx="8.5" cy="8.5" r="1.25"/>',
  roles:
    '<circle cx="8" cy="8.5" r="3"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M3.5 19a4.5 4.5 0 0 1 9 0M13.5 18.5a3.5 3.5 0 0 1 7 0"/>',
  log: '<path d="M6 4.5h12v15H6z"/><path d="M9 9h6M9 12.5h6M9 16h3.5"/>',
  panel:
    '<path d="M4.5 5.5h15l1.5 9H3z"/><path d="M8 5.5l-1 9M16 5.5l1 9M4 10h16"/><path d="M12 14.5V20M8.5 20h7"/>',
  antenna:
    '<path d="M12 21v-8"/><circle cx="12" cy="11" r="2"/><path d="M6.5 6.5a7.8 7.8 0 0 1 11 0M8.8 8.8a4.5 4.5 0 0 1 6.4 0"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="m14.8 9.2-1.6 4-4 1.6 1.6-4z"/>',
  bolt: '<path d="M13 3 5.5 13.5H12L11 21l7.5-10.5H12z"/>',
  arrow: '<path d="M5 12h13"/><path d="m13 7 5 5-5 5"/>',
};
