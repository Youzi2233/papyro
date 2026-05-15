#!/usr/bin/env node
import { readFileSync } from "node:fs";

const TIPTAP_STYLE_MODULES = [
  "tiptap-chrome.css",
  "tiptap-chrome-code.css",
  "tiptap-chrome-base.css",
  "tiptap-chrome-command.css",
  "tiptap-chrome-table.css",
  "tiptap-chrome-block.css",
  "tiptap-chrome-papyro.css",
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
  "--mn-document-measure",
  "--mn-document-wide-measure",
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
  ["--tt-toolbar-bg-color", "var(--mn-surface-raised"],
  ["--tt-popover-bg-color", "var(--mn-surface-raised"],
  ["--tt-combobox-bg-color", "var(--mn-surface-raised"],
  ["--tiptap-card-bg-color", "var(--mn-surface-raised"],
  ["--mn-tiptap-menu-z", "166"],
  ["--mn-tiptap-menu-max-width", "min(22rem"],
  ["--mn-tiptap-menu-max-height", "min(28rem"],
  ["--tt-brand-color-500", "var(--mn-accent"],
  ["--tt-brand-color-600", "var(--mn-accent-strong"],
  ["--tt-radius-md", "var(--mn-radius-md"],
  ["--tt-table-border-color", "var(--mn-border"],
  ["--tt-table-cell-padding", "var(--mn-markdown-table-cell-pad"],
];

const PREVIEW_REQUIREMENTS = [
  ["preview scroll hides horizontal page drift", ".mn-preview-scroll", "overflow-x: hidden"],
  ["preview document width parity", ".mn-preview", "--mn-document-content-width"],
  ["preview heading 1 size", ".mn-preview h1", "--mn-markdown-h1-size"],
  ["preview heading 2 size", ".mn-preview h2", "--mn-markdown-h2-size"],
  ["preview list indent", ".mn-preview ul", "--mn-markdown-list-indent"],
  ["preview list spacing", ".mn-preview li", "--mn-markdown-list-item-gap"],
  ["preview quote spacing", ".mn-preview blockquote", "--mn-markdown-quote-pad-y"],
  ["preview inline code padding", ".mn-preview code", "--mn-markdown-inline-code-pad"],
  ["preview code block padding", ".mn-preview pre", "--mn-markdown-code-block-pad-y"],
  ["preview code block surface", ".mn-preview pre", "--mn-code-block-surface"],
  ["preview code block width guard", ".mn-preview pre", "max-width: 100%"],
  ["preview table scroll guard", ".mn-preview table", "display: block"],
  ["preview table width guard", ".mn-preview table", "width: max-content"],
  ["preview table head padding", ".mn-preview th", "--mn-markdown-table-head-pad"],
  ["preview table cell padding", ".mn-preview td", "--mn-markdown-table-cell-pad"],
  ["preview Mermaid block rhythm", ".mn-mermaid-block", "--mn-markdown-code-block-pad-y"],
];

