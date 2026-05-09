#!/usr/bin/env node
import { readFileSync } from "node:fs";

const TIPTAP_STYLE_MODULES = [
  "tiptap-chrome.css",
  "tiptap-chrome-code.css",
  "tiptap-chrome-base.css",
  "tiptap-chrome-command.css",
  "tiptap-chrome-table.css",
  "tiptap-chrome-block.css",
];

const DEFAULT_CSS_GROUPS = [
  [
    "assets/main.css",
    "assets/styles/markdown.css",
    ...TIPTAP_STYLE_MODULES.map((file) => `assets/styles/${file}`),
  ],
  [
    "apps/desktop/assets/main.css",
    "apps/desktop/assets/styles/markdown.css",
    ...TIPTAP_STYLE_MODULES.map((file) => `apps/desktop/assets/styles/${file}`),
  ],
  [
    "apps/mobile/assets/main.css",
    "apps/mobile/assets/styles/markdown.css",
    ...TIPTAP_STYLE_MODULES.map((file) => `apps/mobile/assets/styles/${file}`),
  ],
];

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
  "--mn-code-token-comment",
  "--mn-code-token-keyword",
  "--mn-code-token-string",
  "--mn-code-token-number",
  "--mn-code-token-title",
  "--mn-code-token-attribute",
  "--mn-code-token-type",
  "--mn-code-token-operator",
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

const TIPTAP_REQUIREMENTS = [
  ["Tiptap editor body size", ".mn-tiptap-editor", "--mn-markdown-body-size"],
  ["Tiptap editor line height", ".mn-tiptap-editor", "--mn-markdown-line-height"],
  ["Tiptap editor minimum padding", ".mn-tiptap-editor", "max(24px, var(--mn-document-pad-x))"],
  ["Tiptap list indent parity", ".mn-tiptap-editor :where(ul:not(.mn-tiptap-task-list), ol)", "--mn-markdown-list-indent"],
  ["Tiptap table cell padding", ".mn-tiptap-table-cell", "--mn-markdown-table-cell-pad"],
  ["Tiptap table zero-gap borders", ".mn-tiptap-table", "border-collapse: separate"],
  ["Tiptap table zero spacing", ".mn-tiptap-table", "border-spacing: 0"],
  ["Tiptap table isolated grid surface", ".mn-tiptap-table", "isolation: isolate"],
  ["Tiptap table no wrapper gap", ".mn-tiptap-editor .tableWrapper", "padding: 0"],
  ["Tiptap table no native margin gap", ".mn-tiptap-table", "margin: 0"],
  ["Tiptap table continuous cell surface", ".mn-tiptap-table-cell", "background-clip: border-box"],
  ["Tiptap table continuous cell paint", ".mn-tiptap-table-cell", "background-origin: border-box"],
  ["Tiptap table active cell border", ".mn-tiptap-table-cell.mn-tiptap-table-cell-active::after", "inset 0 0 0 3px"],
  ["Tiptap table active cell direct border", ".mn-tiptap-table-cell.mn-tiptap-table-cell-active", "outline: 2.5px solid var(--mn-accent)"],
  ["Tiptap table hovered column line", ".mn-tiptap-table-cell.mn-tiptap-table-cell-hovered-column", "inset -2px 0 0"],
  ["Tiptap table hovered row line", ".mn-tiptap-table-cell.mn-tiptap-table-cell-hovered-row", "inset 0 -2px 0"],
  ["Tiptap table selected cell resize hit zone", ".mn-tiptap-table-cell.mn-tiptap-table-cell-selected > .column-resize-handle", "width: 16px"],
  ["Tiptap table selected cell resize quiet default", ".mn-tiptap-table-cell.mn-tiptap-table-cell-selected > .column-resize-handle", "opacity: 0"],
  ["Tiptap table selected cell resize affordance", ".mn-tiptap-table-cell.mn-tiptap-table-cell-selected > .column-resize-handle::before", "width: 2px"],
  ["Tiptap table resize hover reveal", ".mn-tiptap-table-cell:hover > .column-resize-handle::before", ".mn-tiptap-editor.resize-cursor .column-resize-handle::before"],
  ["Tiptap math font", ".mn-tiptap-inline-math", "--mn-markdown-inline-math-font"],
  ["Tiptap math block surface", ".mn-tiptap-math-block", "--mn-markdown-code-block-bg"],
  ["Tiptap Mermaid editor padding", ".mn-tiptap-mermaid-source", "--mn-markdown-code-block-pad-y"],
  ["Tiptap Mermaid editor mono font", ".mn-tiptap-mermaid-source", "--mn-markdown-mono-font"],
  ["Tiptap image radius", ".mn-tiptap-image", "--mn-markdown-image-radius"],
  ["Tiptap code block padding", ".mn-tiptap-code-block", "--mn-markdown-code-block-pad-y"],
  ["Tiptap code block mono font", ".mn-tiptap-code-block", "--mn-markdown-mono-font"],
  ["Tiptap code block caret", ".mn-tiptap-code-block", "caret-color: var(--mn-caret)"],
  ["Tiptap code block toolbar", ".mn-tiptap-code-toolbar", "data-action=\"copy\""],
  ["Tiptap code block wrap state", ".mn-tiptap-code-block[data-code-wrap=\"true\"] code", "white-space: pre-wrap"],
  ["Tiptap code language token badge", ".mn-tiptap-code-language-button::before", "--mn-markdown-mono-font"],
  ["Tiptap light code chip surface", ":root[data-theme=\"github_light\"] .mn-tiptap-code-language-button", "--mn-code-language-chip-surface"],
];

