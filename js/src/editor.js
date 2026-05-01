import { EditorSelection, EditorState, StateEffect, StateField } from "@codemirror/state";
import {
  EditorView,
  Decoration,
  ViewPlugin,
  WidgetType,
  keymap,
  lineNumbers,
  drawSelection,
  highlightActiveLine,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import {
  highlightSelectionMatches,
  openSearchPanel,
  search,
  searchKeymap,
} from "@codemirror/search";
import { tags as t } from "@lezer/highlight";
import {
  activeOutlineHeadingIndex,
  activePreviewHeadingIndex,
  applyFormatToView,
  attachViewToTab as attachViewToTabCore,
  collapsedSelectionTouchesTextRange,
  collectMarkdownCodeBlocks,
  collectMarkdownFrontMatterBlock,
  collectMarkdownMathBlocks,
  collectMarkdownTableBlocks,
  completeMarkdownShortcutOnSpace,
  continueMarkdownListOnEnter,
  handleMarkdownBackspace,
  handleRustMessage as handleRustMessageCore,
  hybridInputTraceContext,
  hybridDecorationLevel,
  hybridHeadingDecorationLevel,
  indentMarkdownListInView,
  latestModeScrollSnapshot,
  markdownBlockLineRange,
  markdownCodeFenceInfoRange,
  markdownDecorationTier,
  markdownTaskCheckboxToggleChange,
  modeSupportsEditorScroll,
  normalizeEditorPreferences,
  normalizeViewMode,
  nextLayoutSize,
  parseMarkdownBlockquoteLine,
  parseMarkdownFootnoteDefinitionLine,
  parseMarkdownCodeFenceLine,
  parseMarkdownHeadingLine,
  parseMarkdownHorizontalRuleLine,
  parseMarkdownInlineSpans,
  parseMarkdownListLine,
  parseMarkdownTaskLine,
  openReplacePanelInView,
  pastePlainTextInView,
  readScrollSnapshot,
  recycleEditor as recycleEditorCore,
  requestSaveForView,
  restoreScrollSnapshot,
  saveModeScrollSnapshot,
  scrollEditorViewToLine,
  scrollPreviewToHeading,
  selectionOverlapsTextRange,
  shouldUseFullDocumentHybridScan,
  blockHintsEqual,
  setBlockHints as setBlockHintsCore,
  setEditorPreferences as setEditorPreferencesCore,
  setViewMode as setViewModeCore,
  viewIsComposing,
} from "./editor-core.js";
import {
  InlineMathWidget,
  addImageDecorations,
  addMathBlockDecorations,
  addMermaidBlockDecorations,
  addTableWidgetDecorations,
  renderPreviewMermaid,
  tableWidgetData,
} from "./editor-media.js";

// tabId → { view, dioxus, suppressChange }
const editorRegistry = new Map();
const modeScrollSnapshots = new Map();
const editorScrollListeners = new WeakMap();
const previewScrollListeners = new WeakMap();

function isVisibleElement(element) {
  if (!(element instanceof HTMLElement)) return false;

  const style = getComputedStyle(element);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.visibility !== "collapse"
  );
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image"));
    reader.readAsDataURL(blob);
  });
}

function imageFileFromTransfer(transfer) {
  const items = Array.from(transfer?.items ?? []);
  for (const item of items) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file) return { file, mimeType: item.type };
  }

  const files = Array.from(transfer?.files ?? []);
  const file = files.find((file) => file.type.startsWith("image/"));
  return file ? { file, mimeType: file.type } : null;
}

async function sendEditorImage(tabId, image) {
  const { file, mimeType } = image;
  const entry = editorRegistry.get(tabId);
  const data = await blobToBase64(file);
  editorRegistry.get(tabId)?.dioxus?.send({
    type: "paste_image_requested",
    tab_id: tabId,
    mime_type: file.type || mimeType || "image/png",
    data,
  });
  entry?.view?.focus();
}

function placeCursorAtDrop(view, event) {
  const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (position == null) return;
  view.dispatch({ selection: { anchor: position } });
}

