import { describe, expect, it } from "vitest";
import { sessionNavigationItems } from "./sessions/navigation";
import type { SessionNavigation, SessionSummary } from "./sessions/types";
type PageModule = Readonly<{
  session: SessionSummary;
  navigation?: SessionNavigation;
}>;

const pageModules = import.meta.glob<PageModule>([
  "./pages/sessions/*.astro",
  "!./pages/sessions/index.astro",
], {
  eager: true,
});
const pageSources = import.meta.glob<string>([
  "./pages/sessions/*.astro",
  "!./pages/sessions/index.astro",
], {
  eager: true,
  query: "?raw",
  import: "default",
});
const pages = Object.entries(pageModules)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([path, page]) => ({ path, ...page }));
const sessions = pages.map(({ session }) => session);
const exerciseSessions = sessions.filter(
  (session) => session.kind === "exercise",
);

const expectedCurriculum = [
  {
    slug: "00-system-handover",
    sequence: "00",
    title: "業務とシステムを引き継ぐ",
    durationMinutes: 10,
    kind: "orientation",
    exerciseCommand: undefined,
    snapshot: "session-00",
    timeBreakdown: { brief: 4, teach: 3, exercise: 0, review: 3 },
  },
  {
    slug: "01-design-approaches",
    sequence: "01",
    title: "開始承認の7条件を10通りに書いて比べる",
    durationMinutes: 20,
    kind: "comparison",
    exerciseCommand: undefined,
    snapshot: "session-01",
    timeBreakdown: { brief: 2, teach: 10, exercise: 5, review: 3 },
  },
  {
    slug: "02-business-events-and-workflows",
    sequence: "02",
    title: "EventStormingとROPで作業中止を設計する",
    durationMinutes: 15,
    kind: "workshop",
    exerciseCommand: undefined,
    snapshot: undefined,
    timeBreakdown: { brief: 2, teach: 7, exercise: 4, review: 2 },
  },
  {
    slug: "03-state-transitions",
    sequence: "03",
    title: "作業許可の状態と遷移をモデル化する",
    durationMinutes: 30,
    kind: "exercise",
    exerciseCommand: "pnpm exercise:03",
    snapshot: "session-03",
    timeBreakdown: { brief: 4, teach: 6, exercise: 13, review: 7 },
  },
  {
    slug: "04-semantic-identifiers",
    sequence: "04",
    title: "開始承認の識別子を型で区別する",
    durationMinutes: 30,
    kind: "exercise",
    exerciseCommand: "pnpm exercise:04",
    snapshot: "session-04",
    timeBreakdown: { brief: 4, teach: 6, exercise: 13, review: 7 },
  },
  {
    slug: "05-boundaries-and-sensitive-data",
    sequence: "05",
    title: "開始承認の入力を境界で検証する",
    durationMinutes: 30,
    kind: "exercise",
    exerciseCommand: "pnpm exercise:05",
    snapshot: "session-05",
    timeBreakdown: { brief: 4, teach: 7, exercise: 12, review: 7 },
  },
  {
    slug: "06-workflow-errors",
    sequence: "06",
    title: "失敗をユースケースの結果として扱う",
    durationMinutes: 30,
    kind: "exercise",
    exerciseCommand: "pnpm exercise:06",
    snapshot: "session-06",
    timeBreakdown: { brief: 4, teach: 8, exercise: 10, review: 8 },
  },
  {
    slug: "07-effects-and-consistency",
    sequence: "07",
    title: "副作用と整合性境界を設計する",
    durationMinutes: 30,
    kind: "exercise",
    exerciseCommand: "pnpm exercise:07",
    snapshot: "session-07",
    timeBreakdown: { brief: 4, teach: 3, exercise: 15, review: 8 },
  },
  {
    slug: "final",
    sequence: "Final",
    title: "参照実装で境界をたどる",
    durationMinutes: 5,
    kind: "reference",
    exerciseCommand: undefined,
    snapshot: "final",
    timeBreakdown: { brief: 0, teach: 4, exercise: 0, review: 1 },
  },
] as const;

