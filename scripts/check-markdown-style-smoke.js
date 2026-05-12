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
    "assets/editor.js",
    ...TIPTAP_STYLE_MODULES.map((file) => `assets/styles/${file}`),
  ],
  [
    "apps/desktop/assets/main.css",
    "apps/desktop/assets/styles/markdown.css",
    "apps/desktop/assets/editor.js",
    ...TIPTAP_STYLE_MODULES.map((file) => `apps/desktop/assets/styles/${file}`),
  ],
  [
    "apps/mobile/assets/main.css",
    "apps/mobile/assets/styles/markdown.css",
    "apps/mobile/assets/editor.js",
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

const REQUIRED_TIPTAP_BRIDGE_TOKENS = [
  ["--tt-bg-color", "var(--mn-editor-bg"],
  ["--tt-border-color", "var(--mn-divider"],
  ["--tt-cursor-color", "var(--mn-caret"],
  ["--tt-selection-color", "var(--mn-selection-bg"],
  ["--tt-card-bg-color", "var(--mn-surface-raised"],
  ["--tt-brand-color-500", "var(--mn-accent"],
  ["--tt-brand-color-600", "var(--mn-accent-strong"],
  ["--tt-radius-md", "var(--mn-radius-md"],
  ["--tt-table-border-color", "var(--mn-border"],
  ["--tt-table-cell-padding", "var(--mn-markdown-table-cell-pad"],
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
  ["Tiptap table zero-gap borders", ".mn-tiptap-table", "border-collapse: collapse"],
  ["Tiptap fallback table zero-gap borders", ".mn-tiptap-editor table", "border-collapse: collapse"],
  ["Tiptap table zero spacing", ".mn-tiptap-table", "border-spacing: 0 !important"],
  ["Tiptap table isolated grid surface", ".mn-tiptap-table", "isolation: isolate"],
  ["Tiptap table no wrapper gap", ".mn-tiptap-editor .tableWrapper", "padding: 0"],
  ["Tiptap table no native margin gap", ".mn-tiptap-table", "margin: 0"],
  ["Tiptap table continuous cell surface", ".mn-tiptap-table-cell", "background-clip: border-box"],
  ["Tiptap table continuous cell paint", ".mn-tiptap-table-cell", "background-origin: border-box"],
  ["Tiptap table hover avoids fake selection border", ".mn-tiptap-table-cell:hover:not(.mn-tiptap-table-cell-selected)", "box-shadow: none"],
  ["Tiptap table official overlay containers", ".mn-tiptap-editor .table-selection-overlay-container", "pointer-events: none"],
  ["Tiptap table official controls layer", ".mn-tiptap-editor .table-controls", "position: absolute"],
  ["Tiptap table official handle menu", ".tiptap-table-handle-menu", "pointer-events: auto"],
  ["Tiptap table official cell menu trigger", ".expandable-menu-button", "--dot-size-large"],
  ["Tiptap table official extend buttons", ".tiptap-table-extend-row-column-button", "pointer-events: auto"],
  ["Tiptap table native selectedCell stays visual-neutral", ".mn-tiptap-table-cell.selectedCell:not(.mn-tiptap-table-cell-selected)", "box-shadow: none"],
  ["Tiptap table classless selectedCell stays visual-neutral", ".mn-tiptap-editor :where(td.selectedCell, th.selectedCell):not(.mn-tiptap-table-cell-selected)", "background-image: none"],
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
  ["Tiptap official table row handle", ".tiptap-table-handle-menu.row", "--table-handle-ref-height"],
  ["Tiptap official table column handle", ".tiptap-table-handle-menu.column", "--table-handle-ref-width"],
  ["Tiptap official table dragging handle", ".tiptap-table-handle-menu.is-dragging", "cursor: grabbing"],
  ["Tiptap official table cell menu dot", ".expandable-menu-button::before", "var(--dot-size-small)"],
  ["Tiptap official table cell menu icon", ".expandable-menu-button svg", "opacity: 0"],
  ["Tiptap official table cell menu focus", ".expandable-menu-button:focus-visible", "outline: 2px solid"],
  ["Tiptap official table row extend", ".tiptap-table-extend-row-column-button.tiptap-table-row-end-add-remove", "cursor: row-resize"],
  ["Tiptap official table column extend", ".tiptap-table-extend-row-column-button.tiptap-table-column-end-add-remove", "cursor: col-resize"],
  ["Tiptap table selected cell object border", ".mn-tiptap-table-cell.mn-tiptap-table-cell-selected::after", "border-width:"],
  ["Tiptap table selected cell edge classes", ".mn-tiptap-table-cell.mn-tiptap-table-cell-selected-edge-right", "--mn-table-selected-edge-right"],
  ["Tiptap official block handle stacking", ".mn-tiptap-official-drag-handle-bridge", "z-index: 166"],
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
Tiptap Hybrid styling paths. The default groups include editor.js so the smoke
test covers official SCSS injected by the generated Tiptap runtime bundle
instead of forcing duplicate static chrome CSS.`);
}

function readCssGroup(paths) {
  return paths.map((path) => readFileSync(path, "utf8")).join("\n");
}

function checkCssText(source) {
  const failures = [];
  const compactSource = compactCssText(source);
  const tokens = parseCustomProperties(source);
  for (const token of REQUIRED_MARKDOWN_TOKENS) {
    if (!tokens.has(token)) {
      failures.push(`missing Markdown token ${token}`);
    }
  }
  for (const [token, declaration] of REQUIRED_TIPTAP_BRIDGE_TOKENS) {
    if (!tokens.has(token)) {
      failures.push(`missing Tiptap bridge token ${token}`);
    }
    if (
      !includesCssFragment(source, compactSource, `${token}:`) ||
      !includesCssFragment(source, compactSource, declaration)
    ) {
      failures.push(`Tiptap bridge token ${token} is not mapped to ${declaration}`);
    }
  }
  for (const [label, selector, token] of PREVIEW_REQUIREMENTS) {
    if (!includesCssFragment(source, compactSource, selector)) {
      failures.push(`${label} missing selector ${selector}`);
    }
    if (!includesCssFragment(source, compactSource, token)) {
      failures.push(`${label} missing token ${token}`);
    }
  }
  for (const [label, selector, token] of TIPTAP_REQUIREMENTS) {
    if (!includesCssFragment(source, compactSource, selector)) {
      failures.push(`${label} missing selector ${selector}`);
    }
    if (!includesCssFragment(source, compactSource, token)) {
      failures.push(`${label} missing token ${token}`);
    }
  }
  for (const [label, selector, declaration] of TIPTAP_COMMAND_PANEL_REQUIREMENTS) {
    if (!includesCssFragment(source, compactSource, selector)) {
      failures.push(`${label} missing selector ${selector}`);
    }
    if (!includesCssFragment(source, compactSource, declaration)) {
      failures.push(`${label} missing declaration ${declaration}`);
    }
  }
  for (const [label, selector, token] of TIPTAP_CODE_HIGHLIGHT_REQUIREMENTS) {
    if (!includesCssFragment(source, compactSource, selector)) {
      failures.push(`Tiptap code highlight ${label} missing selector ${selector}`);
    }
    if (!includesCssFragment(source, compactSource, token)) {
      failures.push(`Tiptap code highlight ${label} missing token ${token}`);
    }
  }
  return failures;
}

function includesCssFragment(source, compactSource, fragment) {
  return source.includes(fragment) || compactSource.includes(compactCssText(fragment));
}

function compactCssText(source) {
  return source.replace(/\s+/g, "");
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
${REQUIRED_TIPTAP_BRIDGE_TOKENS.map(([token, declaration]) => `  ${token}: ${declaration}, #111111);`).join("\n")}
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

  const missingTablePanel = css.replaceAll(".tiptap-table-handle-menu", ".tiptap-table-handle-copy");
  assert(
    checkCssText(missingTablePanel).some((failure) =>
      failure.includes("Tiptap table official handle menu"),
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