const setViewModeEffect = StateEffect.define();
const setBlockHintsEffect = StateEffect.define();
const EDITOR_COMPOSITION_CLASS = "cm-composition-active";
const HYBRID_NEAR_BLOCK_DISTANCE = 2;
const HYBRID_TABLE_WIDGET_MAX_BYTES = 32 * 1024;
const HYBRID_TABLE_WIDGET_MAX_CELLS = 400;
const OUTLINE_MOBILE_MEDIA_QUERY = "(max-width: 1280px)";
const viewModeField = StateField.define({
  create() {
    return "hybrid";
  },
  update(mode, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setViewModeEffect)) return effect.value;
    }
    return mode;
  },
});
const blockHintsField = StateField.define({
  create() {
    return null;
  },
  update(hints, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setBlockHintsEffect)) return effect.value;
    }
    if (transaction.docChanged) return null;
    return hints;
  },
});

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "var(--mn-document-body-size, var(--mn-editor-font-size, 15px))",
    backgroundColor: "var(--mn-editor-bg, #fffdf8)",
    color: "var(--mn-editor-ink, var(--mn-ink, #25211a))",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: 'var(--mn-document-font, var(--mn-editor-font, "Cascadia Code", "JetBrains Mono", "Fira Code", monospace))',
    lineHeight: "var(--mn-document-line-height, var(--mn-editor-line-height, 1.75))",
    padding: "var(--mn-document-pad-top, 24px) var(--mn-document-pad-x, 28px) var(--mn-document-pad-bottom, 72px)",
  },
  ".cm-content": {
    minHeight: "100%",
    width: "100%",
    padding: "0",
    fontFamily: "inherit",
    fontSize: "inherit",
    lineHeight: "var(--mn-document-line-height, var(--mn-editor-line-height, 1.75))",
    caretColor: "var(--mn-accent, #b24b2f)",
    maxWidth: "var(--mn-document-measure, 860px)",
    marginInline: "auto",
    color: "var(--mn-editor-ink, var(--mn-ink, #25211a))",
  },
  ".cm-line": {
    boxSizing: "border-box",
    lineHeight: "var(--mn-document-line-height, var(--mn-editor-line-height, 1.75))",
    paddingTop: "0",
    paddingBottom: "0",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
    color: "var(--mn-ink-3, #a08f78)",
    paddingTop: "var(--mn-document-pad-top, 24px)",
    paddingRight: "var(--mn-document-gutter-gap, 8px)",
  },
  "&[data-view-mode='hybrid'] .cm-gutters, &[data-view-mode='preview'] .cm-gutters": {
    display: "none",
  },
  ".cm-activeLine": { backgroundColor: "var(--mn-active-line, rgba(178,75,47,.05))" },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--mn-active-line-gutter, rgba(178,75,47,.08))",
    color: "var(--mn-ink-2, #564c41)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--mn-accent, #b24b2f)",
    borderLeftWidth: "2px",
  },
  "&.cm-focused .cm-cursor, &.cm-focused .cm-dropCursor": {
    borderLeftColor: "var(--mn-caret, var(--mn-accent, #b24b2f))",
    boxShadow: "0 0 0 1px var(--mn-caret-halo, transparent)",
  },
  "&.cm-composition-active .cm-cursor, &.cm-composition-active .cm-dropCursor": {
    borderLeftColor: "var(--mn-caret-composing, var(--mn-warning, #9f6a3a))",
    boxShadow: "0 0 0 2px var(--mn-composition-halo, rgba(159, 106, 58, .18))",
  },
  "&.cm-composition-active .cm-activeLine": {
    backgroundColor: "var(--mn-composition-line, rgba(159, 106, 58, .10))",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    background: "var(--mn-editor-selection, rgba(100, 116, 139, .26))",
    backgroundColor: "var(--mn-editor-selection, rgba(100, 116, 139, .26))",
    color: "var(--mn-ink)",
  },
  ".cm-selectionBackground": {
    borderRadius: "2px",
  },
  "&[data-view-mode='hybrid'] .cm-activeLine, &[data-view-mode='preview'] .cm-activeLine": {
    backgroundColor: "transparent",
  },
  ".cm-focused": { outline: "none" },
  ".cm-panels": {
    backgroundColor: "var(--mn-surface, #fbf6ea)",
    color: "var(--mn-ink, #25211a)",
  },
  ".cm-search": {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "var(--mn-action-gap, 6px)",
    padding: "var(--mn-command-row-pad, 8px 10px)",
    borderBottom: "var(--mn-border-default, 1px solid var(--mn-border))",
    fontFamily: "var(--mn-font-ui, system-ui, sans-serif)",
    fontSize: "var(--mn-type-small, 12px)",
  },
  ".cm-search input": {
    minWidth: "120px",
    border: "var(--mn-border-default, 1px solid var(--mn-border))",
    borderRadius: "var(--mn-radius-sm, 6px)",
    backgroundColor: "var(--mn-surface-raised)",
    color: "var(--mn-ink)",
    padding: "4px 7px",
  },
  ".cm-search button, .cm-search label": {
    borderRadius: "var(--mn-radius-sm, 6px)",
    color: "var(--mn-ink-2)",
  },
  ".cm-search button": {
    border: "var(--mn-border-default, 1px solid var(--mn-border))",
    backgroundColor: "var(--mn-surface-raised)",
    padding: "4px 8px",
  },
  ".cm-search button:hover": {
    color: "var(--mn-ink)",
    borderColor: "var(--mn-border-strong)",
  },
  ".cm-searchMatch": {
    backgroundColor: "var(--mn-accent-dim)",
  },
  ".cm-searchMatch-selected": {
    backgroundColor: "var(--mn-selection, rgba(178,75,47,.15))",
    outline: "var(--mn-border-accent, 1px solid var(--mn-accent))",
  },
  ".cm-selectionMatch": {
    backgroundColor: "var(--mn-accent-wash)",
  },
  ".cm-line.cm-hybrid-heading-line": {
    letterSpacing: "0",
  },
  ".cm-line.cm-hybrid-blockquote-line": {
    borderLeft: "var(--mn-markdown-quote-border, 2px) solid var(--mn-border-strong, var(--mn-border))",
    backgroundColor: "var(--mn-markdown-quote-bg, transparent)",
    color: "var(--mn-markdown-quote-color, var(--mn-ink-2))",
    paddingLeft: "var(--mn-markdown-quote-pad-x, 1.1em)",
    paddingTop: "var(--mn-markdown-quote-pad-y, .48em)",
    paddingBottom: "var(--mn-markdown-quote-pad-y, .48em)",
  },
  ".cm-line.cm-hybrid-code-block-line": {
    backgroundColor: "var(--mn-hybrid-code-block-bg, rgba(100, 116, 139, .09))",
    color: "var(--mn-ink)",
    fontFamily: 'var(--mn-markdown-mono-font, var(--mn-editor-font, "Cascadia Code", monospace))',
    paddingLeft: "var(--mn-markdown-code-block-pad-x, 22px)",
    paddingRight: "var(--mn-markdown-code-block-pad-x, 22px)",
  },
  ".cm-line.cm-hybrid-code-block-start": {
    borderTopLeftRadius: "var(--mn-markdown-code-radius, 6px)",
    borderTopRightRadius: "var(--mn-markdown-code-radius, 6px)",
  },
  ".cm-line.cm-hybrid-code-block-end": {
    borderBottomLeftRadius: "var(--mn-markdown-code-radius, 6px)",
    borderBottomRightRadius: "var(--mn-markdown-code-radius, 6px)",
  },
  ".cm-line.cm-hybrid-code-block-fence-end": {
    height: "1px",
    minHeight: "1px",
    overflow: "hidden",
    border: "0",
    paddingLeft: "0",
    paddingRight: "0",
    paddingTop: "0",
    paddingBottom: "0",
    lineHeight: "1px",
  },
  ".cm-line.cm-hybrid-front-matter-line": {
    backgroundColor: "var(--mn-surface, #fbf6ea)",
    color: "var(--mn-ink-3)",
    fontSize: ".92em",
    paddingLeft: "var(--mn-markdown-front-matter-pad-x, 12px)",
    paddingRight: "var(--mn-markdown-front-matter-pad-x, 12px)",
  },
  ".cm-line.cm-hybrid-front-matter-start": {
    borderTop: "var(--mn-border-default, 1px solid var(--mn-border))",
    borderTopLeftRadius: "var(--mn-markdown-code-radius, 6px)",
    borderTopRightRadius: "var(--mn-markdown-code-radius, 6px)",
    paddingTop: "var(--mn-markdown-front-matter-pad-y, .45em)",
  },
  ".cm-line.cm-hybrid-front-matter-end": {
    borderBottom: "var(--mn-border-default, 1px solid var(--mn-border))",
    borderBottomLeftRadius: "var(--mn-markdown-code-radius, 6px)",
    borderBottomRightRadius: "var(--mn-markdown-code-radius, 6px)",
    paddingBottom: "var(--mn-markdown-front-matter-pad-y, .45em)",
  },
  ".cm-line.cm-hybrid-table-line": {
    fontFamily: 'var(--mn-markdown-mono-font, var(--mn-editor-font, "Cascadia Code", monospace))',
    backgroundColor: "var(--mn-markdown-table-bg, var(--mn-surface-sunken, #fbf6ea))",
    borderLeft: "var(--mn-markdown-table-border, var(--mn-border-default, 1px solid var(--mn-border)))",
    borderRight: "var(--mn-markdown-table-border, var(--mn-border-default, 1px solid var(--mn-border)))",
    paddingLeft: "var(--mn-markdown-table-line-pad-x, 14px)",
    paddingRight: "var(--mn-markdown-table-line-pad-x, 14px)",
  },
  ".cm-line.cm-hybrid-table-header": {
    backgroundColor: "var(--mn-markdown-table-head-bg, var(--mn-markdown-table-bg, var(--mn-surface-sunken, #fbf6ea)))",
    color: "var(--mn-ink)",
    fontWeight: "var(--mn-weight-bold, 700)",
    borderTop: "var(--mn-markdown-table-border, var(--mn-border-default, 1px solid var(--mn-border)))",
    borderTopLeftRadius: "var(--mn-markdown-code-radius, 6px)",
    borderTopRightRadius: "var(--mn-markdown-code-radius, 6px)",
    paddingTop: "var(--mn-markdown-table-line-pad-y, .55em)",
  },
  ".cm-line.cm-hybrid-table-separator": {
    color: "var(--mn-ink-3)",
    fontSize: ".85em",
  },
  ".cm-line.cm-hybrid-table-end": {
    borderBottom: "var(--mn-markdown-table-border, var(--mn-border-default, 1px solid var(--mn-border)))",
    borderBottomLeftRadius: "var(--mn-markdown-code-radius, 6px)",
    borderBottomRightRadius: "var(--mn-markdown-code-radius, 6px)",
    paddingBottom: "var(--mn-markdown-table-line-pad-y, .55em)",
  },
  ".cm-hybrid-table-widget": {
    display: "block",
    overflowX: "auto",
    margin: "var(--mn-markdown-block-gap, 14px) 0",
  },
  ".cm-hybrid-table-toolbar": {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    marginBottom: "6px",
    userSelect: "none",
    WebkitUserSelect: "none",
  },
  ".cm-hybrid-table-toolbar button": {
    border: "var(--mn-border-subtle, 1px solid var(--mn-divider))",
    borderRadius: "6px",
    background: "var(--mn-surface)",
    color: "var(--mn-ink-2)",
    font: "inherit",
    fontSize: ".82em",
    padding: "4px 8px",
    cursor: "pointer",
  },
  ".cm-hybrid-table-toolbar button:hover": {
    color: "var(--mn-ink)",
    borderColor: "var(--mn-accent)",
  },
  ".cm-hybrid-table-widget table": {
    width: "100%",
    borderCollapse: "collapse",
    background: "var(--mn-surface)",
    border: "var(--mn-markdown-table-border, var(--mn-border-default, 1px solid var(--mn-border)))",
    borderRadius: "var(--mn-markdown-code-radius, 6px)",
    overflow: "hidden",
  },
  ".cm-hybrid-table-widget th, .cm-hybrid-table-widget td": {
    border: "var(--mn-markdown-table-border, var(--mn-border-default, 1px solid var(--mn-border)))",
    padding: "0",
  },
  ".cm-hybrid-table-widget th": {
    background: "var(--mn-markdown-table-head-bg, var(--mn-surface-sunken))",
  },
  ".cm-hybrid-table-cell-input": {
    boxSizing: "border-box",
    width: "100%",
    minWidth: "96px",
    border: "0",
    outline: "none",
    background: "transparent",
    color: "var(--mn-ink)",
    font: "inherit",
    padding: "var(--mn-markdown-table-cell-pad, 7px 12px)",
  },
  ".cm-hybrid-table-cell-input:focus": {
    background: "var(--mn-selection-soft, color-mix(in srgb, var(--mn-accent) 12%, transparent))",
    boxShadow: "inset 0 0 0 1px var(--mn-accent)",
  },
  ".cm-hybrid-code-info": {
    display: "inline-flex",
    width: "fit-content",
    border: "var(--mn-border-subtle, 1px solid var(--mn-divider))",
    borderRadius: "var(--mn-radius-xs, 5px)",
    backgroundColor: "var(--mn-surface, #fff)",
    color: "var(--mn-ink-3)",
    fontSize: ".78em",
    fontWeight: "var(--mn-weight-bold, 700)",
    lineHeight: "1.6",
    padding: "0 .55em",
    textTransform: "uppercase",
    userSelect: "none",
    WebkitUserSelect: "none",
  },
  ".cm-hybrid-heading": {
    color: "var(--mn-ink)",
    fontFamily: "var(--mn-markdown-heading-font, var(--mn-font-display, Georgia, serif))",
    fontWeight: "var(--mn-weight-bold, 700)",
    lineHeight: "var(--mn-markdown-heading-line, 1.18)",
  },
  ".cm-hybrid-heading-1": { fontSize: "var(--mn-markdown-h1-size, 2.05em)" },
  ".cm-hybrid-heading-2": { fontSize: "var(--mn-markdown-h2-size, 1.55em)" },
  ".cm-hybrid-heading-3": { fontSize: "var(--mn-markdown-h3-size, 1.25em)" },
  ".cm-hybrid-heading-4": { fontSize: "var(--mn-markdown-h4-size, 1.05em)" },
  ".cm-hybrid-heading-5, .cm-hybrid-heading-6": {
    fontSize: "var(--mn-markdown-h5-size, .9em)",
    letterSpacing: "0",
    textTransform: "uppercase",
  },
  ".cm-hybrid-strong": {
    color: "var(--mn-ink)",
    fontWeight: "var(--mn-weight-bold, 700)",
  },
  ".cm-hybrid-emphasis": {
    color: "var(--mn-ink)",
    fontStyle: "italic",
  },
  ".cm-hybrid-strikethrough": {
    color: "var(--mn-ink-3)",
    textDecoration: "line-through",
  },
  ".cm-hybrid-inline-code": {
    borderRadius: "var(--mn-radius-xs, 5px)",
    background: "transparent",
    backgroundColor: "transparent",
    boxDecorationBreak: "clone",
    WebkitBoxDecorationBreak: "clone",
    boxShadow: "0 0 0 .14em color-mix(in srgb, var(--mn-markdown-code-bg, #f6f8fb) 72%, transparent)",
    color: "var(--mn-markdown-code-color, var(--mn-accent-strong))",
    fontFamily: 'var(--mn-markdown-mono-font, var(--mn-editor-font, "Cascadia Code", monospace))',
    fontSize: ".92em",
    lineHeight: "inherit",
    padding: "0",
  },
  ".cm-hybrid-inline-code-selected": {
    background: "transparent",
    backgroundColor: "transparent",
    boxShadow: "none",
  },
  ".cm-hybrid-inline-code::selection, .cm-hybrid-inline-code *::selection": {
    background: "transparent !important",
    backgroundColor: "transparent !important",
    color: "inherit !important",
  },
  ".cm-hybrid-inline-math": {
    display: "inline-flex",
    alignItems: "baseline",
    color: "var(--mn-ink)",
    fontFamily: "var(--mn-markdown-inline-math-font, Georgia, 'Times New Roman', serif)",
    padding: "var(--mn-markdown-inline-math-pad, 0 2px)",
    verticalAlign: "baseline",
  },
  ".cm-hybrid-inline-math math": {
    fontSize: "1.05em",
  },
  ".cm-hybrid-inline-math-error": {
    color: "var(--mn-accent-strong)",
    fontFamily: 'var(--mn-markdown-mono-font, var(--mn-editor-font, "Cascadia Code", monospace))',
  },
  ".cm-hybrid-math-block": {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    margin: "var(--mn-markdown-block-gap, .95em) 0",
    padding: "var(--mn-markdown-code-block-pad-y, 18px) var(--mn-markdown-code-block-pad-x, 22px)",
    border: "var(--mn-border-subtle, 1px solid var(--mn-divider))",
    borderRadius: "var(--mn-markdown-code-radius, 6px)",
    backgroundColor: "var(--mn-markdown-code-block-bg, var(--mn-surface-sunken, #fbf6ea))",
    color: "var(--mn-ink)",
    overflowX: "auto",
    textAlign: "center",
  },
  ".cm-hybrid-math-block, .cm-hybrid-mermaid-block": {
    cursor: "pointer",
  },
  ".cm-hybrid-math-block, .cm-hybrid-image-preview, .cm-hybrid-mermaid-block:not(.cm-hybrid-mermaid-split), .cm-hybrid-mermaid-preview, .cm-hybrid-code-info, .cm-hybrid-list-marker, .cm-hybrid-task-checkbox, .cm-hybrid-footnote-ref, .cm-hybrid-footnote-label, .cm-hybrid-horizontal-rule": {
    userSelect: "none",
    WebkitUserSelect: "none",
  },
  ".cm-hybrid-mermaid-split": {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))",
    gap: "10px",
    cursor: "default",
    alignItems: "stretch",
    minHeight: "0",
  },
  ".cm-hybrid-mermaid-source-pane, .cm-hybrid-mermaid-preview-pane": {
    display: "grid",
    gridTemplateRows: "minmax(0, 1fr)",
    minWidth: "0",
    minHeight: "0",
  },
  ".cm-hybrid-mermaid-source-editor": {
    boxSizing: "border-box",
    height: "100%",
    width: "100%",
    minWidth: "0",
    minHeight: "0",
    overflow: "hidden",
    borderRadius: "var(--mn-markdown-code-radius, 6px)",
    background: "var(--mn-markdown-code-block-bg, var(--mn-surface-sunken, #f6f8fb))",
    cursor: "text",
    userSelect: "text",
    WebkitUserSelect: "text",
  },
  ".cm-hybrid-mermaid-source-editor *": {
    userSelect: "text",
    WebkitUserSelect: "text",
  },
  ".cm-hybrid-mermaid-source-editor .cm-editor": {
    boxSizing: "border-box",
    height: "100%",
    width: "100%",
    minWidth: "0",
    background: "transparent",
    color: "var(--mn-ink)",
    cursor: "text",
  },
  ".cm-hybrid-mermaid-source-editor .cm-scroller": {
    overflowX: "hidden",
    cursor: "text",
    fontFamily: "var(--mn-markdown-mono-font)",
    fontSize: "var(--mn-markdown-code-block-size)",
    lineHeight: "var(--mn-markdown-code-block-line)",
    padding: "var(--mn-markdown-code-block-pad-y, 18px) var(--mn-markdown-code-block-pad-x, 22px)",
  },
  ".cm-hybrid-mermaid-source-editor .cm-content": {
    minWidth: "0",
    width: "100%",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    cursor: "text",
    caretColor: "var(--mn-caret, var(--mn-accent))",
  },
  ".cm-hybrid-mermaid-source-editor .cm-line": {
    cursor: "text",
  },
  ".cm-hybrid-mermaid-source-editor .cm-gutters": {
    display: "none",
  },
  ".cm-hybrid-mermaid-source-editor .cm-activeLine": {
    background: "transparent",
  },
  ".cm-hybrid-mermaid-source-editor .cm-selectionBackground, .cm-hybrid-mermaid-source-editor .cm-focused .cm-selectionBackground": {
    background: "var(--mn-editor-selection, rgba(100, 116, 139, .26))",
    backgroundColor: "var(--mn-editor-selection, rgba(100, 116, 139, .26))",
    color: "var(--mn-ink)",
  },
  ".cm-hybrid-mermaid-source-editor::selection, .cm-hybrid-mermaid-source-editor ::selection, .cm-hybrid-mermaid-source-editor .cm-content::selection, .cm-hybrid-mermaid-source-editor .cm-content:focus::selection, .cm-hybrid-mermaid-source-editor .cm-content:focus ::selection, .cm-hybrid-mermaid-source-editor .cm-line::selection, .cm-hybrid-mermaid-source-editor .cm-line *::selection": {
    background: "transparent !important",
    backgroundColor: "transparent !important",
    color: "inherit !important",
  },
  ".cm-hybrid-mermaid-preview": {
    boxSizing: "border-box",
    height: "100%",
    minHeight: "0",
    minWidth: "0",
    display: "grid",
    alignItems: "center",
    borderRadius: "var(--mn-radius-sm, 6px)",
    background: "var(--mn-surface, #fff)",
    padding: "10px",
    overflow: "auto",
  },
  ".cm-hybrid-math-block:focus-visible, .cm-hybrid-image-preview:focus-visible, .cm-hybrid-mermaid-block:focus-visible": {
    outline: "2px solid var(--mn-accent)",
    outlineOffset: "2px",
  },
  ".cm-hybrid-math-block math": {
    fontSize: "1.15em",
  },
  ".cm-hybrid-math-block-error": {
    color: "var(--mn-danger, var(--mn-accent-strong))",
    fontFamily: 'var(--mn-markdown-mono-font, var(--mn-editor-font, "Cascadia Code", monospace))',
    textAlign: "left",
    whiteSpace: "pre-wrap",
  },
  ".cm-line.cm-hybrid-footnote-line": {
    color: "var(--mn-ink-2)",
    paddingLeft: "var(--mn-markdown-footnote-indent, 1.4em)",
    textIndent: "calc(var(--mn-markdown-footnote-indent, 1.4em) * -1)",
  },
  ".cm-hybrid-footnote-label": {
    color: "var(--mn-accent)",
    fontVariantNumeric: "tabular-nums",
    fontWeight: "var(--mn-weight-bold, 700)",
    marginRight: "0.4em",
  },
  ".cm-hybrid-footnote-ref": {
    color: "var(--mn-accent)",
    fontSize: ".72em",
    fontWeight: "var(--mn-weight-bold, 700)",
    verticalAlign: "super",
  },
  ".cm-hybrid-link": {
    color: "var(--mn-accent)",
    textDecoration: "underline",
    textUnderlineOffset: "var(--mn-markdown-link-underline-offset, 3px)",
  },
  ".cm-hybrid-image-preview": {
    display: "inline-flex",
    alignItems: "center",
    maxWidth: "100%",
    verticalAlign: "middle",
  },
  ".cm-hybrid-image-preview img": {
    display: "block",
    maxWidth: "100%",
    maxHeight: "var(--mn-markdown-image-max-height, 260px)",
    borderRadius: "var(--mn-markdown-image-radius, 6px)",
    border: "var(--mn-markdown-image-border, var(--mn-border-default, 1px solid var(--mn-border)))",
    backgroundColor: "var(--mn-markdown-image-bg, var(--mn-surface))",
    boxShadow: "none",
  },
  ".cm-hybrid-image-block": {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    width: "fit-content",
    maxWidth: "100%",
    margin: "var(--mn-markdown-block-gap, .95em) 0",
    cursor: "pointer",
  },
  ".cm-hybrid-image-caption": {
    marginTop: "6px",
    color: "var(--mn-ink-3)",
    fontFamily: "var(--mn-font-ui)",
    fontSize: "var(--mn-type-small)",
  },
  ".cm-hybrid-image-preview-error": {
    border: "var(--mn-border-subtle, 1px solid var(--mn-divider))",
    borderRadius: "var(--mn-markdown-image-radius, 6px)",
    backgroundColor: "var(--mn-markdown-code-block-bg, var(--mn-surface-sunken))",
    color: "var(--mn-accent-strong)",
    padding: "var(--mn-markdown-code-block-pad-y, 14px) var(--mn-markdown-code-block-pad-x, 18px)",
    fontFamily: "var(--mn-markdown-mono-font)",
    fontSize: "var(--mn-markdown-code-block-size)",
  },
  ".cm-hybrid-task-checkbox": {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "var(--mn-markdown-list-marker-width, 1.4em)",
    marginRight: "var(--mn-markdown-list-marker-gap, .45em)",
    verticalAlign: "middle",
  },
  ".cm-hybrid-task-checkbox input": {
    width: "var(--mn-markdown-task-box-size, 14px)",
    height: "var(--mn-markdown-task-box-size, 14px)",
    accentColor: "var(--mn-accent)",
    cursor: "default",
  },
  ".cm-hybrid-list-marker": {
    display: "inline-block",
    boxSizing: "content-box",
    minWidth: "var(--mn-markdown-list-marker-width, 1.4em)",
    paddingRight: "var(--mn-markdown-list-marker-gap, .45em)",
    color: "var(--mn-ink-3)",
    cursor: "text",
    fontVariantNumeric: "tabular-nums",
    fontSize: "inherit",
    lineHeight: "inherit",
    textAlign: "right",
    userSelect: "none",
    WebkitUserSelect: "none",
    verticalAlign: "baseline",
  },
  ".cm-hybrid-horizontal-rule": {
    display: "block",
    width: "100%",
    height: "var(--mn-markdown-hr-height, 1px)",
    margin: "var(--mn-markdown-hr-margin, .9em 0)",
    backgroundColor: "var(--mn-border)",
  },
});

