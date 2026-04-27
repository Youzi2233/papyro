export const formatSpecs = {
  bold: ["**", "**", "bold text"],
  italic: ["*", "*", "italic text"],
  link: ["[", "](https://)", "link text"],
  image: ["![", "](assets/image.png)", "alt text"],
  inline_code: ["`", "`", "code"],
  code_block: ["```\n", "\n```", "code"],
  heading1: ["# ", "", "Heading 1"],
  heading2: ["## ", "", "Heading 2"],
  heading3: ["### ", "", "Heading 3"],
  quote: ["> ", "", "quote"],
  ul: ["- ", "", "list item"],
  ol: ["1. ", "", "list item"],
};

export function formatSelectionChange(doc, from, to, kind) {
  const spec = formatSpecs[kind];
  if (!spec) return null;

  const [before, after, fallback] = spec;
  const selected = doc.slice(from, to);
  const content = selected || fallback;
  const insert = `${before}${content}${after}`;

  return {
    changes: { from, to, insert },
    selection: {
      anchor: from + before.length,
      head: from + before.length + content.length,
    },
    doc: `${doc.slice(0, from)}${insert}${doc.slice(to)}`,
  };
}

export function normalizeEditorPreferences(preferences = {}) {
  const autoLinkPaste =
    preferences.auto_link_paste ?? preferences.autoLinkPaste ?? true;

  return {
    autoLinkPaste: autoLinkPaste !== false,
  };
}

export function setEditorPreferences(entry, preferences) {
  entry.preferences = {
    ...normalizeEditorPreferences(entry.preferences),
    ...normalizeEditorPreferences(preferences),
  };
  return entry.preferences;
}

export function isPlainUrl(text) {
  return /^https?:\/\/[^\s<>()]+$/i.test(text.trim());
}

function markdownLinkText(text) {
  return text.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}

export function markdownLinkPasteChange(doc, from, to, pastedText, preferences = {}) {
  const normalized = normalizeEditorPreferences(preferences);
  if (!normalized.autoLinkPaste || from === to || !isPlainUrl(pastedText)) {
    return null;
  }

  const selected = doc.slice(from, to);
  if (!selected.trim() || /[\r\n]/.test(selected)) return null;

  const url = pastedText.trim();
  const text = markdownLinkText(selected);
  const insert = `[${text}](${url})`;

  return {
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
    doc: `${doc.slice(0, from)}${insert}${doc.slice(to)}`,
  };
}

export function applyFormatToView(view, kind) {
  const { state } = view;
  const range = state.selection.main;
  const result = formatSelectionChange(
    state.doc.toString(),
    range.from,
    range.to,
    kind,
  );
  if (!result) return false;

  view.dispatch({
    changes: result.changes,
    selection: result.selection,
  });
  view.focus();
  return true;
}

function viewIsComposing(view) {
  return Boolean(view.composing);
}

export function pasteMarkdownLinkInView(view, pastedText, preferences) {
  const range = view.state.selection.main;
  if (range.from === range.to) return false;

  const result = markdownLinkPasteChange(
    view.state.doc.toString(),
    range.from,
    range.to,
    pastedText,
    preferences,
  );
  if (!result) return false;

  view.dispatch({
    changes: result.changes,
    selection: result.selection,
  });
  return true;
}

export function insertMarkdownInView(view, markdown) {
  const text = markdown ?? "";
  if (!text) return false;

  const range = view.state.selection.main;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: text },
    selection: { anchor: range.from + text.length },
  });
  return true;
}

export function requestSaveForView(editorRegistry, view) {
  const tabId = view.dom.dataset.tabId;
  if (!tabId) return false;

  editorRegistry.get(tabId)?.dioxus?.send({
    type: "save_requested",
    tab_id: tabId,
  });
  return true;
}

