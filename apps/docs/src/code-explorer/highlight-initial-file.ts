import { codeToTokens } from "shiki";
import type { ProjectFiles, SessionWorkspace } from "./types";

export type SyntaxToken = Readonly<{
  content: string;
  color: string;
}>;

export type SyntaxLine = readonly SyntaxToken[];

export const highlightInitialFile = async (
  workspace: SessionWorkspace,
  projectFiles: ProjectFiles,
): Promise<readonly SyntaxLine[]> => {
  const source = projectFiles[workspace.initialFile];
  if (source === undefined) {
    throw new Error(`Initial source not found: ${workspace.initialFile}`);
  }

  const { tokens } = await codeToTokens(source, {
    lang: "ts",
    theme: "github-dark",
  });

  return tokens.map((line) =>
    line.map(({ content, color }) => ({
      content,
      color: color ?? "#e1e4e8",
    })),
  );
};