const markdownHighlightStyle = HighlightStyle.define([
  { tag: t.heading1, color: "var(--mn-ink)", fontWeight: "var(--mn-weight-bold, 700)" },
  { tag: t.heading2, color: "var(--mn-ink)", fontWeight: "var(--mn-weight-bold, 700)" },
  { tag: t.heading3, color: "var(--mn-ink)", fontWeight: "var(--mn-weight-semibold, 600)" },
  { tag: [t.heading4, t.heading5, t.heading6], color: "var(--mn-ink)", fontWeight: "var(--mn-weight-semibold, 600)" },

  { tag: t.strong, color: "var(--mn-ink)", fontWeight: "var(--mn-weight-bold, 700)" },
  { tag: t.emphasis, color: "var(--mn-ink)", fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through", color: "var(--mn-ink-3)" },

  { tag: t.link, color: "var(--mn-accent)", textDecoration: "underline" },
  { tag: t.url, color: "var(--mn-accent)" },

  { tag: [t.monospace, t.labelName], color: "var(--mn-accent-strong)" },
  { tag: t.comment, color: "var(--mn-ink-3)", fontStyle: "italic" },
  { tag: t.quote, color: "var(--mn-ink-2)", fontStyle: "italic" },

  { tag: t.list, color: "inherit" },
  { tag: t.meta, color: "var(--mn-ink-3)" },
  { tag: t.processingInstruction, color: "var(--mn-ink-3)" },
  { tag: t.contentSeparator, color: "var(--mn-ink-3)" },

  { tag: t.keyword, color: "var(--mn-accent)", fontWeight: "var(--mn-weight-medium, 500)" },
  { tag: [t.atom, t.bool, t.number], color: "var(--mn-accent-strong)" },
  { tag: t.string, color: "var(--mn-ink-2)" },
  { tag: t.regexp, color: "var(--mn-accent-strong)" },
  { tag: [t.variableName, t.propertyName], color: "var(--mn-ink)" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--mn-ink)", fontWeight: "var(--mn-weight-medium, 500)" },
  { tag: [t.typeName, t.className], color: "var(--mn-accent-strong)" },
  { tag: [t.operator, t.punctuation], color: "var(--mn-ink-2)" },
  { tag: t.definition(t.variableName), color: "var(--mn-ink)" },
]);

function selectionLineRanges(state) {
  return state.selection.ranges.map((range) => {
    const fromLine = state.doc.lineAt(range.from);
    const toLine = state.doc.lineAt(range.to);
    return {
      fromLine: fromLine.number,
      toLine: toLine.number,
    };
  });
}

function decorationTierForRange(state, fromLine, toLine) {
  return markdownDecorationTier(
    selectionLineRanges(state),
    fromLine,
    toLine,
    HYBRID_NEAR_BLOCK_DISTANCE,
  );
}

function decorationTierForLine(state, line) {
  return decorationTierForRange(state, line.number, line.number);
}

function documentLineTexts(doc) {
  const lines = [];
  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
    lines.push(doc.line(lineNumber).text);
  }
  return lines;
}

function rangeBlockForLine(blocks, lineNumber) {
  return blocks.find(
    (block) => lineNumber >= block.fromLine && lineNumber <= block.toLine,
  );
}

function usableBlockHints(hints) {
  return Boolean(
    hints &&
    hints.fallback?.type !== "source_only" &&
    Array.isArray(hints.blocks),
  );
}

function sourceOnlyBlockHints(hints) {
  return hints?.fallback?.type === "source_only";
}

function blockHintRange(block) {
  const range = markdownBlockLineRange(block);
  if (!range) return null;

  return {
    fromLine: range.fromLine,
    toLine: range.toLine,
    kind: block.kind ?? { type: "paragraph" },
  };
}