const TIPTAP_REQUIREMENTS = [
  ["Tiptap editor document width parity", ".mn-tiptap-editor", "--mn-document-content-width"],
  ["Tiptap editor body size", ".mn-tiptap-editor", "--mn-markdown-body-size"],
  ["Tiptap editor line height", ".mn-tiptap-editor", "--mn-markdown-line-height"],
  ["Tiptap editor minimum padding", ".mn-tiptap-editor", "max(24px, var(--mn-document-pad-x))"],
  ["Tiptap list indent parity", ".mn-tiptap-editor :where(ul:not(.mn-tiptap-task-list), ol)", "--mn-markdown-list-indent"],
  ["Tiptap table cell padding", ".mn-tiptap-editor :where(th, td)", "--tt-table-cell-padding"],
  ["Tiptap table zero-gap borders", ".mn-tiptap-editor table", "border-collapse: collapse"],
  ["Tiptap fallback table zero-gap borders", ".mn-tiptap-editor table", "border-collapse: collapse"],
  ["Tiptap table zero spacing", ".mn-tiptap-editor table", "border-spacing: 0 !important"],
  ["Tiptap table isolated grid surface", ".mn-tiptap-editor table", "isolation: isolate"],
  ["Tiptap table official wrapper padding", ".mn-tiptap-editor [data-content-type=\"table\"] .tableWrapper", "--tt-table-pad-block-start"],
  ["Tiptap table no native margin gap", ".mn-tiptap-editor table", "margin: 0"],
  ["Tiptap table continuous cell surface", ".mn-tiptap-editor :where(th, td)", "background-clip: border-box"],
  ["Tiptap table continuous cell paint", ".mn-tiptap-editor :where(th, td)", "background-origin: border-box"],
  ["Tiptap table content excludes resize handle", ".mn-tiptap-editor :where(td, th) > :where(p, ul, ol, blockquote, pre, figure)", "z-index: 1"],
  ["Tiptap table content removes paragraph gaps", ".mn-tiptap-editor :where(td, th) > :where(p, ul, ol, blockquote, pre)", "margin-block: 0"],
  ["Tiptap table resize handle stays out of flow", ".mn-tiptap-editor :where(td, th) > .column-resize-handle", "min-height: 0"],
  ["Tiptap table resize handle has no text metrics", ".mn-tiptap-editor :where(td, th) > .column-resize-handle", "line-height: 0"],
  ["Tiptap table resize handle isolates layout", ".mn-tiptap-editor :where(td, th) > .column-resize-handle", "contain: layout paint"],
  ["Tiptap table native selectedCell overlay", ".mn-tiptap-editor :where(td.selectedCell, th.selectedCell)::after", "--tt-table-selected-bg"],
  ["Tiptap table official overlay containers", ".mn-tiptap-editor .table-selection-overlay-container", "pointer-events: none"],
  ["Tiptap table official controls layer", ".mn-tiptap-editor .table-controls", "position: absolute"],
  ["Tiptap table official handle menu", ".tiptap-table-handle-menu", "pointer-events: auto"],
  ["Tiptap table official handle surface", ".tiptap-table-handle-menu", "--tt-table-handle-bg-color"],
  ["Tiptap table official cell menu trigger", ".expandable-menu-button", "--dot-size-large"],
  ["Tiptap table official extend buttons", ".tiptap-table-extend-row-column-button", "pointer-events: auto"],
  ["Tiptap table selectedCell stays integrated", ".mn-tiptap-editor :where(td.selectedCell, th.selectedCell)", "background-image: none"],
  ["Tiptap table resize handle", ".mn-tiptap-editor .column-resize-handle", "width: 4px"],
  ["Tiptap table resize handle absolute", ".mn-tiptap-editor .column-resize-handle", "position: absolute"],
  ["Tiptap table resize quiet default", ".mn-tiptap-editor .column-resize-handle", "opacity: 0"],
  ["Tiptap table resize hover reveal", ".mn-tiptap-editor :where(td:hover, th:hover) > .column-resize-handle", ".mn-tiptap-editor.resize-cursor .column-resize-handle"],
  ["Tiptap math font", ".mn-tiptap-inline-math", "--mn-markdown-inline-math-font"],
  ["Tiptap math block surface", ".mn-tiptap-math-block", "--mn-markdown-code-block-bg"],
  ["Tiptap Mermaid editor padding", ".mn-tiptap-mermaid-source", "--mn-markdown-code-block-pad-y"],
  ["Tiptap Mermaid editor mono font", ".mn-tiptap-mermaid-source", "--mn-markdown-mono-font"],
  ["Tiptap image radius", ".mn-tiptap-image", "--mn-markdown-image-radius"],
  ["Tiptap code block padding", ".mn-tiptap-code-block", "--mn-markdown-code-block-pad-y"],
  ["Tiptap code block width guard", ".mn-tiptap-code-block", "max-width: 100%"],
  ["Tiptap code block mono font", ".mn-tiptap-code-block", "--mn-markdown-mono-font"],
  ["Tiptap code block caret", ".mn-tiptap-code-block", "caret-color: var(--mn-caret)"],
  ["Tiptap code block toolbar", ".mn-tiptap-code-toolbar", "data-action=\"copy\""],
  ["Tiptap code block wrap state", ".mn-tiptap-code-block[data-code-wrap=\"true\"] code", "white-space: pre-wrap"],
  ["Tiptap code language token badge", ".mn-tiptap-code-language-button::before", "--mn-markdown-mono-font"],
  ["Tiptap light code chip surface", ":root[data-theme=\"github_light\"] .mn-tiptap-code-language-button", "--mn-code-language-chip-surface"],
];