export function openReplacePanelInView(view, openSearchPanel) {
  const opened = openSearchPanel(view);
  const focusReplaceField = () => {
    const replaceField = view.dom.querySelector?.('.cm-search input[name="replace"]');
    if (!replaceField) return false;

    replaceField.focus();
    replaceField.select?.();
    return true;
  };

  focusReplaceField();
  if (typeof queueMicrotask === "function") {
    queueMicrotask(focusReplaceField);
  }
  return opened;
}

export function markdownListEnterChange(doc, cursor) {
  const lineStart = doc.lastIndexOf("\n", cursor - 1) + 1;
  let lineEnd = doc.indexOf("\n", cursor);
  if (lineEnd < 0) lineEnd = doc.length;

  const line = doc.slice(lineStart, lineEnd);
  const beforeCursor = doc.slice(lineStart, cursor);
  const marker = /^(\s*)((?:[-*+])|(?:\d{1,9}[.)]))([ \t]+|$)/.exec(line);
  if (!marker) return null;

  const contentBeforeCursor = beforeCursor.slice(marker[0].length);
  if (contentBeforeCursor.trimEnd() !== contentBeforeCursor) return null;
  if (!contentBeforeCursor.trim()) {
    return {
      changes: { from: lineStart, to: cursor, insert: "" },
      selection: { anchor: lineStart },
      doc: `${doc.slice(0, lineStart)}${doc.slice(cursor)}`,
    };
  }

  let nextMarker = marker[2];
  const ordered = /^(\d{1,9})([.)])$/.exec(marker[2]);
  if (ordered) {
    nextMarker = `${Number(ordered[1]) + 1}${ordered[2]}`;
  }

  const insert = `\n${marker[1]}${nextMarker}${marker[3]}`;
  return {
    changes: { from: cursor, to: cursor, insert },
    selection: { anchor: cursor + insert.length },
    doc: `${doc.slice(0, cursor)}${insert}${doc.slice(cursor)}`,
  };
}

export function markdownBlockquoteEnterChange(doc, cursor) {
  const lineStart = doc.lastIndexOf("\n", cursor - 1) + 1;
  let lineEnd = doc.indexOf("\n", cursor);
  if (lineEnd < 0) lineEnd = doc.length;
  if (cursor !== lineEnd) return null;

  const line = doc.slice(lineStart, lineEnd);
  const marker = /^([ \t]{0,3}>[ \t]?)/.exec(line);
  if (!marker) return null;

  const content = line.slice(marker[0].length);
  if (!content.trim()) {
    return {
      changes: { from: lineStart, to: cursor, insert: "" },
      selection: { anchor: lineStart },
      doc: `${doc.slice(0, lineStart)}${doc.slice(cursor)}`,
    };
  }

  const prefix = /[ \t]$/.test(marker[0]) ? marker[0] : `${marker[0]} `;
  const insert = `\n${prefix}`;
  return {
    changes: { from: cursor, to: cursor, insert },
    selection: { anchor: cursor + insert.length },
    doc: `${doc.slice(0, cursor)}${insert}${doc.slice(cursor)}`,
  };
}

