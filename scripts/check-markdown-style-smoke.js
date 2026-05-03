#!/usr/bin/env node
import { readFileSync } from "node:fs";

const DEFAULT_CSS_GROUPS = [
  ["assets/main.css", "assets/styles/markdown.css"],
  ["apps/desktop/assets/main.css", "apps/desktop/assets/styles/markdown.css"],
];
const DEFAULT_EDITOR_THEME_PATH = "js/src/editor-theme.js";

const REQUIRED_MARKDOWN_TOKENS = [
  "--mn-markdown-font",
  "--mn-markdown-heading-font",
  "--mn-markdown-mono-font",
  "--mn-markdown-body-size",
  "--mn-markdown-line-height",
  "--mn-markdown-heading-line",
  "--mn-markdown-h1-size",
  "--mn-markdown-h2-size",
  "--mn-markdown-h3-size",
  "--mn-markdown-block-gap",
  "--mn-markdown-list-indent",
  "--mn-markdown-list-item-gap",
  "--mn-markdown-list-marker-width",
  "--mn-markdown-list-marker-gap",
  "--mn-markdown-quote-border",
  "--mn-markdown-quote-pad-x",
  "--mn-markdown-quote-pad-y",
  "--mn-markdown-code-bg",
  "--mn-markdown-code-block-bg",
  "--mn-markdown-code-color",
  "--mn-markdown-code-radius",
  "--mn-markdown-inline-code-pad",
  "--mn-markdown-code-block-pad-x",
  "--mn-markdown-code-block-pad-y",
  "--mn-markdown-code-block-size",
  "--mn-markdown-code-block-line",
  "--mn-markdown-table-head-bg",
  "--mn-markdown-table-border",
  "--mn-markdown-table-cell-pad",
  "--mn-markdown-table-head-pad",
  "--mn-markdown-inline-math-font",
  "--mn-markdown-inline-math-pad",
  "--mn-code-surface",
  "--mn-code-block-surface",
  "--mn-code-ink",
  "--mn-code-border",
];

const PREVIEW_REQUIREMENTS = [
  ["preview heading 1 size", ".mn-preview h1", "--mn-markdown-h1-size"],
  ["preview heading 2 size", ".mn-preview h2", "--mn-markdown-h2-size"],
  ["preview list indent", ".mn-preview ul", "--mn-markdown-list-indent"],
  ["preview list spacing", ".mn-preview li", "--mn-markdown-list-item-gap"],
  ["preview quote spacing", ".mn-preview blockquote", "--mn-markdown-quote-pad-y"],
  ["preview inline code padding", ".mn-preview code", "--mn-markdown-inline-code-pad"],
  ["preview code block padding", ".mn-preview pre", "--mn-markdown-code-block-pad-y"],
  ["preview code block surface", ".mn-preview pre", "--mn-code-block-surface"],
  ["preview table head padding", ".mn-preview th", "--mn-markdown-table-head-pad"],
  ["preview table cell padding", ".mn-preview td", "--mn-markdown-table-cell-pad"],
  ["preview Mermaid block rhythm", ".mn-mermaid-block", "--mn-markdown-code-block-pad-y"],
];

