export const formatSpecs = {
  bold: ["**", "**", "bold text"],
  italic: ["*", "*", "italic text"],
  link: ["[", "](https://)", "link text"],
  image: ["![", "](assets/image.png)", "alt text"],
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
  initialContent,
  viewMode = "hybrid",
  refreshEditorLayout,
  setViewMode: setMode = setViewMode,
}) {
  view.dom.dataset.tabId = tabId;

  const entry = { view, dioxus: null, suppressChange: true, viewMode: "hybrid" };
  editorRegistry.set(tabId, entry);
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
    case "set_view_mode":
      if (!entry) return "missing";
      setMode(entry, message.mode);
      refreshEditorLayout(entry.view);
      return "mode_updated";
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
      recycleEditor(editorRegistry, tabId);
      return "destroyed";
    default:
      return "ignored";
  }
}
