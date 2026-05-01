import { EditorState, Prec } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  drawSelection,
  keymap,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import katex from "katex";
import mermaid from "mermaid";
import { mermaid as mermaidCodeMirror } from "codemirror-lang-mermaid";
import {
  deleteMarkdownTableColumn,
  deleteMarkdownTableRow,
  insertMarkdownTableColumnAfter,
  insertMarkdownTableRowAfter,
  nextMarkdownTableCellPosition,
  parseMarkdownImageSpans,
  parseMarkdownTable,
  parseStandaloneMarkdownImageBlock,
  rewriteMarkdownTableCell,
  sanitizeMarkdownImageSrc,
} from "./editor-core.js";

const MERMAID_RENDER_TIMEOUT_MS = 2500;
const MERMAID_EDIT_RENDER_DELAY_MS = 220;
let mermaidInitialized = false;
let mermaidRenderCounter = 0;
let pendingMermaidEditorFocusKey = "";
const mermaidRenderedHeights = new Map();

const mermaidHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: "var(--mn-accent)", fontWeight: "var(--mn-weight-medium, 500)" },
  { tag: [t.typeName, t.className], color: "var(--mn-accent-strong)" },
  { tag: [t.name, t.variableName, t.definition(t.variableName)], color: "var(--mn-ink)" },
  { tag: t.string, color: "var(--mn-ink-2)" },
  { tag: [t.number, t.bool, t.atom], color: "var(--mn-accent-strong)" },
  { tag: t.comment, color: "var(--mn-ink-3)", fontStyle: "italic" },
  { tag: [t.operator, t.punctuation], color: "var(--mn-ink-2)" },
]);

const transparentNativeSelectionTheme = Prec.highest(
  EditorView.theme({
    "&::selection, & ::selection, .cm-content::selection, .cm-content:focus::selection, .cm-content:focus ::selection, .cm-line::selection, .cm-line *::selection": {
      background: "transparent !important",
      backgroundColor: "transparent !important",
      color: "inherit !important",
    },
    ".cm-content:focus": {
      caretColor: "transparent !important",
    },
  }),
);

function mermaidBlockKey(fromLine, toLine) {
  return `${fromLine}:${toLine}`;
}

function mermaidSourceEditorExtensions(onChange, onCommit) {
  return [
    history(),
    drawSelection(),
    transparentNativeSelectionTheme,
    mermaidCodeMirror(),
    syntaxHighlighting(mermaidHighlightStyle, { fallback: true }),
    EditorView.lineWrapping,
    keymap.of([
      {
        key: "Mod-Enter",
        run() {
          onCommit();
          return true;
        },
      },
      ...defaultKeymap,
      ...historyKeymap,
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onChange(update.state.doc.toString());
    }),
    EditorView.theme({
      "&": {
        height: "100%",
        background: "transparent",
        color: "var(--mn-ink)",
        fontSize: "var(--mn-markdown-code-block-size)",
      },
      ".cm-scroller": {
        overflowX: "hidden",
        overflowY: "auto",
        cursor: "text",
        fontFamily: "var(--mn-markdown-mono-font)",
        lineHeight: "var(--mn-markdown-code-block-line)",
        padding: "var(--mn-markdown-code-block-pad-y, 18px) var(--mn-markdown-code-block-pad-x, 22px)",
      },
      ".cm-content": {
        minWidth: "0",
        width: "100%",
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        cursor: "text",
        caretColor: "var(--mn-caret, var(--mn-accent))",
      },
      ".cm-line": {
        cursor: "text",
      },
      ".cm-gutters": {
        display: "none",
      },
      ".cm-activeLine": {
        background: "transparent",
      },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
        background: "var(--mn-hybrid-selection, var(--mn-selection, rgba(100, 116, 139, .26)))",
        backgroundColor: "var(--mn-hybrid-selection, var(--mn-selection, rgba(100, 116, 139, .26)))",
        color: "var(--mn-ink)",
      },
      "&::selection, & ::selection, .cm-content::selection, .cm-content:focus::selection, .cm-content:focus ::selection, .cm-line::selection, .cm-line *::selection": {
        background: "transparent !important",
        backgroundColor: "transparent !important",
        color: "inherit !important",
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "var(--mn-caret, var(--mn-accent))",
        borderLeftWidth: "2px",
      },
    }),
  ];
}

