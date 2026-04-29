import { EditorState, StateEffect, StateField } from "@codemirror/state";
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
import katex from "katex";
import {
  applyFormatToView,
  attachViewToTab as attachViewToTabCore,
  collectMarkdownCodeBlocks,
  collectMarkdownFrontMatterBlock,
  collectMarkdownMathBlocks,
  collectMarkdownTableBlocks,
  completeMarkdownShortcutOnSpace,
  continueMarkdownListOnEnter,
  handleRustMessage as handleRustMessageCore,
  indentMarkdownListInView,
  markdownDecorationTier,
  normalizeEditorPreferences,
  nextLayoutSize,
  parseMarkdownBlockquoteLine,
  parseMarkdownFootnoteDefinitionLine,
  parseMarkdownHeadingLine,
  parseMarkdownHorizontalRuleLine,
  parseMarkdownImageSpans,
  parseMarkdownInlineSpans,
  parseMarkdownListLine,
  parseMarkdownTaskLine,
  openReplacePanelInView,
  pasteMarkdownLinkInView,
  recycleEditor as recycleEditorCore,
  requestSaveForView,
  blockHintsEqual,
  setBlockHints as setBlockHintsCore,
  setEditorPreferences as setEditorPreferencesCore,
  setViewMode as setViewModeCore,
  viewIsComposing,
} from "./editor-core.js";