export function markdownCodeFenceEnterChange(doc, cursor) {
  const lineStart = doc.lastIndexOf("\n", cursor - 1) + 1;
  let lineEnd = doc.indexOf("\n", cursor);
  if (lineEnd < 0) lineEnd = doc.length;
  if (cursor !== lineEnd) return null;

  const line = doc.slice(lineStart, lineEnd);
  const marker = /^([ \t]{0,3})(`{3,}|~{3,})(.*)$/.exec(line);
  if (!marker || !marker[3].trim().match(/^[\w-]*$/)) return null;

  const insert = `\n\n${marker[1]}${marker[2]}`;
  return {
    changes: { from: cursor, to: cursor, insert },
    selection: { anchor: cursor + 1 },
    doc: `${doc.slice(0, cursor)}${insert}${doc.slice(cursor)}`,
  };
}

export function markdownEnterChange(doc, cursor) {
  return (
    markdownListEnterChange(doc, cursor) ??
    markdownBlockquoteEnterChange(doc, cursor) ??
    markdownCodeFenceEnterChange(doc, cursor)
  );
}

export function markdownShortcutSpaceChange(doc, cursor) {
  const lineStart = doc.lastIndexOf("\n", cursor - 1) + 1;
  const beforeCursor = doc.slice(lineStart, cursor);
  if (
    !/^[ \t]{0,3}(?:#{1,6}|>)$/.test(beforeCursor) ||
    doc.slice(lineStart, cursor).trimEnd() !== beforeCursor
  ) {
    return null;
  }

  return {
    changes: { from: cursor, to: cursor, insert: " " },
    selection: { anchor: cursor + 1 },
    doc: `${doc.slice(0, cursor)} ${doc.slice(cursor)}`,
  };
}

export function handleMarkdownEnter(view) {
  if (viewIsComposing(view)) return false;

  const range = view.state.selection.main;
  if (range.from !== range.to) return false;

  const result = markdownEnterChange(view.state.doc.toString(), range.from);
  if (!result) return false;

  view.dispatch({
    changes: result.changes,
    selection: result.selection,
  });
  return true;
}

export function completeMarkdownShortcutOnSpace(view) {
  if (viewIsComposing(view)) return false;

  const range = view.state.selection.main;
  if (range.from !== range.to) return false;

  const result = markdownShortcutSpaceChange(view.state.doc.toString(), range.from);
  if (!result) return false;

  view.dispatch({
    changes: result.changes,
    selection: result.selection,
  });
  return true;
}

export const continueMarkdownListOnEnter = handleMarkdownEnter;

function parseIndentableMarkdownListLine(line) {
  const task = /^(\s*)[-*+][ \t]+\[[ xX]\][ \t]+/.exec(line);
  if (task) {
    return { indentLength: task[1].length };
  }

  return parseMarkdownListLine(line);
}

function collectLineBounds(doc, from, to) {
  const end = to > from && doc[to - 1] === "\n" ? to - 1 : to;
  const lines = [];
  let lineStart = doc.lastIndexOf("\n", Math.max(0, from - 1)) + 1;

  while (lineStart <= end && lineStart <= doc.length) {
    let lineEnd = doc.indexOf("\n", lineStart);
    if (lineEnd < 0) lineEnd = doc.length;
    lines.push({
      from: lineStart,
      to: lineEnd,
      text: doc.slice(lineStart, lineEnd),
    });
    if (lineEnd === doc.length) break;
    lineStart = lineEnd + 1;
  }

  return lines;
}

function applyTextChanges(doc, changes) {
  let next = "";
  let cursor = 0;

  for (const change of changes) {
    next += doc.slice(cursor, change.from);
    next += change.insert;
    cursor = change.to;
  }

  return next + doc.slice(cursor);
}

function mapPosition(position, changes) {
  let mapped = position;

  for (const change of changes) {
    const removed = change.to - change.from;
    const inserted = change.insert.length;

    if (position < change.from) break;
    if (position <= change.to) {
      mapped = change.from + inserted;
    } else {
      mapped += inserted - removed;
    }
  }

  return mapped;
}

export function markdownListIndentChange(doc, from, to, direction) {
  const changes = [];

  for (const line of collectLineBounds(doc, from, to)) {
    const list = parseIndentableMarkdownListLine(line.text);
    if (!list) continue;

    if (direction === "indent") {
      changes.push({ from: line.from, to: line.from, insert: "  " });
      continue;
    }

    if (direction !== "outdent" || list.indentLength === 0) continue;

    const indent = line.text.slice(0, list.indentLength);
    const removeLength = indent.startsWith("\t")
      ? 1
      : Math.min(2, indent.match(/^ */)[0].length);
    if (removeLength === 0) continue;

    changes.push({
      from: line.from,
      to: line.from + removeLength,
      insert: "",
    });
  }

  if (changes.length === 0) return null;

  return {
    changes,
    selection: {
      anchor: mapPosition(from, changes),
      head: mapPosition(to, changes),
    },
    doc: applyTextChanges(doc, changes),
  };
}

export function indentMarkdownListInView(view, direction) {
  if (viewIsComposing(view)) return false;

  const range = view.state.selection.main;
  const result = markdownListIndentChange(
    view.state.doc.toString(),
    range.from,
    range.to,
    direction,
  );
  if (!result) return false;

  view.dispatch({
    changes: result.changes,
    selection: result.selection,
  });
  return true;
}

export function viewContent(view) {
  return view.state.doc.toString();
}

export function replaceViewContent(view, content) {
  const current = viewContent(view);
  if (current === content) return false;

  view.dispatch({
    changes: { from: 0, to: current.length, insert: content },
  });
  return true;
}

export function parseMarkdownHeadingLine(line) {
  const match = /^(#{1,6})([ \t]+)(\S.*)$/.exec(line);
  if (!match) return null;

  return {
    level: match[1].length,
    markerLength: match[1].length + match[2].length,
    text: match[3],
  };
}

function rangeOverlaps(existing, from, to) {
  return existing.some((range) => from < range.to && to > range.from);
}

function addInlineSpan(spans, occupied, type, from, to, openTo, closeFrom) {
  if (openTo >= closeFrom || rangeOverlaps(occupied, from, to)) return;
  spans.push({ type, from, to, openTo, closeFrom });
  occupied.push({ from, to });
}

function collectInlineCodeSpans(line, spans, occupied) {
  const regexp = /`([^`\n]+)`/g;
  for (const match of line.matchAll(regexp)) {
    addInlineSpan(
      spans,
      occupied,
      "inline_code",
      match.index,
      match.index + match[0].length,
      match.index + 1,
      match.index + match[0].length - 1,
    );
  }
}

function isEscaped(line, index) {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function isValidInlineMathBoundary(line, open, close) {
  const afterOpen = line[open + 1];
  const beforeClose = line[close - 1];
  if (!afterOpen || !beforeClose) return false;
  if (/\s/.test(afterOpen) || /\s/.test(beforeClose)) return false;
  if (/\d/.test(line[open - 1] ?? "") && /\d/.test(afterOpen)) return false;
  return true;
}

function collectInlineMathSpans(line, spans, occupied) {
  let from = 0;
  while (from < line.length) {
    const open = line.indexOf("$", from);
    if (open < 0) break;

    if (line[open - 1] === "$" || line[open + 1] === "$" || isEscaped(line, open)) {
      from = open + 1;
      continue;
    }

    let close = line.indexOf("$", open + 1);
    while (
      close >= 0 &&
      (line[close - 1] === "$" || line[close + 1] === "$" || isEscaped(line, close))
    ) {
      close = line.indexOf("$", close + 1);
    }
    if (close < 0) break;

    if (isValidInlineMathBoundary(line, open, close)) {
      addInlineSpan(spans, occupied, "inline_math", open, close + 1, open + 1, close);
    }
    from = close + 1;
  }
}

function collectFootnoteReferenceSpans(line, spans, occupied) {
  const regexp = /\[\^([^\]\s]+)\]/g;
  for (const match of line.matchAll(regexp)) {
    const from = match.index;
    const to = from + match[0].length;
    if (rangeOverlaps(occupied, from, to)) continue;

    spans.push({
      type: "footnote_ref",
      from,
      to,
      label: match[1],
    });
    occupied.push({ from, to });
  }
}

const imageRegexp = /!\[([^\]\n]*)\]\(([^)\s\n]+)(?:\s+"([^"]*)")?\)/g;

function collectImageRanges(line, occupied) {
  for (const match of line.matchAll(imageRegexp)) {
    occupied.push({
      from: match.index,
      to: match.index + match[0].length,
    });
  }
}

export function parseMarkdownImageSpans(line) {
  return Array.from(line.matchAll(imageRegexp), (match) => ({
    from: match.index,
    to: match.index + match[0].length,
    alt: match[1],
    src: match[2],
    title: match[3] ?? "",
  }));
}

export function parseMarkdownTaskLine(line) {
  const match = /^(\s*[-*+]\s+\[([ xX])\]\s+)/.exec(line);
  if (!match) return null;

  return {
    markerLength: match[1].length,
    checked: match[2].toLowerCase() === "x",
  };
}

export function parseMarkdownListLine(line) {
  if (parseMarkdownTaskLine(line)) return null;

  const match = /^(\s*)((?:[-*+])|(?:\d{1,9}[.)]))([ \t]+)/.exec(line);
  if (!match) return null;

  return {
    markerLength: match[0].length,
    indentLength: match[1].length,
    marker: match[2],
    ordered: /^\d/.test(match[2]),
  };
}

