import { Decoration, WidgetType } from "@codemirror/view";
import katex from "katex";
import mermaid from "mermaid";
import {
  appendMarkdownTableColumn,
  appendMarkdownTableRow,
  deleteMarkdownTableLastColumn,
  deleteMarkdownTableLastRow,
  parseMarkdownImageSpans,
  parseMarkdownTable,
  parseStandaloneMarkdownImageBlock,
  rewriteMarkdownTableCell,
  sanitizeMarkdownImageSrc,
} from "./editor-core.js";

const MERMAID_RENDER_TIMEOUT_MS = 2500;
let mermaidInitialized = false;
let mermaidRenderCounter = 0;

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
    securityLevel: "strict",
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

function createMermaidStatus(message, source, error = false) {
  const wrapper = document.createElement("div");
  wrapper.className = error
    ? "mn-mermaid-status mn-mermaid-status-error"
    : "mn-mermaid-status";
  const label = document.createElement("div");
  label.className = "mn-mermaid-label";
  label.textContent = error ? "Mermaid render failed" : message;
  wrapper.append(label);

  if (source) {
    const pre = document.createElement("pre");
    pre.className = "mn-mermaid-source";
    pre.textContent = source;
    wrapper.append(pre);
  }
  return wrapper;
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
  element.replaceChildren(createMermaidStatus("Rendering Mermaid diagram...", "", false));

  try {
    const result = await renderMermaidSvg(normalizedSource);
    if (element.dataset.mermaidRenderToken !== token) return false;

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
    element.replaceChildren(createMermaidStatus(message, normalizedSource, true));
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
  constructor(source, fromLine, toLine) {
    super();
    this.source = source;
    this.fromLine = fromLine;
    this.toLine = toLine;
  }

  eq(other) {
    return (
      other instanceof MermaidBlockWidget &&
      other.source === this.source &&
      other.fromLine === this.fromLine &&
      other.toLine === this.toLine
    );
  }

  toDOM(view) {
    const wrapper = document.createElement("div");
    wrapper.className = "mn-mermaid-block cm-hybrid-mermaid-block";
    wrapper.tabIndex = 0;
    wrapper.setAttribute("role", "button");
    wrapper.setAttribute("aria-label", "Edit Mermaid diagram source");
    const editSource = (event) => focusMarkdownBlockSource(view, this.fromLine, event);

    wrapper.addEventListener("mousedown", (event) => event.preventDefault());
    wrapper.addEventListener("click", editSource);
    wrapper.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") editSource(event);
    });

    void renderMermaidIntoElement(wrapper, this.source);
    return wrapper;
  }

  ignoreEvent() {
    return false;
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
      ["Add row", () => appendMarkdownTableRow(this.markdown)],
      ["Delete row", () => deleteMarkdownTableLastRow(this.markdown)],
      ["Add column", () => appendMarkdownTableColumn(this.markdown)],
      ["Delete column", () => deleteMarkdownTableLastColumn(this.markdown)],
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
    for (const row of this.table.rows) {
      const tr = document.createElement("tr");
      row.cells.forEach((cell, columnIndex) => {
        const cellElement = document.createElement(row.kind === "header" ? "th" : "td");
        const input = document.createElement("input");
        input.className = "cm-hybrid-table-cell-input";
        input.value = cell;
        input.setAttribute("aria-label", `Edit table cell ${row.sourceRowIndex + 1}:${columnIndex + 1}`);
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            input.blur();
          }
          event.stopPropagation();
        });
        input.addEventListener("mousedown", (event) => event.stopPropagation());
        input.addEventListener("click", (event) => event.stopPropagation());
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
    }
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

export function addMermaidBlockDecorations(decorations, state, block) {
  const from = state.doc.line(block.fromLine).from;
  const to = state.doc.line(block.toLine).to;
  decorations.push(
    Decoration.replace({
      block: true,
      widget: new MermaidBlockWidget(block.source, block.fromLine, block.toLine),
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
