import { describe, expect, it } from "vitest";
import type { SessionSummary } from "../../sessions/types";
import type { CodeGuide } from "../code-guide";
import { projectFilesForSnapshot } from "../project-files";
import type { SessionWorkspace } from "../types";

type PageModule = Readonly<{
  session: SessionSummary;
  guides?: readonly CodeGuide[];
  workspace?: SessionWorkspace;
}>;

const expectedFragments: Readonly<Record<string, readonly string[]>> = {
  "string-status": ["status: string"],
  "optional-state-data": ["segmentId?: string", "abortReason?: string"],
  "plain-string-ids": ["permitId: string", "zoneId: string"],
  "session-00-unvalidated-space-weather": ["raw: any"],
  "session-00-raw-exposure-work-log": ["payload: permit"],
  "session-00-message-mapped-errors": ["catch", "error.message.includes"],
  "session-00-hidden-nondeterminism": ["new Date()", "randomUUID()"],
  "session-00-dual-write": ["repository.save", "repository.appendWorkLog"],
  "s1-functional-composition": ["conditions.flatMap", "verdictFrom(approvalConditions"],
  "s1-type-driven-parse": ["parseCandidate", "candidate: ApprovalCandidate"],
  "s1-procedural-message-match": ["message.includes"],
  "wide-transition-input": ["permit: EvaPermit", "as EvaPermit"],
  "non-exhaustive-label": ["default:"],
  "untyped-zone-id": ["z.string().regex", "export type ZoneId"],
  "plain-string-permit": ["zoneId: string"],
  "swapped-domain-identifiers": [
    "acceptZoneId(segmentId)",
    "acceptSegmentId(zoneId)",
  ],
  "http-approve-eva-input": [
    "ApproveEvaInput.parse",
    'context.req.param("permitId")',
  ],
  "unvalidated-approve-eva-input": ["raw: any", "raw.permitId"],
  "throws-known-errors": ["throw new Error"],
  "catch-misses-state-error": ["error.message.includes", "throw error"],
  "hidden-nondeterminism": ["new Date()", "crypto.randomUUID()"],
  "dual-write": ["stateStore.save", "workLog.append"],
  "final-use-case-pipeline": [".andThrough"],
  "final-seven-aggregates": [
    "createSessionEventStore",
    "createUserEventStore",
    "createSegmentRegisteredStore",
    "createWorkerRegisteredStore",
    "createPermitEventStore",
    "createLockoutReleaseStore",
    "createEquipmentCheckEventStore",
    "createSpaceWeatherEventStore",
  ],
  "final-transaction-store": ["db.transaction"],
};

const pageModules = import.meta.glob<PageModule>(
  ["../../pages/sessions/*.astro", "!../../pages/sessions/index.astro"],
  {
    eager: true,
  },
);
const pageSources = import.meta.glob<string>(
  ["../../pages/sessions/*.astro", "!../../pages/sessions/index.astro"],
  {
    eager: true,
    query: "?raw",
    import: "default",
  },
);
const legacyGuideModules = Object.keys(
  import.meta.glob("./*.ts", { eager: true }),
).filter((file) => !file.endsWith("code-guides.test.ts"));
const sessions = Object.values(pageModules).map(({ session }) => session);

describe("session code guides", () => {
  it("provides source-backed guides for every public Code Explorer session", () => {
    const codeExplorerSessions = sessions.flatMap((session) =>
      session.snapshot === undefined
        ? []
        : [{ session, snapshot: session.snapshot }],
    );
    const guideSlugs = codeExplorerSessions
      .map(({ session }) => session.slug)
      .sort();
    const exportedGuideSlugs = Object.entries(pageModules)
      .flatMap(([path, { guides }]) =>
        guides === undefined
          ? []
          : [
              path
                .replace(/^\.\.\/\.\.\/pages\/sessions\//, "")
                .replace(/\.astro$/, ""),
            ],
      )
      .sort();

    expect(legacyGuideModules).toEqual([]);
    expect(exportedGuideSlugs).toEqual(guideSlugs);

    for (const { session, snapshot } of codeExplorerSessions) {
      const pagePath = `../../pages/sessions/${session.slug}.astro`;
      const guides = pageModules[pagePath]?.guides;

      expect(pageSources[pagePath]).not.toContain("code-explorer/code-guides/");
      expect(guides, session.slug).toEqual(expect.any(Array));
      expect(guides!.length).toBeGreaterThanOrEqual(2);
      expect(guides!.length).toBeLessThanOrEqual(
        session.slug === "00-system-handover" ? 8 : 3,
      );
      const files = projectFilesForSnapshot(snapshot);
      const workspace =
        pageModules[`../../pages/sessions/${session.slug}.astro`]?.workspace;

      for (const guide of guides!) {
        expect(guide.title).not.toBe("");
        expect(guide.currentDesign).not.toBe("");
        expect(guide.futureRisk).not.toBe("");
        expect(files[guide.path], `${session.slug}: ${guide.path}`).toEqual(
          expect.any(String),
        );
        if (workspace !== undefined) {
          expect(workspace.visibleFiles).toContain(guide.path);
        }
        const lines = files[guide.path]!.split("\n");
        const highlightedSource = guide.highlights
          .map(({ startLineNumber, endLineNumber }) =>
            lines.slice(startLineNumber - 1, endLineNumber).join("\n"),
          )
          .join("\n");
        expect(
          expectedFragments[guide.id],
          `${session.slug}: ${guide.id}`,
        ).toEqual(expect.any(Array));
        for (const fragment of expectedFragments[guide.id]!) {
          expect(highlightedSource, `${session.slug}: ${guide.id}`).toContain(
            fragment,
          );
        }
        for (const highlight of guide.highlights) {
          expect(highlight.startLineNumber).toBeGreaterThanOrEqual(1);
          expect(highlight.endLineNumber).toBeGreaterThanOrEqual(
            highlight.startLineNumber,
          );
          expect(highlight.endLineNumber).toBeLessThanOrEqual(lines.length);
          expect(
            lines
              .slice(highlight.startLineNumber - 1, highlight.endLineNumber)
              .join("\n")
              .trim(),
          ).not.toBe("");
        }
      }

      if (session.slug === "final") {
        const useCaseGuide = guides!.find(
          ({ id }) => id === "final-use-case-pipeline",
        );
        const aggregateGuide = guides!.find(
          ({ id }) => id === "final-seven-aggregates",
        );
        expect(useCaseGuide?.currentDesign).toContain("Session 07 で学んだ形");
        expect(aggregateGuide?.title).toBe(
          "1業務集約から7つの集約へ広がる配線",
        );
        expect(aggregateGuide?.path).toBe("src/app.ts");
      }

      if (session.slug === "00-system-handover") {
        const messageMappedErrorsGuide = guides!.find(
          ({ id }) => id === "session-00-message-mapped-errors",
        );

        expect(guides!.map(({ id }) => id)).toEqual([
          "string-status",
          "optional-state-data",
          "plain-string-ids",
          "session-00-unvalidated-space-weather",
          "session-00-raw-exposure-work-log",
          "session-00-message-mapped-errors",
          "session-00-hidden-nondeterminism",
          "session-00-dual-write",
        ]);
        expect(new Set(guides!.map(({ id }) => id)).size).toBe(8);
        expect(messageMappedErrorsGuide?.highlights).toEqual([
          { startLineNumber: 192, endLineNumber: 193 },
        ]);
      }
    }
  });
});
