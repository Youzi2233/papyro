import { activeOutlineHeadingIndex } from "./editor-core.ts";
import { normalizeTiptapViewMode } from "./tiptap-mode-controller.js";

const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";

function safeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function markdownForEntry(entry) {
  const textareaValue = entry?.sourcePane?.textarea?.value;
  if (typeof textareaValue === "string") return textareaValue;
  return String(entry?.markdownSync?.markdown ?? "");
}

function lineCount(markdown) {
  const source = String(markdown ?? "");
  return source.length === 0 ? 1 : source.split("\n").length;
}

export function lineStartOffset(markdown, lineNumber) {
  const source = String(markdown ?? "");
  const target = clamp(safeInteger(lineNumber) ?? 1, 1, lineCount(source));
  if (target === 1) return 0;

  let currentLine = 1;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "\n") continue;
    currentLine += 1;
    if (currentLine === target) {
      return index + 1;
    }
  }

  return source.length;
}

export function lineNumberAtOffset(markdown, offset) {
  const source = String(markdown ?? "");
  const cursor = clamp(safeInteger(offset) ?? 0, 0, source.length);
  let line = 1;

  for (let index = 0; index < cursor; index += 1) {
    if (source[index] === "\n") {
      line += 1;
    }
  }

  return line;
}

function lineHeightForElement(element) {
  const fallback = 22;
  const view = element?.ownerDocument?.defaultView ?? globalThis;
  const computed = view?.getComputedStyle?.(element);
  const lineHeight = Number.parseFloat(computed?.lineHeight ?? "");
  if (Number.isFinite(lineHeight) && lineHeight > 0) return lineHeight;

  const fontSize = Number.parseFloat(computed?.fontSize ?? "");
  return Number.isFinite(fontSize) && fontSize > 0 ? fontSize * 1.5 : fallback;
}

function scrollElementToTop(scroller, targetTop) {
  const top = Math.max(0, Number(targetTop) || 0);
  if (typeof scroller?.scrollTo === "function") {
    scroller.scrollTo({ top, behavior: "auto" });
  } else if (scroller) {
    scroller.scrollTop = top;
  }
}

function sourcePaneActiveLineNumber(entry) {
  const textarea = entry?.sourcePane?.textarea;
  if (!textarea) return null;
  return lineNumberAtOffset(textarea.value ?? "", textarea.selectionStart ?? 0);
}

function sourcePaneTopLineNumber(entry, scroller = entry?.sourcePane?.textarea) {
  if (!scroller) return null;
  const lineHeight = lineHeightForElement(scroller);
  return Math.max(1, Math.floor((Number(scroller.scrollTop) || 0) / lineHeight) + 1);
}

function scrollSourcePaneToLine(entry, lineNumber) {
  const textarea = entry?.sourcePane?.textarea;
  if (!textarea) return false;

  const markdown = String(textarea.value ?? markdownForEntry(entry));
  const targetLine = clamp(safeInteger(lineNumber) ?? 1, 1, lineCount(markdown));
  const offset = lineStartOffset(markdown, targetLine);

  textarea.setSelectionRange?.(offset, offset);
  textarea.focus?.();

  const top = Math.max(0, (targetLine - 1) * lineHeightForElement(textarea) - 12);
  scrollElementToTop(textarea, top);
  return true;
}

function isHeadingNode(node) {
  return node?.type?.name === "heading";
}

function headingPositions(editor) {
  const positions = [];
  editor?.state?.doc?.descendants?.((node, pos) => {
    if (!isHeadingNode(node)) return;
    positions.push({
      pos,
      selectionPos: pos + (node.isTextblock || node.content?.size > 0 ? 1 : 0),
      text: String(node.textContent ?? ""),
    });
  });
  return positions;
}

function headingPositionForIndex(editor, headingIndex) {
  const index = safeInteger(headingIndex);
  if (index === null || index < 0) return null;
  return headingPositions(editor)[index]?.selectionPos ?? null;
}

function atxHeadingIndexAtLine(markdown, lineNumber) {
  const target = safeInteger(lineNumber);
  if (target === null || target < 1) return null;

  let headingIndex = -1;
  let inFence = false;
  const lines = String(markdown ?? "").split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trimStart();
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !/^#{1,6}\s+\S/.test(trimmed)) continue;

    headingIndex += 1;
    if (index + 1 === target) {
      return headingIndex;
    }
  }

  return null;
}

function activeHeadingIndexForSelection(editor) {
  const from = safeInteger(editor?.state?.selection?.from);
  if (from === null) return -1;

  let active = -1;
  headingPositions(editor).forEach((heading, index) => {
    if (heading.pos <= from) {
      active = index;
    }
  });
  return active;
}