const HYBRID_REQUIREMENTS = [
  ["hybrid heading 1 size", ".cm-hybrid-heading-1", "--mn-markdown-h1-size"],
  ["hybrid heading 2 size", ".cm-hybrid-heading-2", "--mn-markdown-h2-size"],
  ["hybrid quote spacing", ".cm-line.cm-hybrid-blockquote-line", "--mn-markdown-quote-pad-y"],
  ["hybrid code block padding", ".cm-line.cm-hybrid-code-block-line", "--mn-markdown-code-block-pad-x"],
  ["hybrid table line padding", ".cm-line.cm-hybrid-table-line", "--mn-markdown-table-line-pad-x"],
  ["hybrid table cell padding", ".cm-hybrid-table-cell-input", "--mn-markdown-table-cell-pad"],
  ["hybrid inline code color", ".cm-hybrid-inline-code", "--mn-code-ink"],
  ["hybrid inline math font", ".cm-hybrid-inline-math", "--mn-markdown-inline-math-font"],
  ["hybrid math block padding", ".cm-hybrid-math-block", "--mn-markdown-code-block-pad-y"],
  ["hybrid Mermaid editor surface", ".cm-hybrid-mermaid-source-editor", "--mn-code-block-surface"],
  ["hybrid list marker width", ".cm-hybrid-list-marker", "--mn-markdown-list-marker-width"],
];

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  if (args.includes("--self-test")) {
    runSelfTest();
    return;
  }

  const unexpectedOption = args.find((arg) => arg.startsWith("-"));
  if (unexpectedOption) {
    console.error(`Unknown option: ${unexpectedOption}`);
    printUsage();
    process.exitCode = 2;
    return;
  }

  const cssGroups = args.length > 0 ? args.map((path) => [path]) : DEFAULT_CSS_GROUPS;
  const editorTheme = readFileSync(DEFAULT_EDITOR_THEME_PATH, "utf8");
  const failures = [
    ...cssGroups.flatMap((paths) =>
      checkCssText(readCssGroup(paths)).map((failure) => `${paths.join(" + ")}: ${failure}`),
    ),
    ...checkEditorThemeText(editorTheme).map(
      (failure) => `${DEFAULT_EDITOR_THEME_PATH}: ${failure}`,
    ),
  ];

  if (failures.length > 0) {
    console.error("Markdown style smoke check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Markdown style smoke check passed.");
}

function printUsage() {
  console.log(`Usage:
  node scripts/check-markdown-style-smoke.js
  node scripts/check-markdown-style-smoke.js <css-file>...
  node scripts/check-markdown-style-smoke.js --self-test

Checks that Markdown visual tokens are present and shared by Preview and
Hybrid styling paths.`);
}

function readCssGroup(paths) {
  return paths.map((path) => readFileSync(path, "utf8")).join("\n");
}

function checkCssText(source) {
  const failures = [];
  const tokens = parseCustomProperties(source);
  for (const token of REQUIRED_MARKDOWN_TOKENS) {
    if (!tokens.has(token)) {
      failures.push(`missing Markdown token ${token}`);
    }
  }
  for (const [label, selector, token] of PREVIEW_REQUIREMENTS) {
    if (!source.includes(selector)) {
      failures.push(`${label} missing selector ${selector}`);
    }
    if (!source.includes(token)) {
      failures.push(`${label} missing token ${token}`);
    }
  }
  return failures;
}

function checkEditorThemeText(source) {
  const failures = [];
  for (const [label, selector, token] of HYBRID_REQUIREMENTS) {
    if (!source.includes(selector)) {
      failures.push(`${label} missing selector ${selector}`);
    }
    if (!source.includes(token)) {
      failures.push(`${label} missing token ${token}`);
    }
  }
  return failures;
}

function parseCustomProperties(source) {
  const tokens = new Set();
  const declarationPattern = /(--[\w-]+)\s*:\s*[^;]+;/g;
  for (const match of source.matchAll(declarationPattern)) {
    tokens.add(match[1]);
  }
  return tokens;
}

function runSelfTest() {
  const css = `
:root {
${REQUIRED_MARKDOWN_TOKENS.map((token) => `  ${token}: #111111;`).join("\n")}
}
${PREVIEW_REQUIREMENTS.map(
  ([, selector, token]) => `${selector} { color: var(${token}); }`,
).join("\n")}
`;
  const js = HYBRID_REQUIREMENTS.map(
    ([, selector, token]) => `"${selector}": { color: "var(${token})" },`,
  ).join("\n");

  assert(checkCssText(css).length === 0);
  assert(checkEditorThemeText(js).length === 0);

  const missingTokenCss = css.replace("  --mn-markdown-h1-size: #111111;\n", "");
  assert(checkCssText(missingTokenCss).some((failure) => failure.includes("--mn-markdown-h1-size")));

  const missingHybrid = js.replace(".cm-hybrid-heading-1", ".cm-heading");
  assert(checkEditorThemeText(missingHybrid).some((failure) => failure.includes("heading 1")));

  console.log("Markdown style smoke checker self-test passed.");
}

function assert(condition) {
  if (!condition) {
    throw new Error("Markdown style smoke checker self-test failed");
  }
}

main();