function blockHintRanges(hints) {
  if (!usableBlockHints(hints)) return [];

  return hints.blocks
    .map(blockHintRange)
    .filter(Boolean);
}

function hintRangesByKind(hintRanges, kind) {
  return hintRanges.filter((block) => block.kind?.type === kind);
}

function inputTraceContextForView(entry, state) {
  const mode = state.field(viewModeField, false);
  if (mode !== "hybrid") {
    return {
      hybrid_block_kind: "none",
      hybrid_block_state: mode,
      hybrid_block_tier: "none",
      hybrid_fallback_reason: "none",
    };
  }

  const line = state.doc.lineAt(state.selection.main.head);
  const trace = hybridInputTraceContext(
    entry?.blockHints,
    selectionLineRanges(state),
    line.number,
    HYBRID_NEAR_BLOCK_DISTANCE,
  );

  return {
    hybrid_block_kind: trace.hybridBlockKind,
    hybrid_block_state: trace.hybridBlockState,
    hybrid_block_tier: trace.hybridBlockTier,
    hybrid_fallback_reason: trace.hybridFallbackReason,
  };
}

function isMermaidLanguage(info) {
  const language = String(info ?? "").trim().split(/\s+/)[0] ?? "";
  return language.toLowerCase() === "mermaid";
}

function codeBlockHasClosingFence(doc, block) {
  if (
    !doc ||
    !block ||
    !Number.isSafeInteger(block.fromLine) ||
    !Number.isSafeInteger(block.toLine) ||
    block.toLine <= block.fromLine ||
    block.toLine > doc.lines
  ) {
    return false;
  }

  const startFence = parseMarkdownCodeFenceLine(doc.line(block.fromLine).text);
  const endFence = parseMarkdownCodeFenceLine(doc.line(block.toLine).text);
  return Boolean(
    startFence &&
      endFence &&
      endFence.info === "" &&
      endFence.marker === startFence.marker &&
      endFence.markerLength >= startFence.markerLength,
  );
}

function codeBlocksFromHints(hintRanges, doc) {
  return hintRanges
    .filter((block) =>
      block.kind?.type === "fenced_code" &&
      !isMermaidLanguage(block.kind?.language)
    )
    .map((block) => ({
      fromLine: block.fromLine,
      toLine: block.toLine,
      info: block.kind?.language ?? "",
      hasClosingFence: codeBlockHasClosingFence(doc, block),
    }));
}

function codeBlocksWithoutMermaid(blocks, doc) {
  return blocks
    .filter((block) => !isMermaidLanguage(block.info))
    .map((block) => ({
      ...block,
      hasClosingFence: codeBlockHasClosingFence(doc, block),
    }));
}

function fencedBlockSourceFromLines(lines, block) {
  if (!block || !Number.isSafeInteger(block.fromLine) || !Number.isSafeInteger(block.toLine)) {
    return "";
  }

  const fromIndex = Math.max(0, block.fromLine);
  const lastLine = lines[block.toLine - 1] ?? "";
  const firstFence = parseMarkdownCodeFenceLine(lines[block.fromLine - 1] ?? "");
  const lastFence = parseMarkdownCodeFenceLine(lastLine);
  const hasClosingFence =
    block.toLine > block.fromLine &&
    firstFence &&
    lastFence &&
    lastFence.info === "" &&
    lastFence.marker === firstFence.marker &&
    lastFence.markerLength >= firstFence.markerLength;
  const toIndex = hasClosingFence ? block.toLine - 1 : block.toLine;

  return lines.slice(fromIndex, toIndex).join("\n").trim();
}

function fencedBlockSourceFromDoc(doc, block) {
  if (!block || !doc) return "";

  const lines = [];
  for (
    let lineNumber = block.fromLine;
    lineNumber <= block.toLine && lineNumber <= doc.lines;
    lineNumber += 1
  ) {
    lines.push(doc.line(lineNumber).text);
  }

  return fencedBlockSourceFromLines(lines, {
    ...block,
    fromLine: 1,
    toLine: lines.length,
  });
}

function mermaidBlocksFromHints(hintRanges, doc) {
  return hintRanges
    .filter((block) =>
      block.kind?.type === "mermaid" ||
      (block.kind?.type === "fenced_code" && isMermaidLanguage(block.kind?.language))
    )
    .map((block) => ({
      fromLine: block.fromLine,
      toLine: block.toLine,
      source: fencedBlockSourceFromDoc(doc, block),
    }));
}

function mermaidBlocksFromScannedCodeBlocks(blocks, lines) {
  return blocks
    .filter((block) => isMermaidLanguage(block.info))
    .map((block) => ({
      fromLine: block.fromLine,
      toLine: block.toLine,
      source: fencedBlockSourceFromLines(lines, block),
    }));
}

function mathSourceFromHint(doc, block) {
  if (block.fromLine === block.toLine) {
    const text = doc.line(block.fromLine).text.trim();
    return text.startsWith("$$") && text.endsWith("$$")
      ? text.slice(2, -2).trim()
      : "";
  }

  const lines = [];
  for (let lineNumber = block.fromLine + 1; lineNumber < block.toLine; lineNumber += 1) {
    lines.push(doc.line(lineNumber).text);
  }
  return lines.join("\n").trim();
}

function mathBlocksFromHints(hintRanges, doc) {
  return hintRangesByKind(hintRanges, "math").map((block) => ({
    fromLine: block.fromLine,
    toLine: block.toLine,
    source: mathSourceFromHint(doc, block),
  }));
}

function tableBlocksFromHints(hintRanges) {
  return hintRangesByKind(hintRanges, "table").map((block) => ({
    fromLine: block.fromLine,
    toLine: block.toLine,
  }));
}

function frontMatterContainsLine(block, lineNumber) {
  return block && lineNumber >= block.fromLine && lineNumber <= block.toLine;
}

function inlineClassForType(type) {
  switch (type) {
    case "strong":
      return "cm-hybrid-strong";
    case "emphasis":
      return "cm-hybrid-emphasis";
    case "strikethrough":
      return "cm-hybrid-strikethrough";
    case "inline_code":
      return "cm-hybrid-inline-code";
    case "link":
      return "cm-hybrid-link";
    default:
      return "";
  }
}

class FootnoteReferenceWidget extends WidgetType {
  constructor(label) {
    super();
    this.label = label;
  }

  eq(other) {
    return other instanceof FootnoteReferenceWidget && other.label === this.label;
  }

  toDOM() {
    const sup = document.createElement("sup");
    sup.className = "cm-hybrid-footnote-ref";
    sup.textContent = this.label;
    return sup;
  }

  ignoreEvent() {
    return false;
  }
}

function inlineDecorationsEnabled(tier) {
  return (
    hybridDecorationLevel("emphasis", tier) === "full" ||
    hybridDecorationLevel("link", tier) === "full"
  );
}

function addAtomicReplacement(decorations, atomicRanges, from, to, spec = {}) {
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to <= from) return;

  decorations.push(Decoration.replace(spec).range(from, to));
  atomicRanges?.push(Decoration.replace({}).range(from, to));
}

function addInlineDecorations(decorations, atomicRanges, line, selectionRanges = []) {
  for (const span of parseMarkdownInlineSpans(line.text)) {
    const contentFrom = line.from + span.openTo;
    const contentTo = line.from + span.closeFrom;
    if (span.type === "footnote_ref") {
      if (
        collapsedSelectionTouchesTextRange(selectionRanges, {
          from: line.from + span.from,
          to: line.from + span.to,
        })
      ) {
        continue;
      }
      addAtomicReplacement(
        decorations,
        atomicRanges,
        line.from + span.from,
        line.from + span.to,
        {
          widget: new FootnoteReferenceWidget(span.label),
        },
      );
      continue;
    }

    if (span.type === "inline_math") {
      if (
        collapsedSelectionTouchesTextRange(selectionRanges, {
          from: line.from + span.from,
          to: line.from + span.to,
        })
      ) {
        continue;
      }
      addAtomicReplacement(
        decorations,
        atomicRanges,
        line.from + span.from,
        line.from + span.to,
        {
          widget: new InlineMathWidget(line.text.slice(span.openTo, span.closeFrom)),
        },
      );
      continue;
    }

    let className = inlineClassForType(span.type);
    if (!className) continue;
    if (
      span.type === "inline_code" &&
      selectionOverlapsTextRange(selectionRanges, {
        from: contentFrom,
        to: contentTo,
      })
    ) {
      className = `${className} cm-hybrid-inline-code-selected`;
    }

    addAtomicReplacement(decorations, atomicRanges, line.from + span.from, contentFrom);
    decorations.push(Decoration.mark({ class: className }).range(contentFrom, contentTo));
    addAtomicReplacement(decorations, atomicRanges, contentTo, line.from + span.to);
  }
}

class TaskCheckboxWidget extends WidgetType {
  constructor(checked, checkPosition) {
    super();
    this.checked = checked;
    this.checkPosition = checkPosition;
  }

  eq(other) {
    return (
      other instanceof TaskCheckboxWidget &&
      other.checked === this.checked &&
      other.checkPosition === this.checkPosition
    );
  }

  toDOM(view) {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-hybrid-task-checkbox";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = this.checked;
    checkbox.setAttribute("aria-label", this.checked ? "Mark task incomplete" : "Mark task complete");
    checkbox.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
    checkbox.addEventListener("click", (event) => {
      event.preventDefault();
      const change = markdownTaskCheckboxToggleChange(
        view.state.doc.toString(),
        this.checkPosition,
      );
      if (!change) return;
      view.dispatch({
        changes: change.changes,
        selection: change.selection,
      });
      view.focus();
    });
    wrapper.appendChild(checkbox);

    return wrapper;
  }

  ignoreEvent() {
    return false;
  }
}

function addTaskDecorations(decorations, atomicRanges, line) {
  const task = parseMarkdownTaskLine(line.text);
  if (!task) return false;

  const taskMarkerStart = line.text.slice(0, task.markerLength).search(/\[[ xX]\]/);
  if (taskMarkerStart < 0) return false;

  addAtomicReplacement(
    decorations,
    atomicRanges,
    line.from,
    line.from + task.markerLength,
    {
      widget: new TaskCheckboxWidget(
        task.checked,
        line.from + taskMarkerStart + 1,
      ),
    },
  );
  return true;
}

class ListMarkerWidget extends WidgetType {
  constructor(marker, contentPosition) {
    super();
    this.marker = marker;
    this.contentPosition = contentPosition;
  }

  eq(other) {
    return (
      other instanceof ListMarkerWidget &&
      other.marker === this.marker &&
      other.contentPosition === this.contentPosition
    );
  }

  contentAnchor(view) {
    if (
      !Number.isSafeInteger(this.contentPosition) ||
      this.contentPosition < 0 ||
      this.contentPosition > view.state.doc.length
    ) {
      return 0;
    }

    const line = view.state.doc.lineAt(this.contentPosition);
    const relativeContentPosition = this.contentPosition - line.from;
    const leadingInline = parseMarkdownInlineSpans(line.text).find((span) =>
      span.from === relativeContentPosition,
    );

    if (leadingInline && Number.isSafeInteger(leadingInline.openTo)) {
      return line.from + leadingInline.openTo;
    }
    return this.contentPosition;
  }