const TIPTAP_COMMAND_PANEL_REQUIREMENTS = [
  ["Tiptap official suggestion menu", "tiptap-suggestion-menu", "role:\"listbox\""],
  ["Tiptap official slash card", ".tiptap-slash-card", "min-width:15rem"],
  ["Tiptap official slash card body", ".tiptap-slash-card-body", "width:100%"],
  ["Tiptap official card shadow", ".tiptap-card", "box-shadow:var(--tt-shadow-elevated-md)"],
  ["Tiptap official card surface", ".tiptap-card", "background-color:var(--tiptap-card-bg-color)"],
  ["Tiptap official menu layering", ".tiptap-menu-content", "z-index:50"],
  ["Tiptap official menu layout", ".tiptap-menu-content", "display:flex"],
  ["Tiptap official menu open motion", ".tiptap-menu-content", "animation:popover"],
  ["Tiptap official menu item width", ".tiptap-menu-item", "width:100%"],
  ["Tiptap Papyro floating layer z contract", ".tiptap-popover", "--mn-tiptap-menu-z"],
  ["Tiptap Papyro menu viewport width", ".tiptap-menu-content", "--mn-tiptap-menu-max-width"],
  ["Tiptap Papyro menu viewport height", ".tiptap-menu-content", "--mn-tiptap-menu-max-height"],
  ["Tiptap Papyro menu radius token", ".mn-tiptap-react-root", "--mn-tiptap-menu-radius:var(--mn-radius-md"],
  ["Tiptap Papyro generic menu panel", ".tiptap-menu-content:not(.tiptap-table-menu-content) > .tiptap-combobox-list", "background-color: var(--tt-combobox-bg-color"],
  ["Tiptap Papyro generic menu panel radius", ".tiptap-menu-content:not(.tiptap-table-menu-content) > .tiptap-combobox-list", "--mn-tiptap-menu-radius"],
  ["Tiptap Papyro combobox opaque surface", ".tiptap-combobox-popover > .tiptap-combobox-list", "box-shadow: var(--tt-shadow-elevated-md"],
  ["Tiptap Papyro card viewport guard", ".tiptap-card", "max-width: var(--mn-tiptap-menu-max-width"],
  ["Tiptap Papyro card opaque surface", ".tiptap-card", "background-color: var(--tiptap-card-bg-color"],
  ["Tiptap Papyro floating toolbar opaque surface", ".tiptap-toolbar[data-variant=\"floating\"]", "background-color: var(--tt-toolbar-bg-color"],
  ["Tiptap Papyro menu item height", ".tiptap-combobox-list .tiptap-button", "--mn-tiptap-menu-item-height"],
  ["Tiptap Papyro menu item gap", ".tiptap-combobox-list .tiptap-button", "--mn-tiptap-menu-item-gap"],
  ["Tiptap Papyro menu text clipping", ".tiptap-combobox-list .tiptap-button-text", "text-overflow: ellipsis"],
  ["Tiptap Papyro menu focus ring", ".tiptap-combobox-list .tiptap-button:focus-visible", "--mn-focus-ring-sm"],
  ["Tiptap official drag handle motion", ".drag-handle", "transition-property:top"],
  ["Tiptap official drag handle bridge", ".drag-handle::before", "pointer-events:auto"],
  ["Tiptap Papyro block handle size", ".mn-tiptap-drag-context-menu-handle .tiptap-button", "--mn-tiptap-handle-size"],
  ["Tiptap Papyro block handle icon", ".mn-tiptap-drag-context-menu-handle .tiptap-button-icon", "1rem"],
  ["Tiptap official table row handle", ".tiptap-table-handle-menu.row", "--table-handle-ref-height"],
  ["Tiptap official table column handle", ".tiptap-table-handle-menu.column", "--table-handle-ref-width"],
  ["Tiptap official table dragging handle", ".tiptap-table-handle-menu.is-dragging", "cursor: grabbing"],
  ["Tiptap Papyro table handle refined border", ".tiptap-table-handle-menu", "var(--mn-border"],
  ["Tiptap official table cell menu dot", ".expandable-menu-button::before", "var(--dot-size-small)"],
  ["Tiptap official table cell menu icon", ".expandable-menu-button svg", "opacity: 0"],
  ["Tiptap official table cell menu focus", ".expandable-menu-button:focus-visible", "outline: 2px solid"],
  ["Tiptap Papyro table cell handle quiet idle", ".expandable-menu-button", "--cell-handle-idle-bg"],
  ["Tiptap official table row extend", ".tiptap-table-extend-row-column-button.tiptap-table-row-end-add-remove", "cursor: row-resize"],
  ["Tiptap official table column extend", ".tiptap-table-extend-row-column-button.tiptap-table-column-end-add-remove", "cursor: col-resize"],
  ["Tiptap Papyro table extend refined border", ".tiptap-table-extend-row-column-button", "var(--mn-border"],
  ["Tiptap table menu isolated surface", ".tiptap-menu-content.tiptap-table-menu-content", "isolation: isolate"],
  ["Tiptap table menu allows nested flyouts", ".tiptap-menu-content.tiptap-table-menu-content", "overflow: visible"],
  ["Tiptap table menu direct panel", ".tiptap-table-menu-content > .tiptap-combobox-list", "margin-block: 0"],
  ["Tiptap table menu direct panel radius", ".tiptap-table-menu-content > .tiptap-combobox-list", "--mn-tiptap-menu-radius"],
  ["Tiptap table menu opaque panel", ".tiptap-table-menu-content > .tiptap-combobox-list", "background-color: var(--tiptap-card-bg-color"],
  ["Tiptap table menu panel viewport guard", ".tiptap-table-menu-content > .tiptap-combobox-list", "max-width: min(18rem"],
  ["Tiptap table menu panel scroll guard", ".tiptap-table-menu-content > .tiptap-combobox-list", "overflow-y: auto"],
  ["Tiptap table menu button rhythm", ".tiptap-table-menu-content > .tiptap-combobox-list .tiptap-button", "justify-content: flex-start"],
  ["Tiptap table menu item height", ".tiptap-table-menu-content > .tiptap-combobox-list .tiptap-button", "--mn-tiptap-menu-item-height"],
  ["Tiptap table menu direct text clipping", ".tiptap-table-menu-content > .tiptap-combobox-list .tiptap-button-text", "white-space: nowrap"],
  ["Tiptap official block handle stacking", ".mn-tiptap-drag-context-menu-handle", "z-index: 166"],
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

const PAPYRO_FEATURE_REQUIREMENTS = [
  ["Papyro document content rail", ".mn-document-main", "--mn-document-content-width"],
  ["Papyro document wide rail", ".mn-document-main", "--mn-document-wide-width"],
  ["Papyro source pane", ".mn-tiptap-source-pane", "--mn-document-code-font"],
  ["Papyro source pane width parity", ".mn-tiptap-source-pane", "--mn-document-content-width"],
  ["Papyro fallback input width parity", ".mn-editor-fallback-input", "--mn-document-content-width"],
  ["Papyro Hybrid mode shows editor", ".mn-tiptap-runtime[data-view-mode=\"hybrid\"] .mn-tiptap-editor", "display: block"],
  ["Papyro source mode hides editor", ".mn-tiptap-runtime[data-view-mode=\"source\"] .mn-tiptap-editor", "display: none"],
  ["Papyro Preview mode hides Tiptap runtime", ".mn-tiptap-runtime[data-view-mode=\"preview\"]", "display: none"],
  ["Papyro source pane selection", ".mn-tiptap-source-pane::selection", "--mn-hybrid-selection"],
  ["Papyro KaTeX inline math", ".mn-tiptap-inline-math", "--mn-markdown-inline-math-font"],
  ["Papyro KaTeX source editor", ".mn-tiptap-math-source", "--mn-markdown-mono-font"],
  ["Papyro Mermaid source editor", ".mn-tiptap-mermaid-source", "--mn-markdown-code-block-pad-y"],
  ["Papyro Mermaid preview block", ".mn-mermaid-block", "--mn-markdown-code-block-bg"],
  ["Papyro Mermaid status", ".mn-mermaid-status", "--mn-type-small"],
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
  for (const [label, selector, token] of PAPYRO_FEATURE_REQUIREMENTS) {
    if (!includesCssFragment(source, compactSource, selector)) {
      failures.push(`${label} missing selector ${selector}`);
    }
    if (!includesCssFragment(source, compactSource, token)) {
      failures.push(`${label} missing token ${token}`);
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
${PAPYRO_FEATURE_REQUIREMENTS.map(
  ([, selector, token]) => `${selector} { color: var(${token}); }`,
).join("\n")}
`;

  assert(checkCssText(css).length === 0);

  const missingTokenCss = css.replace("  --mn-markdown-h1-size: #111111;\n", "");
  assert(checkCssText(missingTokenCss).some((failure) => failure.includes("--mn-markdown-h1-size")));

  const missingTiptap = css.replaceAll(".mn-tiptap-editor", ".mn-editor");
  assert(checkCssText(missingTiptap).some((failure) => failure.includes("Tiptap editor")));

  const missingCommandPanel = css.replaceAll("role:\"listbox\"", "role:\"menu\"");
  assert(
    checkCssText(missingCommandPanel).some((failure) =>
      failure.includes("Tiptap official suggestion menu"),
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

  const missingPapyroFeature = css.replaceAll(".mn-tiptap-source-pane", ".mn-source-pane");
  assert(
    checkCssText(missingPapyroFeature).some((failure) =>
      failure.includes("Papyro source pane"),
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
