import { activeOutlineHeadingIndex } from "./editor-core.ts";
import { normalizeTiptapViewMode } from "./tiptap-mode-controller.ts";

const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";

type RectLike = {
  top: number;
};

type HeadingNodeLike = {
  type?: {
    name?: string;
  };
  isTextblock?: boolean;
  content?: {
    size?: number;
  };
  textContent?: string | null;
};

type TiptapNavigationDoc = {
  descendants?: (callback: (node: HeadingNodeLike, pos: number) => void) => void;
};

type TiptapNavigationEditor = {
  state?: {
    doc?: TiptapNavigationDoc | null;
    selection?: {
      from?: unknown;
    } | null;
  } | null;
  view?: {
    dom?: {
      querySelectorAll?: (selector: string) => ArrayLike<HeadingElementLike>;
    } | null;
  } | null;
  chain?: () => {
    setTextSelection?: (position: number) => unknown;
    scrollIntoView?: () => unknown;
    focus?: () => unknown;
    run?: () => unknown;
  } | null;
  commands?: {
    setTextSelection?: (position: number) => unknown;
    scrollIntoView?: () => unknown;
    focus?: () => unknown;
  };
};

type HeadingElementLike = {
  getBoundingClientRect?: () => RectLike;
};

type ScrollElementLike = HeadingElementLike & {
  scrollTop?: number;
  scrollTo?: (options: { top: number; behavior?: ScrollBehavior }) => void;
  querySelectorAll?: (selector: string) => ArrayLike<HeadingElementLike>;
};

type TextAreaLike = ScrollElementLike & {
  value?: string;
  selectionStart?: number;
  selectionEnd?: number;
  ownerDocument?: {
    defaultView?: {
      getComputedStyle?: (element: TextAreaLike) => {
        lineHeight?: string;
        fontSize?: string;
      };
    } | null;
  } | null;
  setSelectionRange?: (start: number, end: number) => void;
  focus?: () => void;
};

type TiptapNavigationEntry = {
  editor?: TiptapNavigationEditor | null;
  dom?: ScrollElementLike | null;
  viewMode?: unknown;
  markdownSync?: {
    markdown?: unknown;
  } | null;
  sourcePane?: {
    textarea?: TextAreaLike | null;
  } | null;
};

type HeadingPosition = {
  pos: number;
  selectionPos: number;
  text: string;
};

type ScrollToLineOptions = {
  headingIndex?: unknown;
};

function safeInteger(value: unknown): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function markdownForEntry(entry: TiptapNavigationEntry | null | undefined): string {
  const textareaValue = entry?.sourcePane?.textarea?.value;
  if (typeof textareaValue === "string") return textareaValue;
  return String(entry?.markdownSync?.markdown ?? "");
}

function lineCount(markdown: unknown): number {
  const source = String(markdown ?? "");
  return source.length === 0 ? 1 : source.split("\n").length;
}

