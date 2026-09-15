import { describe, expect, it } from "vitest";
import { session } from "../pages/sessions/03-state-transitions.astro";
import { session as session03 } from "../pages/sessions/04-semantic-identifiers.astro";
import { session as session05 } from "../pages/sessions/06-workflow-errors.astro";
import type { ExerciseStep } from "./types";
import { loadSolutionSnippets } from "./solution-snippets";

const step = session.steps.at(0);

if (step === undefined) {
  throw new Error("S3 の解答ステップが見つかりません");
}

describe("loadSolutionSnippets", () => {
  it("reads non-empty code from the requested source lines", async () => {
    const snippets = await loadSolutionSnippets(step);

    expect(snippets).toHaveLength(1);
    expect(snippets[0]?.code.trim()).not.toBe("");
    expect(snippets[0]?.code).toContain("approve");
  });

  it("rejects source lines outside the file", async () => {
    const invalidStep: ExerciseStep = {
      ...step,
      solutions: [
        {
          ...step.solutions[0],
          lines: [1, Number.MAX_SAFE_INTEGER],
        },
      ],
    };

    await expect(loadSolutionSnippets(invalidStep)).rejects.toThrow(
      "指定行がソースの範囲外です",
    );
  });

  it("keeps Session 06 solution excerpts self-contained", async () => {
    const snippets = await Promise.all(
      session05.steps.map((sessionStep) => loadSolutionSnippets(sessionStep)),
    );
    const [invalidState, notFound, pipeline, webHandler] = snippets;

    expect(invalidState?.[0]?.code).toContain("type ApproveEvaError");
    expect(invalidState?.[0]?.code).toContain("type Result");
    expect(notFound?.[0]?.code).toContain("type PermitNotFound");
    expect(pipeline?.[0]?.code).toContain("type Result");
    expect(pipeline?.[0]?.code).toContain("type ApproveEvaError");
    expect(webHandler?.[0]?.code).toContain("import type { ApproveEvaError }");
    expect(webHandler?.[0]?.code).toContain("return assertNever(error)");
    expect(webHandler?.[0]?.code).not.toContain("PermitConflict");
    expect(webHandler?.[0]?.code).not.toContain("ApproveEvaWithEffectsNoticeCode");
    expect(webHandler?.[0]?.code).not.toContain('"conflict"');
  });

  it("loads Session 04 identifier solutions from their owning concept", async () => {
    const [identifierStep] = session03.steps;
    expect(identifierStep?.solutions.map(({ path }) => path)).toEqual([
      "examples/session-05/src/domain/permit/zoneId.ts",
      "examples/session-05/src/domain/lockout/segmentId.ts",
    ]);

    const snippets = await loadSolutionSnippets(identifierStep!);
    expect(snippets.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("ZoneId"),
        expect.stringContaining("SegmentId"),
      ]),
    );
  });
});