  toDOM(view) {
    const marker = document.createElement("span");
    marker.className = "cm-hybrid-list-marker";
    marker.textContent = this.marker;
    const focusContent = (event) => {
      event.preventDefault();
      view.dispatch({ selection: { anchor: this.contentAnchor(view) } });
      view.focus();
    };
    marker.addEventListener("mousedown", (event) => event.preventDefault());
    marker.addEventListener("click", focusContent);
    return marker;
  }

  ignoreEvent() {
    return true;
  }
}

function addListDecorations(decorations, atomicRanges, line) {
  const list = parseMarkdownListLine(line.text);
  if (!list) return false;

  addAtomicReplacement(
    decorations,
    atomicRanges,
    line.from + list.indentLength,
    line.from + list.markerLength,
    {
      widget: new ListMarkerWidget(
        list.ordered ? list.marker : "•",
        line.from + list.markerLength,
      ),
    },
  );
  return true;
}

class HorizontalRuleWidget extends WidgetType {
  eq(other) {
    return other instanceof HorizontalRuleWidget;
  }

  toDOM() {
    const rule = document.createElement("span");
    rule.className = "cm-hybrid-horizontal-rule";
    return rule;
  }
}

function addHorizontalRuleDecorations(decorations, atomicRanges, line) {
  if (!parseMarkdownHorizontalRuleLine(line.text)) return false;

  addAtomicReplacement(
    decorations,
    atomicRanges,
    line.from,
    line.to,
    {
      widget: new HorizontalRuleWidget(),
    },
  );
  return true;
}

function addBlockquoteDecorations(decorations, atomicRanges, line) {
  const blockquote = parseMarkdownBlockquoteLine(line.text);
  if (!blockquote) return false;

  decorations.push(
    Decoration.line({
      class: "cm-hybrid-blockquote-line",
    }).range(line.from),
  );
  addAtomicReplacement(decorations, atomicRanges, line.from, line.from + blockquote.markerLength);
  return true;
}

class FootnoteDefinitionLabelWidget extends WidgetType {
  constructor(label) {
    super();
    this.label = label;
  }

  eq(other) {
    return other instanceof FootnoteDefinitionLabelWidget && other.label === this.label;
  }

  toDOM() {
    const label = document.createElement("span");
    label.className = "cm-hybrid-footnote-label";
    label.textContent = `${this.label}.`;
    return label;
  }
}

function addFootnoteDefinitionDecorations(decorations, atomicRanges, line) {
  const footnote = parseMarkdownFootnoteDefinitionLine(line.text);
  if (!footnote) return false;

  decorations.push(
    Decoration.line({
      class: "cm-hybrid-footnote-line",
    }).range(line.from),
  );
  addAtomicReplacement(
    decorations,
    atomicRanges,
    line.from,
    line.from + footnote.markerLength,
    {
      widget: new FootnoteDefinitionLabelWidget(footnote.label),
    },
  );
  return true;
}

class CodeFenceWidget extends WidgetType {
  constructor(info, infoRange) {
    super();
    this.info = info;
    this.infoRange = infoRange;
  }

  eq(other) {
    return (
      other instanceof CodeFenceWidget &&
      other.info === this.info &&
      other.infoRange?.from === this.infoRange?.from &&
      other.infoRange?.to === this.infoRange?.to
    );
  }

  toDOM() {
    const label = document.createElement("span");
    label.className = "cm-hybrid-code-info";
    label.textContent = this.info || "code";
    label.setAttribute("aria-hidden", "true");
    label.addEventListener("mousedown", (event) => event.preventDefault());
    return label;
  }

  ignoreEvent() {
    return true;
  }
}

function addCodeBlockDecorations(decorations, atomicRanges, line, block, tier) {
  const level = hybridDecorationLevel("code", tier);
  if (level === "source") return;

  const isStart = line.number === block.fromLine;
  const isClosingFence = Boolean(block.hasClosingFence && line.number === block.toLine);
  const isContentEnd = Boolean(
    block.hasClosingFence
      ? line.number === block.toLine - 1
      : line.number === block.toLine,
  );
  const classes = [
    "cm-hybrid-code-block-line",
    isStart ? "cm-hybrid-code-block-start" : "",
    isContentEnd ? "cm-hybrid-code-block-end" : "",
    isClosingFence ? "cm-hybrid-code-block-fence-end" : "",
  ].filter(Boolean).join(" ");

  decorations.push(Decoration.line({ class: classes }).range(line.from));
  if (level === "full" && isStart) {
    const infoRange = markdownCodeFenceInfoRange(line.text, line.from);
    addAtomicReplacement(
      decorations,
      atomicRanges,
      line.from,
      line.to,
      {
        widget: new CodeFenceWidget(isStart ? block.info : "", infoRange),
      },
    );
  } else if (level === "full" && isClosingFence) {
    addAtomicReplacement(decorations, atomicRanges, line.from, line.to);
  }
}

function addFrontMatterDecorations(decorations, atomicRanges, line, block) {
  const isStart = line.number === block.fromLine;
  const isEnd = line.number === block.toLine;
  const classes = [
    "cm-hybrid-front-matter-line",
    isStart ? "cm-hybrid-front-matter-start" : "",
    isEnd ? "cm-hybrid-front-matter-end" : "",
  ].filter(Boolean).join(" ");

  decorations.push(Decoration.line({ class: classes }).range(line.from));
  if (isStart || isEnd) {
    addAtomicReplacement(decorations, atomicRanges, line.from, line.to);
  }
}

function addTableDecorations(decorations, line, block) {
  const isHeader = line.number === block.fromLine;
  const isSeparator = line.number === block.fromLine + 1;
  const isEnd = line.number === block.toLine;
  const classes = [
    "cm-hybrid-table-line",
    isHeader ? "cm-hybrid-table-header" : "",
    isSeparator ? "cm-hybrid-table-separator" : "",
    isEnd ? "cm-hybrid-table-end" : "",
  ].filter(Boolean).join(" ");

  decorations.push(Decoration.line({ class: classes }).range(line.from));
}

function deriveHybridBlockContext(state) {
  const hints = state.field(blockHintsField, false);
  const allowFullDocumentScan = shouldUseFullDocumentHybridScan(state.doc.length);
  if (sourceOnlyBlockHints(hints)) {
    return {
      hintRanges: [],
      usesBlockHints: true,
      codeBlocks: [],
      mermaidBlocks: [],
      frontMatterBlock: null,
      mathBlocks: [],
      tableBlocks: [],
    };
  }

  const hintRanges = blockHintRanges(hints);
  const usesBlockHints = hintRanges.length > 0;
  if (!usesBlockHints && !allowFullDocumentScan) {
    return {
      hintRanges: [],
      usesBlockHints: true,
      codeBlocks: [],
      mermaidBlocks: [],
      frontMatterBlock: null,
      mathBlocks: [],
      tableBlocks: [],
    };
  }

  const lines = allowFullDocumentScan || !usesBlockHints
    ? documentLineTexts(state.doc)
    : null;
  const scannedCodeBlocks = lines ? collectMarkdownCodeBlocks(lines) : [];

  return {
    hintRanges,
    usesBlockHints,
    codeBlocks: usesBlockHints
      ? codeBlocksFromHints(hintRanges, state.doc)
      : codeBlocksWithoutMermaid(scannedCodeBlocks, state.doc),
    mermaidBlocks: usesBlockHints
      ? mermaidBlocksFromHints(hintRanges, state.doc)
      : mermaidBlocksFromScannedCodeBlocks(scannedCodeBlocks, lines),
    frontMatterBlock: lines ? collectMarkdownFrontMatterBlock(lines) : null,
    mathBlocks: usesBlockHints
      ? mathBlocksFromHints(hintRanges, state.doc)
      : collectMarkdownMathBlocks(lines),
    tableBlocks: usesBlockHints
      ? tableBlocksFromHints(hintRanges)
      : collectMarkdownTableBlocks(lines),
  };
}

function headingDecorationFromHint(blockHint, lineText) {
  if (blockHint?.kind?.type !== "heading") return null;

  const heading = parseMarkdownHeadingLine(lineText);
  if (!heading) return null;

  return {
    ...heading,
    level: blockHint.kind.level ?? heading.level,
  };
}

function headingDecorationForLine(context, line) {
  const hint = rangeBlockForLine(context.hintRanges, line.number);
  if (context.usesBlockHints) {
    return headingDecorationFromHint(hint, line.text);
  }

  return parseMarkdownHeadingLine(line.text);
}

function addHeadingDecorations(decorations, atomicRanges, line, heading, tier, selectionRanges) {
  const markerTo = line.from + heading.markerLength;
  const level = hybridHeadingDecorationLevel(
    tier,
    { from: line.from, to: markerTo },
    selectionRanges,
  );
  if (level === "source") return false;

  decorations.push(
    Decoration.line({
      class: `cm-hybrid-heading-line cm-hybrid-heading-line-${heading.level}`,
    }).range(line.from),
  );

  if (level !== "full") {
    return true;
  }

  addAtomicReplacement(decorations, atomicRanges, line.from, markerTo);
  decorations.push(
    Decoration.mark({
      class: `cm-hybrid-heading cm-hybrid-heading-${heading.level}`,
    }).range(markerTo, line.to),
  );
  return true;
}