function focusMarkdownBlockSource(view, fromLine, event) {
  event.preventDefault();
  if (!Number.isSafeInteger(fromLine) || fromLine < 1 || fromLine > view.state.doc.lines) return;

  const from = view.state.doc.line(fromLine).from;
  view.dispatch({ selection: { anchor: from } });
  view.focus();
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

export class InlineMathWidget extends WidgetType {
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

class ImagePreviewWidget extends WidgetType {
  constructor(image, options = {}) {
    super();
    this.image = image;
    this.block = Boolean(options.block);
    this.fromLine = options.fromLine;
  }

  eq(other) {
    return (
      other instanceof ImagePreviewWidget &&
      other.block === this.block &&
      other.fromLine === this.fromLine &&
      other.image.src === this.image.src &&
      other.image.alt === this.image.alt &&
      other.image.title === this.image.title
    );
  }

  toDOM(view) {
    const wrapper = document.createElement(this.block ? "figure" : "span");
    const src = sanitizeMarkdownImageSrc(this.image.src);
    wrapper.className = this.block
      ? "cm-hybrid-image-preview cm-hybrid-image-block"
      : "cm-hybrid-image-preview";
    wrapper.tabIndex = 0;
    wrapper.setAttribute("role", this.block ? "button" : "img");
    wrapper.setAttribute("aria-label", this.image.alt || "Image preview");

    if (this.block) {
      wrapper.addEventListener("mousedown", (event) => event.preventDefault());
      wrapper.addEventListener("click", (event) => focusMarkdownBlockSource(view, this.fromLine, event));
      wrapper.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") focusMarkdownBlockSource(view, this.fromLine, event);
      });
    }

    if (!src) {
      wrapper.classList.add("cm-hybrid-image-preview-error");
      wrapper.textContent = this.image.src || "Invalid image source";
      return wrapper;
    }

    const image = document.createElement("img");
    image.src = src;
    image.alt = this.image.alt;
    if (this.image.title) image.title = this.image.title;
    image.loading = "lazy";
    image.decoding = "async";
    wrapper.appendChild(image);

    if (this.block && (this.image.alt || this.image.title)) {
      const caption = document.createElement("figcaption");
      caption.className = "cm-hybrid-image-caption";
      caption.textContent = this.image.title || this.image.alt;
      wrapper.appendChild(caption);
    }
    return wrapper;
  }

  ignoreEvent() {
    return false;
  }
}

export function addImageDecorations(decorations, line) {
  const block = parseStandaloneMarkdownImageBlock(line.text);
  if (block) {
    decorations.push(
      Decoration.replace({
        widget: new ImagePreviewWidget(block, { block: true, fromLine: line.number }),
      }).range(line.from, line.to),
    );
    return true;
  }

  for (const image of parseMarkdownImageSpans(line.text)) {
    decorations.push(
      Decoration.replace({
        widget: new ImagePreviewWidget(image),
      }).range(line.from + image.from, line.from + image.to),
    );
  }
  return false;
}

function ensureMermaidInitialized() {
  if (mermaidInitialized) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    suppressErrorRendering: true,
    theme: "base",
    htmlLabels: false,
  });
  mermaidInitialized = true;
}

function withRenderTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    }),
  ]);
}

export function friendlyMermaidErrorMessage(message) {
  const text = String(message ?? "").trim();
  if (!text) return "Mermaid diagram could not be rendered.";
  if (/syntax error in text/i.test(text)) return "Mermaid syntax error.";
  if (/parse error|lexical error/i.test(text)) return "Mermaid syntax error.";
  if (/dompurify\.sanitize is not a function|purify\.sanitize is not a function/i.test(text)) {
    return "Mermaid render is unavailable in this runtime.";
  }
  if (/timed out/i.test(text)) return "Mermaid render timed out.";
  return text;
}