const expectedEpisodes = [
  [
    "補給便で着任した初日、前任者は同じ便で帰る支度をしながら、事故報告 第1号のプリントを手渡してきました。",
    "帰還済みの作業許可は「作業中」へ戻り、点呼は40分の捜索に。共有ログには2名の被ばく量まで律儀にそろっています。",
    "引き継ぎ資料を開く前に、記録の逆戻りと被ばく量の流出の再現条件だけは確認できました。",
  ],
  [
    "引き継ぎの次の検討で、開始承認の条件は、地上管制の端末、基地の端末、医務の表計算に、3通りの書き方で散らばっていました。",
    "同じ7条件のはずなのに、酸素が足りない申請を、1台は「夜間」と表示し、1台は500を返し、1台は承認しました。",
    "直す前に、同じ条件を同じ入力で10通りに書いて並べ、どの書き方が何を守り、何を守らないかを見ます。",
  ],
  [
    "出発後の作業許可を、地上管制の担当者が誤って中止できました。",
    "理由のない中止がStoreへ記録され、どの条件を確認したか説明できません。",
    "実装へ進む前に、依頼、確認する条件、集約、成功時に起きる出来事を決めます。",
  ],
  [
    "月面日第13日、装備点検の記録がないまま、PV-06 補修の作業許可が承認済になりました。",
    "完了したはずの同じ許可は、夕方には地上管制の端末から再び承認済へ戻され、作業記録には完了と承認済が並びました。",
    "許可された状態遷移を覚えていたのは基地長と電気主任だけで、コードは何でも通す危ない設計でした。",
  ],
  [
    "開始承認の入力で、作業区画の識別子と遮断した系統区間の識別子が入れ替わっていました。",
    "どちらも PV-07 の形なので、文字列の検査だけでは取り違えを止められません。",
    "作業する区画を選ぶ値と、遮断した区間を選ぶ値を、型で区別する必要があります。",
  ],
  undefined,
  [
    "古い許可番号が残っていた地上管制の端末から開始承認を送ると、システムは許可なしを「状態不正」と表示しました。",
    "フレア警報中の承認は500だけを返し、地上管制は障害と判断してシステム担当を呼びました。警報中で承認できないという理由が伝わるまで15分かかりました。",
    "新しい例外を投げた側は、呼び出し側のcatch漏れを型から確かめられませんでした。",
  ],
  [
    "PV-07 の開始承認で、作業許可の状態だけが先に承認済になり、承認の作業記録はどこにも残りませんでした。",
    "再現テストでは承認時刻と記録 ID が毎回変わり、月面日は記録されず、失敗の証拠まで落ち着きがありません。",
    "状態更新は即決、記録保存は自由行動。点呼の答えは無線で確かめるしかありませんでした。",
  ],
  [
    "ここまで直した頃、隊員たちはとっくにエアロックの内側に戻り、開発者だけが参照実装の前に残っていました。",
    "入力、失敗、イベント、保存、例外を順に追うと、さっきまでの事故がそれぞれ決まった場所で待っています。",
    "完成形と呼んでも、事故が消えたわけではありません。置き場所と担当が決まっただけです。",
  ],
] as const;