const TIPTAP_COMMAND_PANEL_REQUIREMENTS = [
  ["Tiptap slash command panel", ".mn-tiptap-slash-menu", "user-select: none"],
  ["Tiptap slash command active rhythm", ".mn-tiptap-slash-menu-item.active", "border-color: color-mix"],
  ["Tiptap slash command list scrolling", ".mn-tiptap-slash-menu-list", "scrollbar-gutter: stable"],
  ["Tiptap slash command grouped icons", ".mn-tiptap-slash-menu-icon[data-command-group=\"data\"]", "--mn-command-icon-accent"],
  ["Tiptap slash recent command tone", ".mn-tiptap-slash-menu-icon[data-command-group=\"recent\"]", "--mn-command-icon-accent"],
  ["Tiptap slash command icon system", ".mn-tiptap-command-icon-svg", "width: 15.5px"],
  ["Tiptap slash fallback icon system", ".mn-tiptap-slash-menu-icon[data-icon-source=\"fallback\"]::before", "data-icon=\"table\""],
  ["Tiptap slash table anchored picker", ".mn-tiptap-table-size-picker", "position: absolute"],
  ["Tiptap block action panel", ".mn-tiptap-block-action-menu", "user-select: none"],
  ["Tiptap block action active rhythm", ".mn-tiptap-block-action-menu-item.active", "border-color: color-mix"],
  ["Tiptap block action list scrolling", ".mn-tiptap-block-action-menu-list", "scrollbar-gutter: stable"],
  ["Tiptap table command panel", ".mn-tiptap-table-toolbar[data-mode=\"context\"]", "scrollbar-gutter: stable"],
  ["Tiptap table command rows", ".mn-tiptap-table-toolbar-button-label", "border-color: color-mix"],
  ["Tiptap table command icons", ".mn-tiptap-table-toolbar-button[data-icon=\"row-below\"]", "mn-tiptap-table-toolbar-button-visual::after"],
  ["Tiptap table move row icon", ".mn-tiptap-table-toolbar-button[data-icon=\"move-row-up\"]", "data-icon=\"move-column-right\""],
  ["Tiptap table merge icon", ".mn-tiptap-table-toolbar-button[data-icon=\"merge\"]", ".mn-tiptap-table-toolbar-button[data-icon=\"split\"]"],
  ["Tiptap table copy cell icon", ".mn-tiptap-table-toolbar-button[data-icon=\"copy-cell\"]", "data-icon=\"copy-cell\""],
  ["Tiptap table text color commands", ".mn-tiptap-table-toolbar-button[data-variant=\"text-swatch\"]", "data-icon=\"text-color-accent\""],
  ["Tiptap table cell menu grip", ".mn-tiptap-table-cell-menu-trigger::after", "radial-gradient"],
  ["Tiptap table cell menu quiet hit box", ".mn-tiptap-table-cell-menu-trigger", "width: 8px"],
  ["Tiptap table cell menu expands on intent", ".mn-tiptap-table-cell-menu-trigger:hover", "width: 20px"],
  ["Tiptap table row handle span", ".mn-tiptap-table-axis-handle.row", "min-width: 20px"],
  ["Tiptap table column handle span", ".mn-tiptap-table-axis-handle.column", "min-height: 20px"],
  ["Tiptap table handle stacking", ".mn-tiptap-table-axis-handle", "z-index: 167"],
  ["Tiptap table handle pointer reachability", ".mn-tiptap-table-axis-handle", "pointer-events: auto"],
  ["Tiptap official block handle stacking", ".mn-tiptap-official-drag-handle-bridge", "z-index: 166"],
  ["Tiptap complex insert breakpoint", ".mn-tiptap-complex-block-insert::before", "calc(50% - 28px)"],
  ["Tiptap complex insert button", ".mn-tiptap-complex-block-insert::after", "--mn-editor-bg"],
  ["Tiptap code language badge", ".mn-tiptap-code-language-button::before", "data-language-badge"],
  ["Tiptap code language option token", ".mn-tiptap-code-language-menu-item::before", "data-language-token"],
  ["Tiptap code language option title", ".mn-tiptap-code-language-menu-item-title", "text-overflow: ellipsis"],
  ["Tiptap code language option description", ".mn-tiptap-code-language-menu-item-description", "font-size: 10px"],
];