function createMermaidStatus(message, error = false, rawMessage = "") {
  const wrapper = document.createElement("div");
  wrapper.className = error
    ? "mn-mermaid-status mn-mermaid-status-error"
    : "mn-mermaid-status";
  if (rawMessage) {
    wrapper.title = rawMessage;
    wrapper.dataset.mermaidError = rawMessage;
  }
  const label = document.createElement("div");
  label.className = "mn-mermaid-label";
  label.textContent = error ? "Mermaid render failed" : message;
  wrapper.append(label);
  if (error && message) {
    const detail = document.createElement("div");
    detail.className = "mn-mermaid-detail";
    detail.textContent = friendlyMermaidErrorMessage(message);
    wrapper.append(detail);
  }
  return wrapper;
}

export function mermaidSvgErrorMessage(svg) {
  const markup = String(svg ?? "").trim();
  if (!markup) return "Mermaid diagram could not be rendered.";

  const directMatch = markup.match(/syntax error in text|parse error|lexical error/i);
  if (directMatch) {
    return directMatch[0];
  }

  if (/class=(['"])[^'"]*error-(?:text|icon)\1/i.test(markup)) {
    if (typeof DOMParser !== "function") {
      return "Mermaid diagram could not be rendered.";
    }
  }

  if (typeof DOMParser !== "function") return "";

  try {
    const document = new DOMParser().parseFromString(markup, "image/svg+xml");
    const explicitErrorText = Array.from(document.querySelectorAll(".error-text"))
      .map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .find(Boolean);
    if (explicitErrorText) {
      return explicitErrorText;
    }

    if (document.querySelector(".error-icon")) {
      return "Mermaid diagram could not be rendered.";
    }

    const text = document.documentElement?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const textMatch = text.match(/syntax error in text|parse error|lexical error/i);
    return textMatch ? textMatch[0] : "";
  } catch {
    return "";
  }
}

async function renderMermaidSvg(source) {
  const trimmed = String(source ?? "").trim();
  if (!trimmed) throw new Error("Mermaid source is empty");

  ensureMermaidInitialized();
  const id = `papyro-mermaid-${++mermaidRenderCounter}`;
  return withRenderTimeout(
    Promise.resolve(mermaid.render(id, trimmed)),
    MERMAID_RENDER_TIMEOUT_MS,
    "Mermaid render",
  );
}

async function renderMermaidIntoElement(element, source) {
  if (!(element instanceof HTMLElement)) return false;

  const normalizedSource = String(source ?? "").trim();
  const token = String(++mermaidRenderCounter);
  element.dataset.mermaidRenderToken = token;
  element.dataset.mermaidSource = normalizedSource;
  element.dataset.mermaidState = "pending";
  element.replaceChildren(createMermaidStatus("Rendering Mermaid diagram..."));

  try {
    const result = await renderMermaidSvg(normalizedSource);
    if (element.dataset.mermaidRenderToken !== token) return false;
    const renderError = mermaidSvgErrorMessage(result.svg);
    if (renderError) {
      throw new Error(renderError);
    }

    const svgWrapper = document.createElement("div");
    svgWrapper.className = "mn-mermaid-svg";
    svgWrapper.innerHTML = result.svg ?? "";
    result.bindFunctions?.(svgWrapper);

    element.dataset.mermaidState = "rendered";
    element.replaceChildren(svgWrapper);
    return true;
  } catch (error) {
    if (element.dataset.mermaidRenderToken !== token) return false;

    const message = error instanceof Error ? error.message : String(error);
    element.dataset.mermaidState = "error";
    element.replaceChildren(createMermaidStatus(message, true, message));
    return false;
  }
}

function mermaidSourceFromElement(element) {
  return (
    element.querySelector(".mn-mermaid-source")?.textContent ??
    element.dataset.mermaidSource ??
    ""
  );
}

export function renderPreviewMermaid(root = document) {
  const scope = root instanceof Element || root instanceof Document ? root : document;
  let count = 0;
  for (const block of scope.querySelectorAll(".mn-preview .mn-mermaid-block")) {
    if (!(block instanceof HTMLElement)) continue;

    const source = mermaidSourceFromElement(block);
    if (!source.trim()) continue;
    if (
      block.dataset.mermaidState === "rendered" &&
      block.dataset.mermaidSource === source.trim()
    ) {
      continue;
    }

    count += 1;
    void renderMermaidIntoElement(block, source);
  }
  return count;
}

export class MathBlockWidget extends WidgetType {
  constructor(source, fromLine, toLine) {
    super();
    this.source = source;
    this.fromLine = fromLine;
    this.toLine = toLine;
  }

  eq(other) {
    return (
      other instanceof MathBlockWidget &&
      other.source === this.source &&
      other.fromLine === this.fromLine &&
      other.toLine === this.toLine
    );
  }

  toDOM(view) {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-hybrid-math-block";
    wrapper.tabIndex = 0;
    wrapper.setAttribute("role", "button");
    wrapper.setAttribute("aria-label", "Edit math block source");
    wrapper.title = "Math block";

    if (!renderKatexMath(wrapper, this.source, true)) {
      wrapper.classList.add("cm-hybrid-math-block-error");
      wrapper.textContent = this.source ? `$$\n${this.source}\n$$` : "$$";
    }
    wrapper.addEventListener("mousedown", (event) => event.preventDefault());
    wrapper.addEventListener("click", (event) => focusMarkdownBlockSource(view, this.fromLine, event));
    wrapper.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") focusMarkdownBlockSource(view, this.fromLine, event);
    });
    return wrapper;
  }

  ignoreEvent() {
    return false;
  }
}