const expectedExercises = [
  {
    slug: "03-state-transitions",
    adv: { articulate: 2, delegate: 9, verify: 2 },
    exerciseModule: {
      dir: "examples/session-03/src/domain/permit",
      fileBudget: 2,
      lineBudget: 35,
    },
    solutionSnapshot: "session-04",
    solutionPresentation: "excerpt",
    peerReviewPromises: "inline",
    peerReview: {
      minutes: 7,
      pickCount: 2,
      questions: [
        "`approve` は `Requested` だけを受け取り、完了・中止済みの作業許可を型で拒否しますか。",
        "`close` は `Returned` だけを受け取り、帰還の記録前には完了できない型ですか。",
        "状態を追加したとき、`assertNever` によって未対応の分岐がコンパイルエラーになりますか。",
      ],
    },
  },
  {
    slug: "04-semantic-identifiers",
    adv: { articulate: 2, delegate: 9, verify: 2 },
    exerciseModule: {
      dir: "examples/session-04/src/domain",
      fileBudget: 5,
      lineBudget: 34,
    },
    solutionSnapshot: "session-05",
    solutionPresentation: "excerpt",
    peerReviewPromises: "reference",
    peerReview: {
      minutes: 7,
      pickCount: 2,
      questions: [
        "`ZoneId` と `SegmentId` を取り違えたコードは、型テストでコンパイルエラーになりますか。",
        "作業許可の全状態で、`zoneId` が `ZoneId` になっていますか。",
        "`approve` は、遮断した系統区間を `SegmentId` として受け取っていますか。",
      ],
    },
  },
  {
    slug: "05-boundaries-and-sensitive-data",
    adv: { articulate: 2, delegate: 8, verify: 2 },
    exerciseModule: {
      dir: "examples/session-05/src/boundary",
      fileBudget: 1,
      lineBudget: 18,
    },
    solutionSnapshot: "session-06",
    solutionPresentation: "excerpt",
    peerReviewPromises: "reference",
    peerReview: {
      minutes: 7,
      pickCount: 2,
      questions: [
        "不正な許可番号または系統区間を含む入力は、`ApproveEvaInput` になりませんか。",
        "`parse` は外部入力を `unknown` として受け取っていますか。",
        "検証に成功した場合だけ、`PermitId` と `SegmentId` をユースケースへ渡せますか。",
      ],
    },
  },
  {
    slug: "06-workflow-errors",
    adv: { articulate: 2, delegate: 5, verify: 3 },
    exerciseModule: {
      dir: "examples/session-06/src",
      fileBudget: 3,
      lineBudget: 80,
    },
    solutionSnapshot: "session-07",
    solutionPresentation: "excerpt",
    peerReviewPromises: "reference",
    peerReview: {
      minutes: 8,
      pickCount: 2,
      questions: [
        "許可なしと状態不正は、異なる `kind` を持つ `Err` になっていますか。",
        "`andThen` は、失敗後の状態遷移と保存を実行しない構造になっていますか。",
        "端末側は業務エラーを `kind` で網羅し、未対応の種類を型エラーにできますか。",
      ],
    },
  },
  {
    slug: "07-effects-and-consistency",
    adv: { articulate: 2, delegate: 10, verify: 3 },
    exerciseModule: {
      dir: "examples/session-07/src/useCase",
      fileBudget: 3,
      lineBudget: 55,
    },
    solutionSnapshot: "session-08",
    solutionPresentation: "completed-file",
    peerReviewPromises: "reference",
    peerReview: {
      minutes: 8,
      pickCount: 2,
      questions: [
        "時刻とイベント ID は実行ごとに一度だけ生成され、同じ `EventContext` に入りますか。",
        "状態と作業記録は、1つのイベントとして同じ `store` に渡されますか。",
        "業務上の競合だけを `Result` で返し、保存障害は reject のまま伝播しますか。",
      ],
    },
  },
] as const;

const expectedNavigation = [
  {
    previous: undefined,
    next: {
      href: "/sessions/01-design-approaches/",
      title: "開始承認の7条件を10通りに書いて比べる",
    },
  },
  {
    previous: {
      href: "/sessions/00-system-handover/",
      title: "業務とシステムを引き継ぐ",
    },
    next: {
      href: "/sessions/02-business-events-and-workflows/",
      title: "EventStormingとROPで作業中止を設計する",
    },
  },
  {
    previous: {
      href: "/sessions/01-design-approaches/",
      title: "開始承認の7条件を10通りに書いて比べる",
    },
    next: {
      href: "/sessions/03-state-transitions/",
      title: "作業許可の状態と遷移をモデル化する",
    },
  },
  {
    previous: {
      href: "/sessions/02-business-events-and-workflows/",
      title: "EventStormingとROPで作業中止を設計する",
    },
    next: {
      href: "/sessions/04-semantic-identifiers/",
      title: "開始承認の識別子を型で区別する",
    },
  },
  {
    previous: {
      href: "/sessions/03-state-transitions/",
      title: "作業許可の状態と遷移をモデル化する",
    },
    next: {
      href: "/sessions/05-boundaries-and-sensitive-data/",
      title: "開始承認の入力を境界で検証する",
    },
  },
  {
    previous: {
      href: "/sessions/04-semantic-identifiers/",
      title: "開始承認の識別子を型で区別する",
    },
    next: {
      href: "/sessions/06-workflow-errors/",
      title: "失敗をユースケースの結果として扱う",
    },
  },
  {
    previous: {
      href: "/sessions/05-boundaries-and-sensitive-data/",
      title: "開始承認の入力を境界で検証する",
    },
    next: {
      href: "/sessions/07-effects-and-consistency/",
      title: "副作用と整合性境界を設計する",
    },
  },
  {
    previous: {
      href: "/sessions/06-workflow-errors/",
      title: "失敗をユースケースの結果として扱う",
    },
    next: {
      href: "/sessions/final/",
      title: "参照実装で境界をたどる",
    },
  },
  {
    previous: {
      href: "/sessions/07-effects-and-consistency/",
      title: "副作用と整合性境界を設計する",
    },
    next: undefined,
  },
] as const satisfies readonly SessionNavigation[];