// tabId → { view, dioxus, suppressChange }
const editorRegistry = new Map();

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
    caretColor: "var(--mn-accent, #b24b2f)",
    maxWidth: "var(--mn-document-measure, 860px)",
    marginInline: "auto",
    color: "var(--mn-editor-ink, var(--mn-ink, #25211a))",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
    color: "var(--mn-ink-3, #a08f78)",
    paddingTop: "var(--mn-document-pad-top, 24px)",
    paddingRight: "var(--mn-document-gutter-gap, 8px)",
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
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--mn-selection, rgba(178,75,47,.15))",
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
  },
  ".cm-line.cm-hybrid-code-block-line": {
    backgroundColor: "var(--mn-markdown-code-block-bg, var(--mn-surface-sunken, rgba(178,75,47,.08)))",
    color: "var(--mn-ink)",
    fontFamily: 'var(--mn-markdown-mono-font, var(--mn-editor-font, "Cascadia Code", monospace))',
    paddingLeft: "var(--mn-markdown-code-block-pad-x, 22px)",
    paddingRight: "var(--mn-markdown-code-block-pad-x, 22px)",
  },
  ".cm-line.cm-hybrid-code-block-start": {
    borderTopLeftRadius: "var(--mn-markdown-code-radius, 6px)",
    borderTopRightRadius: "var(--mn-markdown-code-radius, 6px)",
    paddingTop: "var(--mn-markdown-code-block-pad-y, 18px)",
  },
  ".cm-line.cm-hybrid-code-block-end": {
    borderBottomLeftRadius: "var(--mn-markdown-code-radius, 6px)",
    borderBottomRightRadius: "var(--mn-markdown-code-radius, 6px)",
    paddingBottom: "var(--mn-markdown-code-block-pad-y, 18px)",
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
  ".cm-hybrid-code-info": {
    color: "var(--mn-ink-3)",
    fontSize: ".78em",
    textTransform: "uppercase",
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
    backgroundColor: "var(--mn-markdown-code-bg, rgba(178,75,47,.08))",
    color: "var(--mn-markdown-code-color, var(--mn-accent-strong))",
    fontFamily: 'var(--mn-markdown-mono-font, var(--mn-editor-font, "Cascadia Code", monospace))',
    fontSize: ".92em",
    padding: "var(--mn-markdown-inline-code-pad, .1em .42em)",
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
    margin: "0.75em 0",
    padding: "var(--mn-markdown-code-block-pad-y, 18px) var(--mn-markdown-code-block-pad-x, 22px)",
    border: "var(--mn-border-default, 1px solid var(--mn-border))",
    borderRadius: "var(--mn-markdown-code-radius, 6px)",
    backgroundColor: "var(--mn-markdown-code-block-bg, var(--mn-surface-sunken, #fbf6ea))",
    color: "var(--mn-ink)",
    overflowX: "auto",
    textAlign: "center",
  },
  ".cm-hybrid-math-block math": {
    fontSize: "1.15em",
  },
  ".cm-hybrid-math-block-error": {
    color: "var(--mn-accent-strong)",
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
    display: "inline-flex",
    justifyContent: "flex-end",
    minWidth: "var(--mn-markdown-list-marker-width, 1.4em)",
    marginRight: "var(--mn-markdown-list-marker-gap, .45em)",
    color: "var(--mn-accent)",
    fontVariantNumeric: "tabular-nums",
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

  { tag: t.list, color: "var(--mn-accent)" },
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
  const fromLine = Number(block?.start_line);
  const toLine = Number(block?.end_line);
  if (!Number.isSafeInteger(fromLine) || !Number.isSafeInteger(toLine)) return null;
  if (fromLine < 1 || toLine < fromLine) return null;

  return {
    fromLine,
    toLine,
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

function codeBlocksFromHints(hintRanges) {
  return hintRangesByKind(hintRanges, "fenced_code").map((block) => ({
    fromLine: block.fromLine,
    toLine: block.toLine,
    info: block.kind?.language ?? "",
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

class InlineMathWidget extends WidgetType {
  constructor(source) {
    super();
    this.source = source;
  }

  eq(other) {
    return other instanceof InlineMathWidget && other.source === this.source;
  }

  toDOM() {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-hybrid-inline-math";

    if (!renderKatexMath(wrapper, this.source, false)) {
      wrapper.classList.add("cm-hybrid-inline-math-error");
      wrapper.textContent = `$${this.source}$`;
    }

    return wrapper;
  }

  ignoreEvent() {
    return false;
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

function renderKatexMath(target, source, displayMode) {
  try {
    target.innerHTML = katex.renderToString(source, {
      displayMode,
      output: "mathml",
      throwOnError: false,
      strict: "ignore",
    });
  } catch {
    return false;
  }

  return true;
}

function addInlineDecorations(decorations, line) {
  for (const span of parseMarkdownInlineSpans(line.text)) {
    const contentFrom = line.from + span.openTo;
    const contentTo = line.from + span.closeFrom;
    if (span.type === "footnote_ref") {
      decorations.push(
        Decoration.replace({
          widget: new FootnoteReferenceWidget(span.label),
        }).range(line.from + span.from, line.from + span.to),
      );
      continue;
    }

    if (span.type === "inline_math") {
      decorations.push(
        Decoration.replace({
          widget: new InlineMathWidget(line.text.slice(span.openTo, span.closeFrom)),
        }).range(line.from + span.from, line.from + span.to),
      );
      continue;
    }

    const className = inlineClassForType(span.type);
    if (!className) continue;

    decorations.push(Decoration.replace({}).range(line.from + span.from, contentFrom));
    decorations.push(Decoration.mark({ class: className }).range(contentFrom, contentTo));
    decorations.push(Decoration.replace({}).range(contentTo, line.from + span.to));
  }
}

class ImagePreviewWidget extends WidgetType {
  constructor(src, alt, title) {
    super();
    this.src = src;
    this.alt = alt;
    this.title = title;
  }

  eq(other) {
    return (
      other.src === this.src &&
      other.alt === this.alt &&
      other.title === this.title
    );
  }

  toDOM() {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-hybrid-image-preview";

    const image = document.createElement("img");
    image.src = this.src;
    image.alt = this.alt;
    if (this.title) image.title = this.title;
    image.loading = "lazy";
    image.decoding = "async";
    wrapper.appendChild(image);

    return wrapper;
  }

  ignoreEvent() {
    return false;
  }
}

function addImageDecorations(decorations, line) {
  for (const image of parseMarkdownImageSpans(line.text)) {
    decorations.push(
      Decoration.replace({
        widget: new ImagePreviewWidget(image.src, image.alt, image.title),
      }).range(line.from + image.from, line.from + image.to),
    );
  }
}

class TaskCheckboxWidget extends WidgetType {
  constructor(checked) {
    super();
    this.checked = checked;
  }

  eq(other) {
    return other.checked === this.checked;
  }

  toDOM() {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-hybrid-task-checkbox";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = this.checked;
    checkbox.disabled = true;
    wrapper.appendChild(checkbox);

    return wrapper;
  }

  ignoreEvent() {
    return false;
  }
}

function addTaskDecorations(decorations, line) {
  const task = parseMarkdownTaskLine(line.text);
  if (!task) return;

  decorations.push(
    Decoration.replace({
      widget: new TaskCheckboxWidget(task.checked),
    }).range(line.from, line.from + task.markerLength),
  );
}

class ListMarkerWidget extends WidgetType {
  constructor(marker) {
    super();
    this.marker = marker;
  }

  eq(other) {
    return other instanceof ListMarkerWidget && other.marker === this.marker;
  }

  toDOM() {
    const marker = document.createElement("span");
    marker.className = "cm-hybrid-list-marker";
    marker.textContent = this.marker;
    return marker;
  }
}

function addListDecorations(decorations, line) {
  const list = parseMarkdownListLine(line.text);
  if (!list) return false;

  decorations.push(
    Decoration.replace({
      widget: new ListMarkerWidget(list.ordered ? list.marker : "•"),
    }).range(
      line.from + list.indentLength,
      line.from + list.markerLength,
    ),
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

function addHorizontalRuleDecorations(decorations, line) {
  if (!parseMarkdownHorizontalRuleLine(line.text)) return false;

  decorations.push(
    Decoration.replace({
      widget: new HorizontalRuleWidget(),
    }).range(line.from, line.to),
  );
  return true;
}

function addBlockquoteDecorations(decorations, line) {
  const blockquote = parseMarkdownBlockquoteLine(line.text);
  if (!blockquote) return false;

  decorations.push(
    Decoration.line({
      class: "cm-hybrid-blockquote-line",
    }).range(line.from),
  );
  decorations.push(
    Decoration.replace({}).range(line.from, line.from + blockquote.markerLength),
  );
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

function addFootnoteDefinitionDecorations(decorations, line) {
  const footnote = parseMarkdownFootnoteDefinitionLine(line.text);
  if (!footnote) return false;

  decorations.push(
    Decoration.line({
      class: "cm-hybrid-footnote-line",
    }).range(line.from),
  );
  decorations.push(
    Decoration.replace({
      widget: new FootnoteDefinitionLabelWidget(footnote.label),
    }).range(line.from, line.from + footnote.markerLength),
  );
  return true;
}

class CodeFenceWidget extends WidgetType {
  constructor(info) {
    super();
    this.info = info;
  }

  eq(other) {
    return other instanceof CodeFenceWidget && other.info === this.info;
  }

  toDOM() {
    const label = document.createElement("span");
    label.className = "cm-hybrid-code-info";
    label.textContent = this.info;
    return label;
  }
}

class MathBlockWidget extends WidgetType {
  constructor(source) {
    super();
    this.source = source;
  }

  eq(other) {
    return other instanceof MathBlockWidget && other.source === this.source;
  }

  toDOM() {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-hybrid-math-block";

    if (!renderKatexMath(wrapper, this.source, true)) {
      wrapper.classList.add("cm-hybrid-math-block-error");
      wrapper.textContent = this.source ? `$$\n${this.source}\n$$` : "$$";
    }

    return wrapper;
  }

  ignoreEvent() {
    return false;
  }
}

function addCodeBlockDecorations(decorations, line, block, tier) {
  const isStart = line.number === block.fromLine;
  const isEnd = line.number === block.toLine;
  const classes = [
    "cm-hybrid-code-block-line",
    isStart ? "cm-hybrid-code-block-start" : "",
    isEnd ? "cm-hybrid-code-block-end" : "",
  ].filter(Boolean).join(" ");

  decorations.push(Decoration.line({ class: classes }).range(line.from));
  if (tier === "near" && (isStart || isEnd)) {
    decorations.push(
      Decoration.replace({
        widget: new CodeFenceWidget(isStart ? block.info : ""),
      }).range(line.from, line.to),
    );
  }
}

function addMathBlockDecorations(decorations, state, block) {
  const from = state.doc.line(block.fromLine).from;
  const to = state.doc.line(block.toLine).to;
  decorations.push(
    Decoration.replace({
      block: true,
      widget: new MathBlockWidget(block.source),
    }).range(from, to),
  );
}

function addFrontMatterDecorations(decorations, line, block) {
  const isStart = line.number === block.fromLine;
  const isEnd = line.number === block.toLine;
  const classes = [
    "cm-hybrid-front-matter-line",
    isStart ? "cm-hybrid-front-matter-start" : "",
    isEnd ? "cm-hybrid-front-matter-end" : "",
  ].filter(Boolean).join(" ");

  decorations.push(Decoration.line({ class: classes }).range(line.from));
  if (isStart || isEnd) {
    decorations.push(Decoration.replace({}).range(line.from, line.to));
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
  if (sourceOnlyBlockHints(hints)) {
    return {
      hintRanges: [],
      usesBlockHints: true,
      codeBlocks: [],
      frontMatterBlock: null,
      mathBlocks: [],
      tableBlocks: [],
    };
  }

  const hintRanges = blockHintRanges(hints);
  const usesBlockHints = hintRanges.length > 0;
  const lines = documentLineTexts(state.doc);

  return {
    hintRanges,
    usesBlockHints,
    codeBlocks: usesBlockHints
      ? codeBlocksFromHints(hintRanges)
      : collectMarkdownCodeBlocks(lines),
    frontMatterBlock: collectMarkdownFrontMatterBlock(lines),
    mathBlocks: collectMarkdownMathBlocks(lines),
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

function addHeadingDecorations(decorations, line, heading, tier) {
  const markerTo = line.from + heading.markerLength;
  decorations.push(
    Decoration.line({
      class: `cm-hybrid-heading-line cm-hybrid-heading-line-${heading.level}`,
    }).range(line.from),
  );

  if (tier !== "near") {
    return;
  }

  decorations.push(Decoration.replace({}).range(line.from, markerTo));
  decorations.push(
    Decoration.mark({
      class: `cm-hybrid-heading cm-hybrid-heading-${heading.level}`,
    }).range(markerTo, line.to),
  );
}

function buildHybridMarkdownDecorations(
  view,
  context,
) {
  if (view.state.field(viewModeField, false) !== "hybrid") {
    return Decoration.none;
  }

  const decorations = [];
  const emittedMathBlocks = new Set();
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
          addFrontMatterDecorations(decorations, line, context.frontMatterBlock);
        }
        continue;
      }

      const codeBlock = rangeBlockForLine(context.codeBlocks, line.number);
      if (codeBlock) {
        const tier = decorationTierForRange(
          view.state,
          codeBlock.fromLine,
          codeBlock.toLine,
        );
        if (tier !== "current") {
          addCodeBlockDecorations(decorations, line, codeBlock, tier);
        }
        continue;
      }

      const mathBlock = rangeBlockForLine(context.mathBlocks, line.number);
      if (mathBlock) {
        const tier = decorationTierForRange(
          view.state,
          mathBlock.fromLine,
          mathBlock.toLine,
        );
        if (tier === "near" && !emittedMathBlocks.has(mathBlock.fromLine)) {
          emittedMathBlocks.add(mathBlock.fromLine);
          addMathBlockDecorations(decorations, view.state, mathBlock);
        }
        continue;
      }

      const tableBlock = rangeBlockForLine(context.tableBlocks, line.number);
      if (tableBlock) {
        const tier = decorationTierForRange(
          view.state,
          tableBlock.fromLine,
          tableBlock.toLine,
        );
        if (tier !== "current") {
          addTableDecorations(decorations, line, tableBlock);
        }
        continue;
      }

      const tier = decorationTierForLine(view.state, line);
      if (tier === "current") continue;

      const heading = headingDecorationForLine(context, line);
      if (!heading) {
        if (tier === "near") {
          if (addHorizontalRuleDecorations(decorations, line)) continue;
          if (addFootnoteDefinitionDecorations(decorations, line)) continue;
          addBlockquoteDecorations(decorations, line);
          addTaskDecorations(decorations, line);
          addListDecorations(decorations, line);
          addImageDecorations(decorations, line);
          addInlineDecorations(decorations, line);
        }
        continue;
      }

      addHeadingDecorations(decorations, line, heading, tier);
    }
  }

  return Decoration.set(decorations, true);
}

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
      this.decorations = buildHybridMarkdownDecorations(
        view,
        this.blockContext,
      );
    }

    update(update) {
      const hintsChanged = blockHintsChanged(update);
      if (update.docChanged || hintsChanged) {
        this.blockContext = deriveHybridBlockContext(update.state);
      }
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        viewModeChanged(update) ||
        hintsChanged
      ) {
        this.decorations = buildHybridMarkdownDecorations(
          update.view,
          this.blockContext,
        );
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
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
    { key: "Space", run: completeMarkdownShortcutOnSpace },
    { key: "Tab", run: (view) => indentMarkdownListInView(view, "indent") },
    { key: "Shift-Tab", run: (view) => indentMarkdownListInView(view, "outdent") },
  ]);

  return [
    viewModeField,
    blockHintsField,
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
        if (!pasteMarkdownLinkInView(view, text, entry.preferences)) return false;

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
      if (!update.docChanged) return;
      const tabId = update.view.dom.dataset.tabId;
      if (!tabId) return; // unrouted (in pool) — swallow
      const entry = editorRegistry.get(tabId);
      if (!entry || entry.suppressChange) return;
      entry.dioxus?.send({
        type: "content_changed",
        tab_id: tabId,
        content: update.state.doc.toString(),
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
  } else {
    setTimeout(measure, 0);
  }
}

function disconnectLayoutObserver(entry) {
  entry.layoutObserver?.disconnect();
  entry.layoutCancel?.();
  entry.layoutObserver = null;
  entry.layoutFrame = 0;
  entry.layoutCancel = null;
  entry.layoutSize = null;
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
  const normalized = setViewModeCore(entry, mode);
  entry.view?.dispatch({
    effects: setViewModeEffect.of(normalized),
  });
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
    const container = entry.view?.dom?.parentElement;
    if (container instanceof HTMLElement) {
      attachLayoutObserver(tabId, container, dioxus);
    }
  },
};