export function parseMarkdownHorizontalRuleLine(line) {
  if (!/^[ \t]{0,3}(?:[-*_][ \t]*){3,}$/.test(line)) return null;

  const compact = line.trim().replace(/[ \t]/g, "");
  if (compact.length < 3) return null;

  const marker = compact[0];
  if (!["-", "*", "_"].includes(marker)) return null;
  if ([...compact].some((char) => char !== marker)) return null;

  return { marker };
}

export function parseMarkdownBlockquoteLine(line) {
  const match = /^([ \t]{0,3}>[ \t]?)/.exec(line);
  if (!match) return null;

  return {
    markerLength: match[1].length,
  };
}

export function parseMarkdownFootnoteDefinitionLine(line) {
  const match = /^(\s*\[\^([^\]\s]+)\]:[ \t]*)/.exec(line);
  if (!match) return null;

  return {
    markerLength: match[1].length,
    label: match[2],
  };
}

export function parseMarkdownCodeFenceLine(line) {
  const match = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) return null;

  const fence = match[1];
  const info = match[2].trim();
  if (fence[0] === "`" && info.includes("`")) return null;

  return {
    marker: fence[0],
    markerLength: fence.length,
    info,
  };
}

export function collectMarkdownCodeBlocks(lines) {
  const blocks = [];
  let open = null;

  lines.forEach((line, index) => {
    const fence = parseMarkdownCodeFenceLine(line);
    if (!fence) return;

    const lineNumber = index + 1;
    if (!open) {
      open = { ...fence, fromLine: lineNumber };
      return;
    }

    const closesBlock =
      fence.marker === open.marker &&
      fence.markerLength >= open.markerLength &&
      fence.info === "";
    if (!closesBlock) return;

    blocks.push({
      fromLine: open.fromLine,
      toLine: lineNumber,
      info: open.info,
    });
    open = null;
  });

  if (open) {
    blocks.push({
      fromLine: open.fromLine,
      toLine: lines.length,
      info: open.info,
    });
  }

  return blocks;
}