function buildHybridMarkdownDecorations(
  view,
  context,
) {
  if (view.state.field(viewModeField, false) !== "hybrid") {
    return {
      decorations: Decoration.none,
      atomicRanges: Decoration.none,
    };
  }
  if (viewIsComposing(view)) {
    return {
      decorations: Decoration.none,
      atomicRanges: Decoration.none,
    };
  }

  const decorations = [];
  const atomicRanges = [];
  let lastLineNumber = -1;

  for (const range of view.visibleRanges) {
    for (let pos = range.from; pos <= range.to;) {
      const line = view.state.doc.lineAt(pos);
      pos = line.to + 1;

      if (line.number === lastLineNumber) continue;
      lastLineNumber = line.number;

      if (frontMatterContainsLine(context.frontMatterBlock, line.number)) {
        const tier = decorationTierForRange(
          view.state,
          context.frontMatterBlock.fromLine,
          context.frontMatterBlock.toLine,
        );
        if (tier === "near") {
          addFrontMatterDecorations(decorations, atomicRanges, line, context.frontMatterBlock);
        }
        continue;
      }

      const mermaidBlock = rangeBlockForLine(context.mermaidBlocks, line.number);
      if (mermaidBlock) {
        continue;
      }

      const codeBlock = rangeBlockForLine(context.codeBlocks, line.number);
      if (codeBlock) {
        const tier = decorationTierForRange(
          view.state,
          codeBlock.fromLine,
          codeBlock.toLine,
        );
        addCodeBlockDecorations(decorations, atomicRanges, line, codeBlock, tier);
        continue;
      }

      const mathBlock = rangeBlockForLine(context.mathBlocks, line.number);
      if (mathBlock) {
        continue;
      }

      const tableBlock = rangeBlockForLine(context.tableBlocks, line.number);
      if (tableBlock) {
        const tier = decorationTierForRange(
          view.state,
          tableBlock.fromLine,
          tableBlock.toLine,
        );
        const tableLevel = hybridDecorationLevel("table", tier);
        if (
          tableLevel === "full" &&
          tableWidgetData(
            view.state,
            tableBlock,
            HYBRID_TABLE_WIDGET_MAX_BYTES,
            HYBRID_TABLE_WIDGET_MAX_CELLS,
          )
        ) {
          continue;
        }
        if (tableLevel !== "source") {
          addTableDecorations(decorations, line, tableBlock);
        }
        continue;
      }

      const tier = decorationTierForLine(view.state, line);
      const selectionRanges = view.state.selection.ranges;
      const heading = headingDecorationForLine(context, line);
      if (heading) {
        const headingDecorated = addHeadingDecorations(
          decorations,
          atomicRanges,
          line,
          heading,
          tier,
          selectionRanges,
        );
        if (headingDecorated && inlineDecorationsEnabled(tier)) {
          addInlineDecorations(decorations, atomicRanges, line, selectionRanges);
        }
        continue;
      }

      if (!heading) {
        if (tier === "current") {
          if (hybridDecorationLevel("quote", tier) === "full") {
            addBlockquoteDecorations(decorations, atomicRanges, line);
          }
          if (hybridDecorationLevel("task", tier) === "widget") {
            addTaskDecorations(decorations, atomicRanges, line);
          }
          if (hybridDecorationLevel("list", tier) === "full") {
            addListDecorations(decorations, atomicRanges, line);
          }
          if (inlineDecorationsEnabled(tier)) {
            addInlineDecorations(decorations, atomicRanges, line, selectionRanges);
          }
          continue;
        }
        if (hybridDecorationLevel("rule", tier) === "full") {
          if (addHorizontalRuleDecorations(decorations, atomicRanges, line)) continue;
        }
        if (hybridDecorationLevel("footnote", tier) === "full") {
          if (addFootnoteDefinitionDecorations(decorations, atomicRanges, line)) continue;
        }
        if (hybridDecorationLevel("quote", tier) === "full") {
          addBlockquoteDecorations(decorations, atomicRanges, line);
        }
        if (hybridDecorationLevel("task", tier) === "widget") {
          addTaskDecorations(decorations, atomicRanges, line);
        }
        if (hybridDecorationLevel("list", tier) === "full") {
          addListDecorations(decorations, atomicRanges, line);
        }
        if (hybridDecorationLevel("image", tier) === "widget") {
          addImageDecorations(decorations, line);
        }
        if (inlineDecorationsEnabled(tier)) {
          addInlineDecorations(decorations, atomicRanges, line, selectionRanges);
        }
        continue;
      }
    }
  }

  return {
    decorations: Decoration.set(decorations, true),
    atomicRanges: Decoration.set(atomicRanges, true),
  };
}

function buildHybridBlockWidgetDecorations(state) {
  if (state.field(viewModeField, false) !== "hybrid") {
    return Decoration.none;
  }

  const context = deriveHybridBlockContext(state);
  const blocks = [
    ...context.mermaidBlocks.map((block) => ({ ...block, widgetKind: "mermaid" })),
    ...context.mathBlocks.map((block) => ({ ...block, widgetKind: "math" })),
    ...context.tableBlocks.map((block) => ({ ...block, widgetKind: "table" })),
  ].sort((left, right) => left.fromLine - right.fromLine);
  if (blocks.length === 0) return Decoration.none;

  const decorations = [];
  for (const block of blocks) {
    const tier = decorationTierForRange(state, block.fromLine, block.toLine);
    if (hybridDecorationLevel(block.widgetKind, tier) !== "full") continue;

    if (block.widgetKind === "mermaid") {
      addMermaidBlockDecorations(decorations, state, block, tier === "current");
    } else if (block.widgetKind === "math") {
      addMathBlockDecorations(decorations, state, block);
    } else if (
      tableWidgetData(
        state,
        block,
        HYBRID_TABLE_WIDGET_MAX_BYTES,
        HYBRID_TABLE_WIDGET_MAX_CELLS,
      )
    ) {
      addTableWidgetDecorations(
        decorations,
        state,
        block,
        HYBRID_TABLE_WIDGET_MAX_BYTES,
        HYBRID_TABLE_WIDGET_MAX_CELLS,
      );
    }
  }

  return decorations.length > 0
    ? Decoration.set(decorations, true)
    : Decoration.none;
}

function blockWidgetTransactionChanged(transaction) {
  return (
    transaction.docChanged ||
    Boolean(transaction.selection) ||
    transaction.effects.some((effect) =>
      effect.is(setViewModeEffect) || effect.is(setBlockHintsEffect)
    )
  );
}

const hybridBlockWidgetField = StateField.define({
  create(state) {
    return buildHybridBlockWidgetDecorations(state);
  },
  update(decorations, transaction) {
    return blockWidgetTransactionChanged(transaction)
      ? buildHybridBlockWidgetDecorations(transaction.state)
      : decorations;
  },
  provide(field) {
    return EditorView.decorations.from(field);
  },
});

function viewModeChanged(update) {
  return update.transactions.some((transaction) =>
    transaction.effects.some((effect) => effect.is(setViewModeEffect)),
  );
}

function blockHintsChanged(update) {
  return update.transactions.some((transaction) =>
    transaction.effects.some((effect) => effect.is(setBlockHintsEffect)),
  );
}

const hybridHeadingPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.blockContext = deriveHybridBlockContext(view.state);
      this.composing = viewIsComposing(view);
      const decorated = buildHybridMarkdownDecorations(
        view,
        this.blockContext,
      );
      this.decorations = decorated.decorations;
      this.atomicRanges = decorated.atomicRanges;
    }

    update(update) {
      const hintsChanged = blockHintsChanged(update);
      const nextComposing = viewIsComposing(update.view);
      const composingChanged = nextComposing !== this.composing;
      this.composing = nextComposing;

      if (update.docChanged || hintsChanged) {
        this.blockContext = deriveHybridBlockContext(update.state);
      }
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        viewModeChanged(update) ||
        composingChanged ||
        hintsChanged
      ) {
        const decorated = buildHybridMarkdownDecorations(
          update.view,
          this.blockContext,
        );
        this.decorations = decorated.decorations;
        this.atomicRanges = decorated.atomicRanges;
        if (
          update.docChanged ||
          update.viewportChanged ||
          viewModeChanged(update) ||
          composingChanged ||
          hintsChanged
        ) {
          update.view.requestMeasure();
        }
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) =>
        view.plugin(plugin)?.atomicRanges ?? Decoration.none,
      ),
  },
);

function syncCompositionClass(view, active = viewIsComposing(view)) {
  view.dom.classList.toggle(EDITOR_COMPOSITION_CLASS, active);
}

const compositionClassPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.view = view;
      this.active = viewIsComposing(view);
      syncCompositionClass(view, this.active);
    }

    update(update) {
      const next = viewIsComposing(update.view);
      if (next === this.active) return;
      this.active = next;
      syncCompositionClass(update.view, next);
    }

    destroy() {
      this.view.dom.classList.remove(EDITOR_COMPOSITION_CLASS);
    }
  },
);

/* Extensions read the current tab id from `view.dom.dataset.tabId` instead of
 * closure-capturing it. That lets a single view be recycled across tabs
 * without rebuilding all its extensions — the hot path for pool reuse. */
function shouldUseRelaxedPointerHit(event, view) {
  if (event.button !== 0 || event.detail !== 1) return false;
  const target = event.target;
  if (!(target instanceof Element)) return false;
  if (!view.contentDOM.contains(target)) return false;
  if (target.closest("input, textarea, button, select")) return false;
  if (target.closest(".cm-hybrid-mermaid-source-editor, .cm-hybrid-table-widget")) return false;
  return true;
}

function pointerCoordsAdjustment(view, event) {
  const coords = { x: event.clientX, y: event.clientY };
  const rawPos = view.posAtCoords(coords, false);
  if (!Number.isSafeInteger(rawPos) || rawPos <= 0) return null;

  const rawLine = view.state.doc.lineAt(rawPos);
  if (rawLine.number <= 1) return null;

  const lineStart = view.coordsAtPos(rawLine.from, 1);
  if (!lineStart) return null;

  const topLeadingSlack = Math.min(
    5,
    Math.max(2, view.defaultLineHeight * 0.14),
  );
  if (event.clientY >= lineStart.top + topLeadingSlack) return null;

  const rawBlock = view.lineBlockAt(rawLine.from);
  const previousBlock = view.lineBlockAtHeight(Math.max(0, rawBlock.top - 1));
  if (!previousBlock || previousBlock.to > rawBlock.from) return null;

  const previousBottom = view.documentTop + previousBlock.bottom;
  return {
    x: event.clientX,
    y: Math.min(previousBottom - 1, event.clientY - topLeadingSlack),
  };
}

function pointerPositionAt(view, coords) {
  if (typeof view.posAndSideAtCoords === "function") {
    return view.posAndSideAtCoords(coords, false);
  }

  const pos = view.posAtCoords(coords, false);
  return {
    pos: Number.isSafeInteger(pos) ? pos : view.state.selection.main.head,
    assoc: 0,
  };
}

function rawPointerPosition(view, event) {
  return pointerPositionAt(view, {
    x: event.clientX,
    y: event.clientY,
  });
}

function pointerPosition(view, event) {
  return pointerPositionAt(
    view,
    pointerCoordsAdjustment(view, event) ?? {
      x: event.clientX,
      y: event.clientY,
    },
  );
}

function pointerMovedFrom(startEvent, event) {
  return (
    Math.max(
      Math.abs(event.clientX - startEvent.clientX),
      Math.abs(event.clientY - startEvent.clientY),
    ) >= 10
  );
}

function relaxedPointerSelectionStyle(view, event) {
  if (!shouldUseRelaxedPointerHit(event, view)) return null;
  if (!pointerCoordsAdjustment(view, event)) return null;

  const startEvent = event;
  let adjustedStart = pointerPosition(view, event);
  let rawStart = rawPointerPosition(view, event);
  let startSelection = view.state.selection;
  return {
    update(update) {
      if (!update.docChanged) return;
      adjustedStart = {
        ...adjustedStart,
        pos: update.changes.mapPos(adjustedStart.pos),
      };
      rawStart = {
        ...rawStart,
        pos: update.changes.mapPos(rawStart.pos),
      };
      startSelection = startSelection.map(update.changes);
    },
    get(event, extend, multiple) {
      const useAdjustedClick = !pointerMovedFrom(startEvent, event);
      const start = useAdjustedClick ? adjustedStart : rawStart;
      const current = useAdjustedClick
        ? pointerPosition(view, event)
        : rawPointerPosition(view, event);
      const range = start.pos === current.pos
        ? EditorSelection.cursor(current.pos, current.assoc)
        : EditorSelection.range(start.pos, current.pos, current.assoc);

      if (extend) {
        return startSelection.replaceRange(
          startSelection.main.extend(range.from, range.to, range.assoc),
        );
      }
      if (multiple) return startSelection.addRange(range);
      return EditorSelection.create([range]);
    },
  };
}

function runFormatShortcut(kind) {
  return (view) => applyFormatToView(view, kind);
}