function headingsForEditor(entry) {
  return Array.from(entry?.editor?.view?.dom?.querySelectorAll?.(HEADING_SELECTOR) ?? []);
}

function headingTopWithinScroller(heading, scroller) {
  if (
    typeof heading?.getBoundingClientRect !== "function" ||
    typeof scroller?.getBoundingClientRect !== "function"
  ) {
    return null;
  }

  const headingRect = heading.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  return headingRect.top - scrollerRect.top + (Number(scroller.scrollTop) || 0);
}

function scrollHeadingIntoView(entry, headingIndex) {
  const scroller = tiptapEditorScroller(entry);
  const heading = headingsForEditor(entry)[safeInteger(headingIndex) ?? -1];
  const top = headingTopWithinScroller(heading, scroller);
  if (top === null) return false;

  scrollElementToTop(scroller, Math.max(0, top - 12));
  return true;
}

function runTiptapSelectionCommand(editor, position) {
  if (!Number.isSafeInteger(position)) return false;

  const chain = editor?.chain?.();
  if (
    chain &&
    typeof chain.setTextSelection === "function" &&
    typeof chain.scrollIntoView === "function" &&
    typeof chain.focus === "function" &&
    typeof chain.run === "function"
  ) {
    return chain.setTextSelection(position).scrollIntoView().focus().run() !== false;
  }

  const selected = editor?.commands?.setTextSelection?.(position) !== false;
  editor?.commands?.scrollIntoView?.();
  editor?.commands?.focus?.();
  return selected;
}

function scrollHybridEditorToLine(entry, lineNumber, { headingIndex = null } = {}) {
  const targetHeadingIndex =
    safeInteger(headingIndex) ?? atxHeadingIndexAtLine(markdownForEntry(entry), lineNumber);
  const position = headingPositionForIndex(entry?.editor, targetHeadingIndex);
  if (position === null) return false;

  const selected = runTiptapSelectionCommand(entry.editor, position);
  const scrolled = scrollHeadingIntoView(entry, targetHeadingIndex);
  return selected || scrolled;
}

function lineNumberForHeadingIndex(outlineLineNumbers, headingIndex) {
  const index = safeInteger(headingIndex);
  if (index === -1) return 0;
  if (index === null || index < 0) return null;
  return safeInteger(outlineLineNumbers?.[index]);
}

function hybridTopHeadingIndex(entry, scroller = tiptapEditorScroller(entry)) {
  if (!scroller) return -1;

  const targetTop = (Number(scroller.scrollTop) || 0) + 24;
  let active = -1;
  headingsForEditor(entry).forEach((heading, index) => {
    const top = headingTopWithinScroller(heading, scroller);
    if (top !== null && top <= targetTop) {
      active = index;
    }
  });
  return active;
}

export function isTiptapEntry(entry) {
  return Boolean(entry?.editor && entry?.dom);
}

export function tiptapEditorScroller(entry) {
  if (!isTiptapEntry(entry)) return null;
  return normalizeTiptapViewMode(entry.viewMode) === "source"
    ? entry.sourcePane?.textarea ?? entry.dom
    : entry.dom;
}

export function tiptapActiveMarkdownLineNumber(entry, outlineLineNumbers = []) {
  if (!isTiptapEntry(entry)) return null;

  if (normalizeTiptapViewMode(entry.viewMode) === "source") {
    return sourcePaneActiveLineNumber(entry);
  }

  return lineNumberForHeadingIndex(outlineLineNumbers, activeHeadingIndexForSelection(entry.editor));
}

export function tiptapTopMarkdownLineNumber(
  entry,
  outlineLineNumbers = [],
  scroller = tiptapEditorScroller(entry),
) {
  if (!isTiptapEntry(entry)) return null;

  if (normalizeTiptapViewMode(entry.viewMode) === "source") {
    return sourcePaneTopLineNumber(entry, scroller);
  }

  return lineNumberForHeadingIndex(outlineLineNumbers, hybridTopHeadingIndex(entry, scroller));
}

export function tiptapActiveOutlineIndex(entry, outlineLineNumbers = []) {
  if (!isTiptapEntry(entry)) return -1;

  if (normalizeTiptapViewMode(entry.viewMode) === "source") {
    return activeOutlineHeadingIndex(outlineLineNumbers, sourcePaneActiveLineNumber(entry));
  }

  return activeHeadingIndexForSelection(entry.editor);
}

export function scrollTiptapEntryToLine(entry, lineNumber, options = {}) {
  if (!isTiptapEntry(entry)) return false;

  if (normalizeTiptapViewMode(entry.viewMode) === "source") {
    return scrollSourcePaneToLine(entry, lineNumber);
  }

  return scrollHybridEditorToLine(entry, lineNumber, options);
}