export function collectMarkdownFrontMatterBlock(lines) {
  if (lines.length < 2 || lines[0].trim() !== "---") return null;

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line === "---" || line === "...") {
      return {
        fromLine: 1,
        toLine: index + 1,
      };
    }
  }

  return null;
}

function parseMarkdownMathFenceLine(line) {
  const trimmed = line.trim();
  if (trimmed === "$$") return { kind: "fence" };

  const singleLine = /^\$\$(.+)\$\$$/.exec(trimmed);
  if (!singleLine) return null;

  const source = singleLine[1].trim();
  return source ? { kind: "single", source } : null;
}

export function collectMarkdownMathBlocks(lines) {
  const blocks = [];
  let openLine = null;

  lines.forEach((line, index) => {
    const fence = parseMarkdownMathFenceLine(line);
    if (!fence) return;

    const lineNumber = index + 1;
    if (openLine !== null) {
      if (fence.kind === "fence") {
        blocks.push({
          fromLine: openLine,
          toLine: lineNumber,
          source: lines.slice(openLine, index).join("\n").trim(),
        });
        openLine = null;
      }
      return;
    }

    if (fence.kind === "single") {
      blocks.push({
        fromLine: lineNumber,
        toLine: lineNumber,
        source: fence.source,
      });
      return;
    }

    openLine = lineNumber;
  });

  return blocks;
}