function buildExtensions() {
  const routedSaveKeymap = keymap.of([
    {
      key: "Mod-s",
      run: (view) => requestSaveForView(editorRegistry, view),
    },
    { key: "Mod-b", run: runFormatShortcut("bold") },
    { key: "Mod-i", run: runFormatShortcut("italic") },
    { key: "Mod-k", run: runFormatShortcut("link") },
    { key: "Mod-Shift-i", run: runFormatShortcut("image") },
    { key: "Mod-e", run: runFormatShortcut("inline_code") },
    { key: "Mod-Alt-c", run: runFormatShortcut("code_block") },
    { key: "Mod-h", run: (view) => openReplacePanelInView(view, openSearchPanel) },
    { key: "Enter", run: continueMarkdownListOnEnter },
    { key: "Backspace", run: handleMarkdownBackspace },
    { key: "Space", run: completeMarkdownShortcutOnSpace },
    { key: "Tab", run: (view) => indentMarkdownListInView(view, "indent") },
    { key: "Shift-Tab", run: (view) => indentMarkdownListInView(view, "outdent") },
  ]);

  return [
    viewModeField,
    blockHintsField,
    hybridBlockWidgetField,
    EditorView.mouseSelectionStyle.of(relaxedPointerSelectionStyle),
    lineNumbers(),
    drawSelection(),
    highlightActiveLine(),
    history(),
    markdown({ codeLanguages: languages }),
    syntaxHighlighting(markdownHighlightStyle, { fallback: true }),
    search({ top: true }),
    highlightSelectionMatches({ highlightWordAroundCursor: true }),
    EditorView.domEventHandlers({
      paste(event, view) {
        const tabId = view.dom.dataset.tabId;
        if (!tabId) return false;
        const entry = editorRegistry.get(tabId);
        if (!entry) return false;

        const image = imageFileFromTransfer(event.clipboardData);
        if (image && entry.dioxus) {
          event.preventDefault();
          sendEditorImage(tabId, image).catch((error) => {
            console.warn("Failed to send pasted image", error);
          });
          return true;
        }

        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (!pastePlainTextInView(view, text, entry.preferences)) return false;

        event.preventDefault();
        return true;
      },
      drop(event, view) {
        const tabId = view.dom.dataset.tabId;
        if (!tabId) return false;
        const entry = editorRegistry.get(tabId);
        if (!entry?.dioxus) return false;

        const image = imageFileFromTransfer(event.dataTransfer);
        if (!image) return false;

        event.preventDefault();
        placeCursorAtDrop(view, event);
        sendEditorImage(tabId, image).catch((error) => {
          console.warn("Failed to send dropped image", error);
        });
        return true;
      },
    }),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    routedSaveKeymap,
    hybridHeadingPlugin,
    compositionClassPlugin,
    EditorView.lineWrapping,
    editorTheme,
    EditorView.updateListener.of((update) => {
      const tabId = update.view.dom.dataset.tabId;
      if (!tabId) return; // unrouted (in pool) — swallow
      const entry = editorRegistry.get(tabId);
      if (!entry || entry.suppressChange) return;
      if (update.selectionSet || update.docChanged || update.viewportChanged) {
        syncOutline(tabId, entry.viewMode);
      }
      if (!update.docChanged) return;
      entry.dioxus?.send({
        type: "content_changed",
        tab_id: tabId,
        content: update.state.doc.toString(),
        ...inputTraceContextForView(entry, update.state),
      });
    }),
  ];
}

/* ── Spare pool ────────────────────────────────────────────────────────────
 *
 * Creating an EditorView is the single most expensive operation in the open
 * path — building the syntax tree, wiring listeners, constructing the DOM.
 * We hide that cost behind a spare pool:
 *
 *   startup:        build one spare in a detached parent, during idle time.
 *   open tab:       adopt the spare (set content, move DOM) → instant.
 *                   queue next spare creation so the *next* open is also fast.
 *   close tab:      recycle the view back into the pool instead of destroying.
 *
 * The spare parent is visually hidden but stays in the layout tree so
 * CodeMirror's size caches stay valid — moving the DOM into a visible
 * container later doesn't trigger a re-measure storm.
 */
const spareParent = document.createElement("div");
spareParent.setAttribute("aria-hidden", "true");
spareParent.style.cssText =
  "position:absolute;left:-10000px;top:0;width:400px;height:400px;pointer-events:none;visibility:hidden;";

const spareViews = [];
let spareWarming = false;

function attachSpareParent() {
  if (!spareParent.isConnected && document.body) {
    document.body.appendChild(spareParent);
  }
}

function resetViewState(view, doc = "") {
  view.setState(EditorState.create({ doc, extensions: buildExtensions() }));
}

function warmSpare() {
  if (spareViews.length > 0 || spareWarming) return;
  attachSpareParent();
  if (!spareParent.isConnected) return;
  spareWarming = true;
  try {
    const state = EditorState.create({ doc: "", extensions: buildExtensions() });
    spareViews.push(new EditorView({ state, parent: spareParent }));
  } finally {
    spareWarming = false;
  }
}

function scheduleWarmSpare() {
  if (spareViews.length > 0 || spareWarming) return;
  // The script now loads synchronously via <script defer> in custom_head, so
  // we run well before the user can click anything. `queueMicrotask` yields
  // once to let the current task finish (letting Dioxus start its mount),
  // then warms immediately — not `requestIdleCallback`, whose 300ms timeout
  // risks firing AFTER the user's first click.
  queueMicrotask(() => warmSpare());
}

// Warm up as soon as the DOM can host the detached parent. With `defer` the
// script executes after HTML parse, so `document.body` exists and we take
// the else branch. The listener path stays as a safety net for non-defer
// loading paths (e.g. webview dev tools rewrites).
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", scheduleWarmSpare, { once: true });
} else {
  scheduleWarmSpare();
}

function refreshEditorLayout(view) {
  const measure = () => {
    if (!view.dom.isConnected) return;
    view.requestMeasure();
  };

  queueMicrotask(measure);
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(measure);
    requestAnimationFrame(() => requestAnimationFrame(measure));
  } else {
    setTimeout(measure, 0);
  }
  setTimeout(measure, 80);
}

function disconnectLayoutObserver(entry) {
  entry.layoutObserver?.disconnect();
  entry.layoutCancel?.();
  entry.layoutObserver = null;
  entry.layoutFrame = 0;
  entry.layoutCancel = null;
  entry.layoutSize = null;
}

function viewTabId(entry) {
  return entry?.view?.dom?.dataset?.tabId ?? "";
}

function editorScroller(entry) {
  return entry?.view?.scrollDOM ?? entry?.view?.dom?.querySelector?.(".cm-scroller") ?? null;
}

function saveEditorScrollSnapshot(entry, mode = entry?.viewMode) {
  if (!modeSupportsEditorScroll(mode)) return null;

  return saveModeScrollSnapshot(
    modeScrollSnapshots,
    viewTabId(entry),
    mode,
    readScrollSnapshot(editorScroller(entry)),
  );
}

function scheduleScrollRestore(scroller, snapshot, afterRestore = () => {}) {
  if (!scroller || !snapshot) return false;

  const restore = () => {
    restoreScrollSnapshot(scroller, snapshot);
    afterRestore();
  };

  queueMicrotask(restore);
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(restore);
  } else {
    setTimeout(restore, 0);
  }
  return true;
}

function restoreEditorScrollSnapshot(entry) {
  if (!modeSupportsEditorScroll(entry?.viewMode)) return false;

  return scheduleScrollRestore(
    editorScroller(entry),
    latestModeScrollSnapshot(modeScrollSnapshots, viewTabId(entry)),
  );
}

function editorTopLineNumber(entry, scroller = editorScroller(entry)) {
  const view = entry?.view;
  if (!view || !(scroller instanceof HTMLElement)) return null;
  if (typeof view.lineBlockAtHeight !== "function") return null;
  if (typeof view.state?.doc?.lineAt !== "function") return null;

  const top = Math.max(
    0,
    scroller.scrollTop + Math.min(24, Math.max(8, Number(view.defaultLineHeight ?? 0) * 0.75)),
  );
  const block = view.lineBlockAtHeight(top);
  if (!Number.isSafeInteger(block?.from)) return null;

  const line = view.state.doc.lineAt(block.from);
  return Number.isSafeInteger(line?.number) ? line.number : null;
}

function detachEditorScroll(entry) {
  const scroller = editorScroller(entry);
  if (!(scroller instanceof HTMLElement)) return false;

  const previous = editorScrollListeners.get(scroller);
  if (!previous) return false;

  scroller.removeEventListener("scroll", previous.onScroll);
  editorScrollListeners.delete(scroller);
  return true;
}

function attachEditorScroll(tabId, entry = editorRegistry.get(tabId)) {
  if (!modeSupportsEditorScroll(entry?.viewMode)) {
    detachEditorScroll(entry);
    return false;
  }

  const scroller = editorScroller(entry);
  if (!(scroller instanceof HTMLElement)) return false;

  const previous = editorScrollListeners.get(scroller);
  if (previous?.tabId === tabId) {
    scheduleScrollRestore(
      scroller,
      latestModeScrollSnapshot(modeScrollSnapshots, tabId),
      () => {
        saveModeScrollSnapshot(
          modeScrollSnapshots,
          tabId,
          entry.viewMode,
          readScrollSnapshot(scroller),
        );
        syncOutlineForEditorScroll(tabId, entry, scroller);
      },
    );
    return true;
  }
  if (previous) {
    scroller.removeEventListener("scroll", previous.onScroll);
  }

  const save = () => {
    saveModeScrollSnapshot(
      modeScrollSnapshots,
      tabId,
      entry.viewMode,
      readScrollSnapshot(scroller),
    );
    syncOutlineForEditorScroll(tabId, entry, scroller);
  };
  const onScroll = () => save();
  scroller.addEventListener("scroll", onScroll, { passive: true });
  editorScrollListeners.set(scroller, { tabId, onScroll });

  const snapshot = latestModeScrollSnapshot(modeScrollSnapshots, tabId);
  if (!scheduleScrollRestore(scroller, snapshot, save)) {
    save();
  }
  return true;
}

function attachPreviewScroll(tabId, scroller) {
  if (!(scroller instanceof HTMLElement)) return false;

  const previous = previewScrollListeners.get(scroller);
  if (previous?.tabId === tabId) {
    scheduleScrollRestore(
      scroller,
      latestModeScrollSnapshot(modeScrollSnapshots, tabId),
      () => {
        saveModeScrollSnapshot(
          modeScrollSnapshots,
          tabId,
          "preview",
          readScrollSnapshot(scroller),
        );
        syncOutlineForPreview(tabId, scroller);
      },
    );
    return true;
  }
  if (previous) {
    scroller.removeEventListener("scroll", previous.onScroll);
  }

  const save = () => {
    saveModeScrollSnapshot(
      modeScrollSnapshots,
      tabId,
      "preview",
      readScrollSnapshot(scroller),
    );
    syncOutlineForPreview(tabId, scroller);
  };
  const onScroll = () => save();
  scroller.addEventListener("scroll", onScroll, { passive: true });
  previewScrollListeners.set(scroller, { tabId, onScroll });

  const snapshot = latestModeScrollSnapshot(modeScrollSnapshots, tabId);
  if (!scheduleScrollRestore(scroller, snapshot, save)) {
    save();
  }
  return true;
}

function previewScrollerForTab(tabId) {
  return Array.from(document.querySelectorAll(".mn-preview-scroll[data-tab-id]")).find(
    (element) => element.dataset.tabId === tabId,
  ) ?? null;
}

