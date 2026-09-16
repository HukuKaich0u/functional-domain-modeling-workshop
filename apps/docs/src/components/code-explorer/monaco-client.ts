import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/editor/editor.worker.js?worker";
import jsonWorker from "monaco-editor/language/json/json.worker.js?worker";
import cssWorker from "monaco-editor/language/css/css.worker.js?worker";
import htmlWorker from "monaco-editor/language/html/html.worker.js?worker";
import tsWorker from "monaco-editor/language/typescript/ts.worker.js?worker";

globalThis.MonacoEnvironment = {
  getWorker: (_moduleId, label) => {
    if (label === "json") return new jsonWorker();
    if (label === "css" || label === "scss" || label === "less") {
      return new cssWorker();
    }
    if (label === "html" || label === "handlebars" || label === "razor") {
      return new htmlWorker();
    }
    if (label === "typescript" || label === "javascript") {
      return new tsWorker();
    }
    return new editorWorker();
  },
};

/** 教材の静的コードブロック(Shiki github-dark)と同じ配色。同じページ内で色の意味が変わらないようにする */
export const moonbaseEditorTheme = "moonbase-dark";

monaco.editor.defineTheme(moonbaseEditorTheme, {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "", foreground: "e1e4e8" },
    { token: "comment", foreground: "6a737d", fontStyle: "italic" },
    { token: "keyword", foreground: "f97583" },
    { token: "operator", foreground: "f97583" },
    { token: "string", foreground: "9ecbff" },
    { token: "string.escape", foreground: "79b8ff" },
    { token: "regexp", foreground: "9ecbff" },
    { token: "number", foreground: "79b8ff" },
    { token: "constant", foreground: "79b8ff" },
    { token: "identifier", foreground: "e1e4e8" },
    { token: "type.identifier", foreground: "b392f0" },
    { token: "type", foreground: "b392f0" },
    { token: "delimiter", foreground: "e1e4e8" },
    { token: "delimiter.bracket", foreground: "e1e4e8" },
    { token: "tag", foreground: "85e89d" },
    { token: "attribute.name", foreground: "b392f0" },
    { token: "attribute.value", foreground: "9ecbff" },
    { token: "key", foreground: "79b8ff" },
  ],
  colors: {
    "editor.background": "#24292e",
    "editor.foreground": "#e1e4e8",
    "editor.lineHighlightBackground": "#2b3036",
    "editor.lineHighlightBorder": "#2b3036",
    "editor.selectionBackground": "#3392ff44",
    "editor.inactiveSelectionBackground": "#3392ff22",
    "editorLineNumber.foreground": "#444d56",
    "editorLineNumber.activeForeground": "#e1e4e8",
    "editorCursor.foreground": "#c8e1ff",
    "editorIndentGuide.background": "#2f363d",
    "editorIndentGuide.activeBackground": "#444d56",
    "editorBracketMatch.background": "#3392ff33",
    "editorBracketMatch.border": "#79b8ff",
    "editorWhitespace.foreground": "#444d56",
    "editorGutter.background": "#24292e",
    "scrollbarSlider.background": "#6a737d55",
    "scrollbarSlider.hoverBackground": "#6a737d88",
    "scrollbarSlider.activeBackground": "#6a737daa",
  },
});

export { monaco };