function parseMarkdownTableRow(line) {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return null;

  const body = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
  const trimmedBody = body.endsWith("|") ? body.slice(0, -1) : body;
  const cells = trimmedBody.split("|").map((cell) => cell.trim());
  if (cells.length < 2 || cells.every((cell) => cell.length === 0)) return null;

  return cells;
}

function isMarkdownTableSeparator(line) {
  const cells = parseMarkdownTableRow(line);
  if (!cells) return false;

  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

export function collectMarkdownTableBlocks(lines) {
  const blocks = [];
  let index = 0;

  while (index < lines.length - 1) {
    const header = parseMarkdownTableRow(lines[index]);
    if (!header || !isMarkdownTableSeparator(lines[index + 1])) {
      index += 1;
      continue;
    }

    const fromLine = index + 1;
    let rowIndex = index + 2;
    while (rowIndex < lines.length && parseMarkdownTableRow(lines[rowIndex])) {
      rowIndex += 1;
    }

    blocks.push({
      fromLine,
      toLine: rowIndex,
    });
    index = rowIndex;
  }

  return blocks;
}

function collectLinkSpans(line, spans, occupied) {
  const regexp = /(!?)\[([^\]\n]+)\]\(([^)\n]+)\)/g;
  for (const match of line.matchAll(regexp)) {
    if (match[1]) continue;

    const from = match.index;
    const openTo = from + 1;
    const closeFrom = openTo + match[2].length;
    const to = from + match[0].length;
    addInlineSpan(spans, occupied, "link", from, to, openTo, closeFrom);
  }
}

function collectDelimitedInlineSpans(line, spans, occupied, type, marker) {
  let from = 0;
  while (from < line.length) {
    const open = line.indexOf(marker, from);
    if (open < 0) break;
    const contentFrom = open + marker.length;
    const close = line.indexOf(marker, contentFrom);
    if (close < 0) break;

    const content = line.slice(contentFrom, close);
    const to = close + marker.length;
    if (content.trim()) {
      addInlineSpan(spans, occupied, type, open, to, contentFrom, close);
    }
    from = to;
  }
}

export function parseMarkdownInlineSpans(line) {
  const spans = [];
  const occupied = [];

  collectImageRanges(line, occupied);
  collectLinkSpans(line, spans, occupied);
  collectInlineCodeSpans(line, spans, occupied);
  collectInlineMathSpans(line, spans, occupied);
  collectFootnoteReferenceSpans(line, spans, occupied);
  collectDelimitedInlineSpans(line, spans, occupied, "strong", "**");
  collectDelimitedInlineSpans(line, spans, occupied, "strong", "__");
  collectDelimitedInlineSpans(line, spans, occupied, "strikethrough", "~~");
  collectDelimitedInlineSpans(line, spans, occupied, "emphasis", "*");
  collectDelimitedInlineSpans(line, spans, occupied, "emphasis", "_");

  return spans.sort((a, b) => a.from - b.from || b.to - a.to);
}

export function normalizeViewMode(mode) {
  if (typeof mode !== "string") return "hybrid";
  const normalized = mode.trim().toLowerCase();
  return ["source", "hybrid", "preview"].includes(normalized)
    ? normalized
    : "hybrid";
}

export function normalizeLayoutSize(rect) {
  const width = Math.round(Number(rect?.width ?? 0));
  const height = Math.round(Number(rect?.height ?? 0));

  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;

  return { width, height };
}