export class MermaidBlockWidget extends WidgetType {
  constructor(source, fromLine, toLine, editing = false) {
    super();
    this.source = source;
    this.fromLine = fromLine;
    this.toLine = toLine;
    this.editing = editing;
  }

  eq(other) {
    return (
      other instanceof MermaidBlockWidget &&
      other.source === this.source &&
      other.fromLine === this.fromLine &&
      other.toLine === this.toLine &&
      other.editing === this.editing
    );
  }

  replaceSource(view, source) {
    if (
      !Number.isSafeInteger(this.fromLine) ||
      !Number.isSafeInteger(this.toLine) ||
      this.fromLine < 1 ||
      this.toLine < this.fromLine ||
      this.toLine > view.state.doc.lines
    ) {
      return;
    }

    const normalizedSource = String(source ?? "").replace(/\s+$/u, "");
    if (normalizedSource === this.source) return;

    const from = view.state.doc.line(this.fromLine).from;
    const to = view.state.doc.line(this.toLine).to;
    const markdown = `\`\`\`mermaid\n${normalizedSource}\n\`\`\``;
    view.dispatch({
      changes: { from, to, insert: markdown },
    });
  }

  toRenderedDOM(view) {
    const wrapper = document.createElement("div");
    wrapper.className = "mn-mermaid-block cm-hybrid-mermaid-block";
    wrapper.tabIndex = 0;
    wrapper.setAttribute("role", "button");
    wrapper.setAttribute("aria-label", "Edit Mermaid diagram source");
    const editSource = (event) => {
      pendingMermaidEditorFocusKey = mermaidBlockKey(this.fromLine, this.toLine);
      const height = wrapper.getBoundingClientRect().height;
      if (Number.isFinite(height) && height > 0) {
        mermaidRenderedHeights.set(
          pendingMermaidEditorFocusKey,
          Math.ceil(height),
        );
      }
      focusMarkdownBlockSource(view, this.fromLine, event);
    };

    wrapper.addEventListener("mousedown", (event) => event.preventDefault());
    wrapper.addEventListener("click", editSource);
    wrapper.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") editSource(event);
    });

    void renderMermaidIntoElement(wrapper, this.source);
    return wrapper;
  }

  toEditingDOM(view) {
    const wrapper = document.createElement("div");
    wrapper.className = "mn-mermaid-block cm-hybrid-mermaid-block cm-hybrid-mermaid-split";
    const key = mermaidBlockKey(this.fromLine, this.toLine);
    const renderedHeight = mermaidRenderedHeights.get(key);
    if (Number.isFinite(renderedHeight) && renderedHeight > 0) {
      wrapper.style.height = `${renderedHeight}px`;
    } else {
      wrapper.style.minHeight = "150px";
    }

    const sourcePane = document.createElement("div");
    sourcePane.className = "cm-hybrid-mermaid-source-pane cm-hybrid-mermaid-source-editor";

    const previewPane = document.createElement("div");
    previewPane.className = "cm-hybrid-mermaid-preview-pane";
    const preview = document.createElement("div");
    preview.className = "cm-hybrid-mermaid-preview";
    previewPane.append(preview);
    wrapper.append(sourcePane, previewPane);

    let renderTimer = 0;
    let sourceView = null;
    const scheduleRender = () => {
      window.clearTimeout(renderTimer);
      renderTimer = window.setTimeout(() => {
        void renderMermaidIntoElement(preview, sourceView?.state.doc.toString() ?? "");
      }, MERMAID_EDIT_RENDER_DELAY_MS);
    };
    const commit = () => {
      window.clearTimeout(renderTimer);
      this.replaceSource(view, sourceView?.state.doc.toString() ?? "");
    };

    sourceView = new EditorView({
      state: EditorState.create({
        doc: this.source,
        extensions: mermaidSourceEditorExtensions(scheduleRender, () => {
          commit();
          view.focus();
        }),
      }),
      parent: sourcePane,
    });
    wrapper.__papyroMermaidSourceView = sourceView;
    wrapper.addEventListener("focusout", () => {
      window.setTimeout(() => {
        if (!wrapper.contains(document.activeElement)) commit();
      }, 0);
    });

    void renderMermaidIntoElement(preview, this.source);
    if (pendingMermaidEditorFocusKey === key) {
      pendingMermaidEditorFocusKey = "";
      window.queueMicrotask(() => sourceView?.focus());
    }
    return wrapper;
  }

  toDOM(view) {
    return this.editing ? this.toEditingDOM(view) : this.toRenderedDOM(view);
  }

  destroy(dom) {
    dom.__papyroMermaidSourceView?.destroy?.();
  }

  ignoreEvent() {
    return true;
  }
}