const TIPTAP_CODE_HIGHLIGHT_REQUIREMENTS = [
  ["comment", ".mn-tiptap-code-block .hljs-comment", "--mn-code-token-comment"],
  ["keyword", ".mn-tiptap-code-block .hljs-keyword", "--mn-code-token-keyword"],
  ["string", ".mn-tiptap-code-block .hljs-string", "--mn-code-token-string"],
  ["number", ".mn-tiptap-code-block .hljs-number", "--mn-code-token-number"],
  ["title", ".mn-tiptap-code-block .hljs-title", "--mn-code-token-title"],
  ["attribute", ".mn-tiptap-code-block .hljs-attribute", "--mn-code-token-attribute"],
  ["type", ".mn-tiptap-code-block .hljs-type", "--mn-code-token-type"],
  ["operator", ".mn-tiptap-code-block .hljs-operator", "--mn-code-token-operator"],
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
  const failures = [
    ...cssGroups.flatMap((paths) =>
      checkCssText(readCssGroup(paths)).map((failure) => `${paths.join(" + ")}: ${failure}`),
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
Tiptap Hybrid styling paths.`);
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
  for (const [label, selector, token] of TIPTAP_REQUIREMENTS) {
    if (!source.includes(selector)) {
      failures.push(`${label} missing selector ${selector}`);
    }
    if (!source.includes(token)) {
      failures.push(`${label} missing token ${token}`);
    }
  }
  for (const [label, selector, declaration] of TIPTAP_COMMAND_PANEL_REQUIREMENTS) {
    if (!source.includes(selector)) {
      failures.push(`${label} missing selector ${selector}`);
    }
    if (!source.includes(declaration)) {
      failures.push(`${label} missing declaration ${declaration}`);
    }
  }
  for (const [label, selector, token] of TIPTAP_CODE_HIGHLIGHT_REQUIREMENTS) {
    if (!source.includes(selector)) {
      failures.push(`Tiptap code highlight ${label} missing selector ${selector}`);
    }
    if (!source.includes(token)) {
      failures.push(`Tiptap code highlight ${label} missing token ${token}`);
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
${TIPTAP_REQUIREMENTS.map(
  ([, selector, token]) => `${selector} { color: var(${token}); }`,
).join("\n")}
${TIPTAP_COMMAND_PANEL_REQUIREMENTS.map(
  ([, selector, declaration]) => `${selector} { ${declaration}; }`,
).join("\n")}
${TIPTAP_CODE_HIGHLIGHT_REQUIREMENTS.map(
  ([, selector, token]) => `${selector} { color: var(${token}); }`,
).join("\n")}
`;

  assert(checkCssText(css).length === 0);

  const missingTokenCss = css.replace("  --mn-markdown-h1-size: #111111;\n", "");
  assert(checkCssText(missingTokenCss).some((failure) => failure.includes("--mn-markdown-h1-size")));

  const missingTiptap = css.replaceAll(".mn-tiptap-editor", ".mn-editor");
  assert(checkCssText(missingTiptap).some((failure) => failure.includes("Tiptap editor")));

  const missingCommandPanel = css.replaceAll("scrollbar-gutter: stable", "scrollbar-width: thin");
  assert(
    checkCssText(missingCommandPanel).some((failure) =>
      failure.includes("Tiptap slash command list scrolling"),
    ),
  );

  const missingTablePanel = css.replaceAll(".mn-tiptap-table-toolbar-button-label", ".mn-tiptap-table-toolbar-copy");
  assert(
    checkCssText(missingTablePanel).some((failure) =>
      failure.includes("Tiptap table command rows"),
    ),
  );

  const missingHighlight = css.replaceAll(".mn-tiptap-code-block .hljs-keyword", ".mn-tiptap-code-block .token-keyword");
  assert(
    checkCssText(missingHighlight).some((failure) =>
      failure.includes("Tiptap code highlight keyword"),
    ),
  );

  console.log("Markdown style smoke checker self-test passed.");
}

function assert(condition) {
  if (!condition) {
    throw new Error("Markdown style smoke checker self-test failed");
  }
}

main();