function outlineItemsForTab(tabId) {
  return Array.from(document.querySelectorAll(".mn-outline-item[data-tab-id]")).filter(
    (element) => element.dataset.tabId === tabId,
  );
}

function setActiveOutlineItem(tabId, headingIndex) {
  const activeIndex = Number.isSafeInteger(Number(headingIndex)) ? Number(headingIndex) : -1;

  outlineItemsForTab(tabId).forEach((element, index) => {
    const active = index === activeIndex;
    element.classList.toggle("active", active);
    if (active) {
      element.setAttribute("aria-current", "location");
    } else {
      element.removeAttribute("aria-current");
    }
  });
}

function outlineLineNumbersForTab(tabId) {
  return outlineItemsForTab(tabId).map((element) => Number(element.dataset.lineNumber ?? 0));
}

function editorActiveLineNumber(entry) {
  const head = entry?.view?.state?.selection?.main?.head;
  if (!Number.isSafeInteger(head)) return null;

  return entry.view.state.doc.lineAt(head).number;
}

function previewHeadingOffsets(scroller) {
  if (!(scroller instanceof HTMLElement)) return [];

  const scrollerTop = scroller.getBoundingClientRect().top;
  return Array.from(
    scroller.querySelectorAll(".mn-preview h1, .mn-preview h2, .mn-preview h3, .mn-preview h4, .mn-preview h5, .mn-preview h6"),
  ).map((heading) => {
    if (!(heading instanceof HTMLElement)) return null;
    return heading.getBoundingClientRect().top - scrollerTop + scroller.scrollTop;
  }).filter((offset) => Number.isFinite(offset));
}

function syncOutlineForEditor(tabId, entry = editorRegistry.get(tabId)) {
  const activeLine = editorActiveLineNumber(entry);
  if (activeLine === null) return false;

  setActiveOutlineItem(
    tabId,
    activeOutlineHeadingIndex(outlineLineNumbersForTab(tabId), activeLine),
  );
  return true;
}

function syncOutlineForEditorScroll(
  tabId,
  entry = editorRegistry.get(tabId),
  scroller = editorScroller(entry),
) {
  const activeLine = editorTopLineNumber(entry, scroller) ?? editorActiveLineNumber(entry);
  if (activeLine === null) return false;

  setActiveOutlineItem(
    tabId,
    activeOutlineHeadingIndex(outlineLineNumbersForTab(tabId), activeLine),
  );
  return true;
}

function syncOutlineForPreview(tabId, scroller = previewScrollerForTab(tabId)) {
  if (!(scroller instanceof HTMLElement)) return false;

  setActiveOutlineItem(
    tabId,
    activePreviewHeadingIndex(previewHeadingOffsets(scroller), scroller.scrollTop),
  );
  return true;
}

function syncOutline(tabId, mode) {
  const normalizedMode = normalizeViewMode(mode);
  if (normalizedMode === "preview") {
    return syncOutlineForPreview(tabId);
  }

  return syncOutlineForEditor(tabId);
}

function collapseOutlineOverlayIfNeeded() {
  const media = window.matchMedia?.(OUTLINE_MOBILE_MEDIA_QUERY);
  if (!media?.matches) return false;

  const toggle = document.querySelector(".mn-editor-outline-toggle");
  if (!(toggle instanceof HTMLElement)) return false;

  toggle.click();
  return true;
}

function navigateOutline(tabId, mode, lineNumber, headingIndex) {
  const normalizedMode = normalizeViewMode(mode);
  const navigated = normalizedMode === "preview"
    ? jumpPreviewToHeading(tabId, headingIndex)
    : jumpEditorToLine(tabId, lineNumber);

  setActiveOutlineItem(tabId, Number(headingIndex));
  syncOutline(tabId, normalizedMode);
  if (navigated) {
    collapseOutlineOverlayIfNeeded();
  }
  return navigated;
}

function jumpEditorToLine(tabId, lineNumber) {
  const entry = editorRegistry.get(tabId);
  if (!entry?.view) return false;

  const jumped = scrollEditorViewToLine(entry.view, lineNumber, {
    scrollEffect: (position) => EditorView.scrollIntoView(position, { y: "start" }),
  });
  if (jumped) {
    refreshEditorLayout(entry.view);
  }
  return jumped;
}

function jumpPreviewToHeading(tabId, headingIndex) {
  return scrollPreviewToHeading(previewScrollerForTab(tabId), headingIndex, {
    behavior: "auto",
  });
}

function attachLayoutObserver(tabId, container, dioxus) {
  const entry = editorRegistry.get(tabId);
  if (!entry || !("ResizeObserver" in window)) return;

  disconnectLayoutObserver(entry);
  entry.onRecycle = () => disconnectLayoutObserver(entry);

  const sendSizeChange = (rect) => {
    const nextSize = nextLayoutSize(entry.layoutSize, rect);
    if (!nextSize) {
      const width = Number(rect?.width ?? 0);
      const height = Number(rect?.height ?? 0);
      if (width <= 0 || height <= 0) {
        entry.layoutSize = null;
      }
      return;
    }

    entry.layoutSize = nextSize;
    refreshEditorLayout(entry.view);
  };

  const measure = () => {
    entry.layoutFrame = 0;
    entry.layoutCancel = null;
    if (!container.isConnected || !isVisibleElement(container)) {
      entry.layoutSize = null;
      return;
    }
    sendSizeChange(container.getBoundingClientRect());
  };

  const scheduleMeasure = () => {
    if (entry.layoutFrame) return;

    if (typeof requestAnimationFrame === "function") {
      const frame = requestAnimationFrame(measure);
      entry.layoutFrame = frame;
      entry.layoutCancel = () => cancelAnimationFrame(frame);
    } else {
      const timer = setTimeout(measure, 0);
      entry.layoutFrame = timer;
      entry.layoutCancel = () => clearTimeout(timer);
    }
  };

  entry.layoutObserver = new ResizeObserver(scheduleMeasure);
  entry.layoutObserver.observe(container);
  scheduleMeasure();
}

function setEditorViewMode(entry, mode) {
  const previousMode = entry.viewMode;
  saveEditorScrollSnapshot(entry, previousMode);

  const normalized = setViewModeCore(entry, mode);
  entry.view?.dispatch({
    effects: setViewModeEffect.of(normalized),
  });
  restoreEditorScrollSnapshot(entry);
  attachEditorScroll(viewTabId(entry), entry);
  syncOutline(viewTabId(entry), normalized);
  return normalized;
}

function setRuntimePreferences(entry, preferences) {
  return setEditorPreferencesCore(entry, preferences);
}

function setRuntimeBlockHints(entry, hints) {
  const currentHints = entry.blockHints;
  const nextHints = setBlockHintsCore(entry, hints);
  if (!nextHints) return null;
  if (blockHintsEqual(currentHints, nextHints)) return nextHints;

  entry.view?.dispatch({
    effects: setBlockHintsEffect.of(nextHints),
  });
  return nextHints;
}

function attachViewToTab(view, tabId, container, instanceId, initialContent, viewMode) {
  attachViewToTabCore({
    editorRegistry,
    view,
    tabId,
    container,
    instanceId,
    initialContent,
    viewMode,
    refreshEditorLayout,
    setEditorPreferences: setRuntimePreferences,
    setViewMode: setEditorViewMode,
  });
}

function ensureEditor({ tabId, containerId, instanceId = "", initialContent, viewMode }) {
  const container = document.getElementById(containerId);
  if (!container) throw new Error(`Editor container not found: ${containerId}`);

  const existing = editorRegistry.get(tabId);
  if (existing) {
    // Re-attach in case the DOM got detached across re-renders.
    if (existing.view.dom.parentElement !== container) {
      container.replaceChildren(existing.view.dom);
    }
    existing.view.dom.dataset.tabId = tabId;
    existing.instanceId = instanceId;
    handleRustMessageCore(editorRegistry, tabId, {
      type: "set_view_mode",
      mode: viewMode ?? existing.viewMode ?? "hybrid",
    }, { refreshEditorLayout, setViewMode: setEditorViewMode });
    return existing.view;
  }

  let view;
  if (spareViews.length > 0) {
    view = spareViews.pop();
    resetViewState(view, initialContent ?? "");
    attachViewToTab(view, tabId, container, instanceId, initialContent, viewMode);
    // Warm the next spare so a subsequent open is also instant.
    scheduleWarmSpare();
  } else {
    // Pool miss — fall back to a fresh view. Happens only on the very first
    // open if the warm-up hasn't finished yet, or under rapid-fire opens.
    const state = EditorState.create({
      doc: initialContent ?? "",
      extensions: buildExtensions(),
    });
    view = new EditorView({ state, parent: container });
    view.dom.dataset.tabId = tabId;
    const entry = {
      view,
      instanceId,
      dioxus: null,
      suppressChange: false,
      viewMode: "hybrid",
      preferences: normalizeEditorPreferences(),
      blockHints: null,
    };
    editorRegistry.set(tabId, entry);
    handleRustMessageCore(editorRegistry, tabId, {
      type: "set_view_mode",
      mode: viewMode ?? "hybrid",
    }, { refreshEditorLayout, setViewMode: setEditorViewMode });
    scheduleWarmSpare();
  }

  return view;
}

function releaseEditor(tabId) {
  return recycleEditor(tabId);
  const entry = editorRegistry.get(tabId);
  if (!entry) return;
  editorRegistry.delete(tabId);
  const { view } = entry;
  delete view.dom.dataset.tabId;

  if (false) {
    // Keep the released view as-is. Resetting CodeMirror here would create a
    // delayed main-thread stall after tab close; the spare is reset only when
    // it is adopted for a new tab.
    attachSpareParent();
    if (view.dom.parentElement !== spareParent) {
      spareParent.appendChild(view.dom);
    }
    spareViews.push(view);
  } else {
    // Pool already full — really destroy.
    spareViews.push(view);
  }
}

function recycleEditor(tabId) {
  const entry = editorRegistry.get(tabId);
  if (entry) {
    saveEditorScrollSnapshot(entry);
    detachEditorScroll(entry);
    disconnectLayoutObserver(entry);
  }
  recycleEditorCore(editorRegistry, tabId);
}

window.papyroEditor = {
  ensureEditor,

  handleRustMessage(tabId, message) {
    return handleRustMessageCore(editorRegistry, tabId, message, {
      applyFormat: applyFormatToView,
      refreshEditorLayout,
      setEditorPreferences: setRuntimePreferences,
      setBlockHints: setRuntimeBlockHints,
      setViewMode: setEditorViewMode,
    });
  },

  attachChannel(tabId, dioxus) {
    const entry = editorRegistry.get(tabId);
    if (!entry) return;

    entry.dioxus = dioxus;
    attachEditorScroll(tabId, entry);
    syncOutline(tabId, entry.viewMode);
    const container = entry.view?.dom?.parentElement;
    if (container instanceof HTMLElement) {
      attachLayoutObserver(tabId, container, dioxus);
    }
  },

  attachPreviewScroll,
  navigateOutline,
  syncOutline,
  scrollEditorToLine: jumpEditorToLine,
  scrollPreviewToHeading: jumpPreviewToHeading,
  renderPreviewMermaid,
};