class MarkdownTableWidget extends WidgetType {
  constructor(markdown, fromLine, toLine) {
    super();
    this.markdown = markdown;
    this.fromLine = fromLine;
    this.toLine = toLine;
    this.table = parseMarkdownTable(markdown);
  }

  eq(other) {
    return (
      other instanceof MarkdownTableWidget &&
      other.markdown === this.markdown &&
      other.fromLine === this.fromLine &&
      other.toLine === this.toLine
    );
  }

  toDOM(view) {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-hybrid-table-widget";
    if (!this.table) {
      wrapper.textContent = this.markdown;
      return wrapper;
    }

    const initialRowIndex = this.table.rows.length > 1 ? 1 : 0;
    let activeCell = {
      rowIndex: initialRowIndex,
      sourceRowIndex: this.table.rows[initialRowIndex]?.sourceRowIndex ?? 0,
      columnIndex: 0,
    };

    const setActiveCell = (rowIndex, columnIndex) => {
      activeCell = {
        rowIndex,
        sourceRowIndex: this.table.rows[rowIndex]?.sourceRowIndex ?? 0,
        columnIndex,
      };
    };

    const focusCell = (rowIndex, columnIndex) => {
      const input = wrapper.querySelector(
        `.cm-hybrid-table-cell-input[data-table-row="${rowIndex}"][data-table-column="${columnIndex}"]`,
      );
      if (!input) return false;
      input.focus();
      input.select();
      return true;
    };

    const replaceTable = (updated) => {
      if (!updated || updated === this.markdown) return;
      const from = view.state.doc.line(this.fromLine).from;
      const to = view.state.doc.line(this.toLine).to;
      view.dispatch({
        changes: { from, to, insert: updated },
        selection: { anchor: from },
      });
      view.focus();
    };
    const toolbar = document.createElement("div");
    toolbar.className = "cm-hybrid-table-toolbar";
    const commands = [
      ["Add row below", () => insertMarkdownTableRowAfter(this.markdown, activeCell.sourceRowIndex)],
      ["Delete row", () => deleteMarkdownTableRow(this.markdown, activeCell.sourceRowIndex)],
      ["Add column right", () => insertMarkdownTableColumnAfter(this.markdown, activeCell.columnIndex)],
      ["Delete column", () => deleteMarkdownTableColumn(this.markdown, activeCell.columnIndex)],
    ];
    for (const [label, command] of commands) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        replaceTable(command());
      });
      toolbar.appendChild(button);
    }
    wrapper.appendChild(toolbar);

    const table = document.createElement("table");
    const tbody = document.createElement("tbody");
    this.table.rows.forEach((row, rowIndex) => {
      const tr = document.createElement("tr");
      row.cells.forEach((cell, columnIndex) => {
        const cellElement = document.createElement(row.kind === "header" ? "th" : "td");
        const input = document.createElement("input");
        input.className = "cm-hybrid-table-cell-input";
        input.value = cell;
        input.dataset.tableRow = String(rowIndex);
        input.dataset.tableColumn = String(columnIndex);
        input.setAttribute("aria-label", `Edit table cell ${row.sourceRowIndex + 1}:${columnIndex + 1}`);
        input.addEventListener("keydown", (event) => {
          setActiveCell(rowIndex, columnIndex);
          if (event.key === "Tab") {
            event.preventDefault();
            event.stopPropagation();
            const next = nextMarkdownTableCellPosition(
              this.table.rows.length,
              this.table.columnCount,
              rowIndex,
              columnIndex,
              event.shiftKey ? -1 : 1,
            );
            if (next) {
              focusCell(next.rowIndex, next.columnIndex);
            }
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            input.blur();
          }
          event.stopPropagation();
        });
        input.addEventListener("focus", () => setActiveCell(rowIndex, columnIndex));
        input.addEventListener("mousedown", (event) => {
          setActiveCell(rowIndex, columnIndex);
          event.stopPropagation();
        });
        input.addEventListener("click", (event) => {
          setActiveCell(rowIndex, columnIndex);
          event.stopPropagation();
        });
        input.addEventListener("blur", () => {
          if (input.value === cell) return;
          const updated = rewriteMarkdownTableCell(
            this.markdown,
            row.sourceRowIndex,
            columnIndex,
            input.value,
          );
          replaceTable(updated);
        });
        cellElement.appendChild(input);
        tr.appendChild(cellElement);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrapper.appendChild(table);
    return wrapper;
  }

  ignoreEvent() {
    return true;
  }
}

export function addMathBlockDecorations(decorations, state, block) {
  const from = state.doc.line(block.fromLine).from;
  const to = state.doc.line(block.toLine).to;
  decorations.push(
    Decoration.replace({
      block: true,
      widget: new MathBlockWidget(block.source, block.fromLine, block.toLine),
    }).range(from, to),
  );
}

export function addMermaidBlockDecorations(decorations, state, block, editing = false) {
  const from = state.doc.line(block.fromLine).from;
  const to = state.doc.line(block.toLine).to;
  decorations.push(
    Decoration.replace({
      block: true,
      widget: new MermaidBlockWidget(block.source, block.fromLine, block.toLine, editing),
    }).range(from, to),
  );
}

export function tableWidgetData(state, block, maxBytes, maxCells) {
  const from = state.doc.line(block.fromLine).from;
  const to = state.doc.line(block.toLine).to;
  const markdown = state.sliceDoc(from, to);
  if (markdown.length > maxBytes) return null;

  const table = parseMarkdownTable(markdown);
  if (!table) return null;
  if (table.rows.length * table.columnCount > maxCells) return null;

  return { from, to, markdown };
}

export function addTableWidgetDecorations(decorations, state, block, maxBytes, maxCells) {
  const table = tableWidgetData(state, block, maxBytes, maxCells);
  if (!table) return false;

  decorations.push(
    Decoration.replace({
      block: true,
      widget: new MarkdownTableWidget(table.markdown, block.fromLine, block.toLine),
    }).range(table.from, table.to),
  );
  return true;
}