export function lineStartOffset(markdown: unknown, lineNumber: unknown): number {
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

export function lineNumberAtOffset(markdown: unknown, offset: unknown): number {
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

function lineHeightForElement(element: TextAreaLike): number {
  const fallback = 22;
  const view = element?.ownerDocument?.defaultView ?? globalThis;
  const computed = view?.getComputedStyle?.(element);
  const lineHeight = Number.parseFloat(computed?.lineHeight ?? "");
  if (Number.isFinite(lineHeight) && lineHeight > 0) return lineHeight;

  const fontSize = Number.parseFloat(computed?.fontSize ?? "");
  return Number.isFinite(fontSize) && fontSize > 0 ? fontSize * 1.5 : fallback;
}

function scrollElementToTop(
  scroller: ScrollElementLike | null | undefined,
  targetTop: unknown,
): void {
  const top = Math.max(0, Number(targetTop) || 0);
  if (typeof scroller?.scrollTo === "function") {
    scroller.scrollTo({ top, behavior: "auto" });
  } else if (scroller) {
    scroller.scrollTop = top;
  }
}

function sourcePaneActiveLineNumber(entry: TiptapNavigationEntry): number | null {
  const textarea = entry?.sourcePane?.textarea;
  if (!textarea) return null;
  return lineNumberAtOffset(textarea.value ?? "", textarea.selectionStart ?? 0);
}

function sourcePaneTopLineNumber(
  entry: TiptapNavigationEntry,
  scroller: TextAreaLike | null | undefined = entry?.sourcePane?.textarea,
): number | null {
  if (!scroller) return null;
  const lineHeight = lineHeightForElement(scroller);
  return Math.max(1, Math.floor((Number(scroller.scrollTop) || 0) / lineHeight) + 1);
}

function scrollSourcePaneToLine(
  entry: TiptapNavigationEntry,
  lineNumber: unknown,
): boolean {
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

function isHeadingNode(node: HeadingNodeLike | null | undefined): boolean {
  return node?.type?.name === "heading";
}

function headingPositions(
  editor: TiptapNavigationEditor | null | undefined,
): HeadingPosition[] {
  const positions: HeadingPosition[] = [];
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

function headingPositionForIndex(
  editor: TiptapNavigationEditor | null | undefined,
  headingIndex: unknown,
): number | null {
  const index = safeInteger(headingIndex);
  if (index === null || index < 0) return null;
  return headingPositions(editor)[index]?.selectionPos ?? null;
}

function atxHeadingIndexAtLine(markdown: unknown, lineNumber: unknown): number | null {
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

function activeHeadingIndexForSelection(
  editor: TiptapNavigationEditor | null | undefined,
): number {
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

function headingsForEditor(entry: TiptapNavigationEntry): HeadingElementLike[] {
  return Array.from(entry?.editor?.view?.dom?.querySelectorAll?.(HEADING_SELECTOR) ?? []);
}

function headingTopWithinScroller(
  heading: HeadingElementLike | null | undefined,
  scroller: ScrollElementLike | null | undefined,
): number | null {
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

function scrollHeadingIntoView(
  entry: TiptapNavigationEntry,
  headingIndex: unknown,
): boolean {
  const scroller = tiptapEditorScroller(entry);
  const heading = headingsForEditor(entry)[safeInteger(headingIndex) ?? -1];
  const top = headingTopWithinScroller(heading, scroller);
  if (top === null) return false;

  scrollElementToTop(scroller, Math.max(0, top - 12));
  return true;
}

function runTiptapSelectionCommand(
  editor: TiptapNavigationEditor | null | undefined,
  position: number | null,
): boolean {
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

function scrollHybridEditorToLine(
  entry: TiptapNavigationEntry,
  lineNumber: unknown,
  { headingIndex = null }: ScrollToLineOptions = {},
): boolean {
  const targetHeadingIndex =
    safeInteger(headingIndex) ?? atxHeadingIndexAtLine(markdownForEntry(entry), lineNumber);
  const position = headingPositionForIndex(entry?.editor, targetHeadingIndex);
  if (position === null) return false;

  const selected = runTiptapSelectionCommand(entry.editor, position);
  const scrolled = scrollHeadingIntoView(entry, targetHeadingIndex);
  return selected || scrolled;
}

function lineNumberForHeadingIndex(
  outlineLineNumbers: readonly unknown[],
  headingIndex: unknown,
): number | null {
  const index = safeInteger(headingIndex);
  if (index === -1) return 0;
  if (index === null || index < 0) return null;
  return safeInteger(outlineLineNumbers?.[index]);
}

function hybridTopHeadingIndex(
  entry: TiptapNavigationEntry,
  scroller: ScrollElementLike | null = tiptapEditorScroller(entry),
): number {
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

export function isTiptapEntry(entry: unknown): entry is TiptapNavigationEntry {
  const value = entry as TiptapNavigationEntry | null | undefined;
  return Boolean(value?.editor && value?.dom);
}

export function tiptapEditorScroller(
  entry: TiptapNavigationEntry | null | undefined,
): ScrollElementLike | TextAreaLike | null {
  if (!isTiptapEntry(entry)) return null;
  return normalizeTiptapViewMode(entry.viewMode) === "source"
    ? entry.sourcePane?.textarea ?? entry.dom
    : entry.dom;
}

export function tiptapActiveMarkdownLineNumber(
  entry: TiptapNavigationEntry | null | undefined,
  outlineLineNumbers: readonly unknown[] = [],
): number | null {
  if (!isTiptapEntry(entry)) return null;

  if (normalizeTiptapViewMode(entry.viewMode) === "source") {
    return sourcePaneActiveLineNumber(entry);
  }

  return lineNumberForHeadingIndex(outlineLineNumbers, activeHeadingIndexForSelection(entry.editor));
}

export function tiptapTopMarkdownLineNumber(
  entry: TiptapNavigationEntry | null | undefined,
  outlineLineNumbers: readonly unknown[] = [],
  scroller: ScrollElementLike | TextAreaLike | null = tiptapEditorScroller(entry),
): number | null {
  if (!isTiptapEntry(entry)) return null;

  if (normalizeTiptapViewMode(entry.viewMode) === "source") {
    return sourcePaneTopLineNumber(entry, scroller as TextAreaLike | null);
  }

  return lineNumberForHeadingIndex(
    outlineLineNumbers,
    hybridTopHeadingIndex(entry, scroller as ScrollElementLike | null),
  );
}

export function tiptapActiveOutlineIndex(
  entry: TiptapNavigationEntry | null | undefined,
  outlineLineNumbers: readonly unknown[] = [],
): number {
  if (!isTiptapEntry(entry)) return -1;

  if (normalizeTiptapViewMode(entry.viewMode) === "source") {
    return activeOutlineHeadingIndex(outlineLineNumbers, sourcePaneActiveLineNumber(entry));
  }

  return activeHeadingIndexForSelection(entry.editor);
}

export function scrollTiptapEntryToLine(
  entry: TiptapNavigationEntry | null | undefined,
  lineNumber: unknown,
  options: ScrollToLineOptions = {},
): boolean {
  if (!isTiptapEntry(entry)) return false;

  if (normalizeTiptapViewMode(entry.viewMode) === "source") {
    return scrollSourcePaneToLine(entry, lineNumber);
  }

  return scrollHybridEditorToLine(entry, lineNumber, options);
}
