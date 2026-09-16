import type { Curriculum } from "../sessions/navigation";

export const preworkCurriculum = {
  title: "事前学習",
  href: "/prework/",
  pageLabel: "事前学習",
  unit: "ページ",
  items: [
    { slug: "index", sequence: "案内", title: "事前学習の進め方", href: "/prework/" },
    {
      slug: "programming-paradigms",
      sequence: "01",
      title: "プログラミングのパラダイムを読み比べる",
      href: "/prework/programming-paradigms/",
    },
    {
      slug: "type-system",
      sequence: "02",
      title: "型システムと型駆動プログラミングの基礎",
      href: "/prework/type-system/",
    },
  ],
} as const satisfies Curriculum;