export function nextLayoutSize(previousSize, rect) {
  const nextSize = normalizeLayoutSize(rect);
  if (!nextSize) return null;

  if (
    previousSize?.width === nextSize.width &&
    previousSize?.height === nextSize.height
  ) {
    return null;
  }

  return nextSize;
}

export function layoutChangedEvent(tabId, size) {
  return {
    type: "layout_changed",
    tab_id: tabId,
    width: size.width,
    height: size.height,
  };
}

export function setViewMode(entry, mode) {
  const normalized = normalizeViewMode(mode);
  entry.viewMode = normalized;
  if (entry.view?.dom?.dataset) {
    entry.view.dom.dataset.viewMode = normalized;
  }
  return normalized;
}

export function attachViewToTab({
  editorRegistry,
  view,
  tabId,
  container,
  instanceId = "",
  initialContent,
  viewMode = "hybrid",
  refreshEditorLayout,
  setEditorPreferences: setPreferences = setEditorPreferences,
  setViewMode: setMode = setViewMode,
}) {
  view.dom.dataset.tabId = tabId;

  const entry = {
    view,
    instanceId,
    dioxus: null,
    suppressChange: true,
    viewMode: "hybrid",
    preferences: normalizeEditorPreferences(),
  };
  editorRegistry.set(tabId, entry);
  setPreferences(entry, entry.preferences);
  setMode(entry, viewMode);

  replaceViewContent(view, initialContent ?? "");
  entry.suppressChange = false;

  if (view.dom.parentElement !== container) {
    container.replaceChildren(view.dom);
  }
  refreshEditorLayout(view);
}

export function recycleEditor(editorRegistry, tabId) {
  const entry = editorRegistry.get(tabId);
  if (!entry) return false;

  entry.onRecycle?.();
  editorRegistry.delete(tabId);
  entry.dioxus = null;
  delete entry.view.dom.dataset.tabId;
  delete entry.view.dom.dataset.viewMode;
  return true;
}

export function handleRustMessage(editorRegistry, tabId, message, options = {}) {
  const entry = editorRegistry.get(tabId);
  if (!entry && message.type !== "destroy") return "missing";

  const applyFormat = options.applyFormat ?? applyFormatToView;
  const refreshEditorLayout = options.refreshEditorLayout ?? (() => {});
  const setMode = options.setViewMode ?? setViewMode;
  const setPreferences = options.setEditorPreferences ?? setEditorPreferences;

  switch (message.type) {
    case "set_content": {
      if (!entry) return "missing";
      const next = message.content ?? "";
      if (viewContent(entry.view) !== next) {
        entry.suppressChange = true;
        replaceViewContent(entry.view, next);
        entry.suppressChange = false;
      }
      return "updated";
    }
    case "apply_format":
      if (!entry) return "missing";
      applyFormat(entry.view, message.kind);
      return "formatted";
    case "insert_markdown":
      if (!entry) return "missing";
      insertMarkdownInView(entry.view, message.markdown);
      return "markdown_inserted";
    case "set_view_mode":
      if (!entry) return "missing";
      setMode(entry, message.mode);
      refreshEditorLayout(entry.view);
      return "mode_updated";
    case "set_preferences":
      if (!entry) return "missing";
      setPreferences(entry, message);
      return "preferences_updated";
    case "focus":
      if (!entry) return "missing";
      entry.view.focus();
      refreshEditorLayout(entry.view);
      return "focused";
    case "refresh_layout":
      if (!entry) return "missing";
      refreshEditorLayout(entry.view);
      return "refreshed";
    case "destroy":
      if (entry?.instanceId && message.instance_id && entry.instanceId !== message.instance_id) {
        return "destroyed";
      }
      recycleEditor(editorRegistry, tabId);
      return "destroyed";
    default:
      return "ignored";
  }
}
