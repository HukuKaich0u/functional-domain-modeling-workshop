export type SessionNavigationItem = Readonly<{
  slug: string;
  title: string;
}>;

export const sessionNavigationItems = [
  { slug: "00-system-handover", title: "業務とシステムを引き継ぐ" },
  {
    slug: "01-design-approaches",
    title: "開始承認の7条件を10通りに書いて比べる",
  },
  {
    slug: "02-business-events-and-workflows",
    title: "EventStormingとROPで作業中止を設計する",
  },
  { slug: "03-state-transitions", title: "作業許可の状態と遷移をモデル化する" },
  {
    slug: "04-semantic-identifiers",
    title: "開始承認の識別子を型で区別する",
  },
  {
    slug: "05-boundaries-and-sensitive-data",
    title: "開始承認の入力を境界で検証する",
  },
  { slug: "06-workflow-errors", title: "失敗をユースケースの結果として扱う" },
  { slug: "07-effects-and-consistency", title: "副作用と整合性境界を設計する" },
  { slug: "final", title: "参照実装で境界をたどる" },
] as const satisfies readonly SessionNavigationItem[];