describe("page-owned session contracts", () => {
  it("keeps the complete curriculum metadata in page order", () => {
    expect(
      sessions.map((session) => ({
        slug: session.slug,
        sequence: session.sequence,
        title: session.title,
        durationMinutes: session.durationMinutes,
        kind: session.kind,
        exerciseCommand: session.exerciseCommand,
        snapshot: session.snapshot,
        timeBreakdown: session.timeBreakdown,
      })),
    ).toEqual(expectedCurriculum);
    expect(new Set(sessions.map(({ slug }) => slug)).size).toBe(9);
    expect(new Set(sessions.map(({ sequence }) => sequence)).size).toBe(9);
  });

  it("keeps the session rail aligned with page-owned metadata", () => {
    expect(sessionNavigationItems).toEqual(
      sessions.map(({ slug, title }) => ({ slug, title })),
    );
  });

  it("keeps each three-line episode in its page metadata and hero", () => {
    expect(
      sessions.map((session) =>
        session.slug === "05-boundaries-and-sensitive-data"
          ? undefined
          : "episode" in session
            ? session.episode
            : undefined,
      ),
    ).toEqual(expectedEpisodes);

    const boundaryEpisode = sessions.find(
      ({ slug }) => slug === "05-boundaries-and-sensitive-data",
    )?.episode;
    expect(boundaryEpisode).toHaveLength(3);
    expect(boundaryEpisode?.join("\n")).toContain("PV07-LOCKED");
    expect(boundaryEpisode?.join("\n")).toContain("segmentId");
    expect(boundaryEpisode?.join("\n")).toContain("ApproveEvaInput");

    for (const { path } of pages) {
      const source = pageSources[path] ?? "";
      expect(source, path).toContain('class="case-file__episode"');
      expect(source, path).toContain('class="case-file__episode-label"');
      expect(source, path).toContain("session.episode.map");
    }
  });

  it("describes the Session 00 SQLite incident baseline without a legacy path", () => {
    const source = pageSources["./pages/sessions/00-system-handover.astro"];

    expect(source).toContain("SQLite");
    expect(source).toContain("現在の作業許可");
    expect(source).toContain("作業記録");
    expect(source).toContain("被ばく量");
    expect(source).not.toContain("src/legacy");
  });

  it("keeps the 200-minute schedule and each time allocation consistent", () => {
    expect(
      sessions.reduce((sum, { durationMinutes }) => sum + durationMinutes, 0),
    ).toBe(200);
    for (const session of sessions) {
      expect(
        Object.values(session.timeBreakdown).reduce(
          (sum, duration) => sum + duration,
          0,
        ),
        session.slug,
      ).toBe(session.durationMinutes);
    }
  });

  it("keeps the complete exercise, solution, and peer-review contracts", () => {
    expect(
      exerciseSessions.map((session) => ({
        slug: session.slug,
        adv: session.adv,
        exerciseModule: session.exerciseModule,
        solutionSnapshot: session.solutionSnapshot,
        solutionPresentation: session.solutionPresentation,
        peerReviewPromises: session.peerReviewPromises,
        peerReview: session.peerReview,
      })),
    ).toEqual(expectedExercises);

    for (const session of exerciseSessions) {
      expect(
        Object.values(session.adv).reduce((sum, value) => sum + value, 0),
        session.slug,
      ).toBe(session.timeBreakdown.exercise);
      expect(session.peerReview.minutes).toBe(session.timeBreakdown.review);
      expect(session.exerciseModule.fileBudget).toBeLessThanOrEqual(5);
      expect(session.exerciseModule.lineBudget).toBeLessThanOrEqual(80);
    }
  });

  it("keeps exercise targets and solutions inside their declared snapshots", () => {
    for (const session of exerciseSessions) {
      expect(session.steps.length).toBeGreaterThanOrEqual(1);
      expect(session.steps.length).toBeLessThanOrEqual(4);
      expect(session.decisions.length).toBeGreaterThanOrEqual(1);
      expect(session.decisions.length).toBeLessThanOrEqual(3);
      expect(session.incident.trim()).not.toBe("");

      for (const decision of session.decisions) {
        expect(decision.invariant.trim()).not.toBe("");
      }
      for (const step of session.steps) {
        expect(step.solutions.length).toBeGreaterThanOrEqual(1);
        for (const target of step.targets) {
          expect(target).toMatch(
            new RegExp(`^${session.exerciseModule.dir}/`),
          );
        }
        for (const solution of step.solutions) {
          expect(solution.path).toMatch(
            new RegExp(`^examples/${session.solutionSnapshot}/`),
          );
          expect(solution.presentation ?? "excerpt").toBe(
            session.solutionPresentation,
          );
        }
      }
    }

    const injectContext = exerciseSessions
      .find(({ slug }) => slug === "07-effects-and-consistency")
      ?.steps.find(({ id }) => id === "s7-inject-context");
    expect(injectContext?.solutions).toEqual([
      expect.objectContaining({
        path: "examples/session-08/src/useCase/dependencies.ts",
        symbol: "EventContextDependencies",
      }),
      expect.objectContaining({
        path: "examples/session-08/src/useCase/approveEva.ts",
        symbol: "createEventContext",
      }),
    ]);
  });

  it("keeps semantic identifier exercise references with their owning concepts", () => {
    const semanticIdentifiers = exerciseSessions.find(
      ({ slug }) => slug === "04-semantic-identifiers",
    );
    const workflowErrors = exerciseSessions.find(
      ({ slug }) => slug === "06-workflow-errors",
    );

    expect(semanticIdentifiers?.steps[0]?.targets).toEqual([
      "examples/session-04/src/domain/permit/zoneId.ts",
      "examples/session-04/src/domain/lockout/segmentId.ts",
    ]);
    expect(semanticIdentifiers?.steps[0]?.solutions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "examples/session-05/src/domain/permit/zoneId.ts",
        }),
        expect.objectContaining({
          path: "examples/session-05/src/domain/lockout/segmentId.ts",
        }),
      ]),
    );
    expect(workflowErrors?.steps.flatMap(({ targets }) => targets)).not.toContain(
      "examples/session-06/src/domain/ids/appointmentId.ts",
    );
  });

  it("keeps exercise-only fields off non-exercise pages", () => {
    for (const session of sessions.filter(({ kind }) => kind !== "exercise")) {
      expect(session.adv).toBeUndefined();
      expect(session.peerReview).toBeUndefined();
      expect(session.exerciseCommand).toBeUndefined();
      expect(session.exerciseModule).toBeUndefined();
      expect(session.solutionSnapshot).toBeUndefined();
      expect(session.solutionPresentation).toBeUndefined();
      expect(session.peerReviewPromises).toBeUndefined();
      expect(session.steps).toHaveLength(0);
      expect(session.decisions).toHaveLength(0);
    }
  });

  it("keeps fixed previous and next navigation on all nine pages", () => {
    expect(pages.map(({ navigation }) => navigation)).toEqual(
      expectedNavigation,
    );
  });
});
