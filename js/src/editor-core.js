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

export function nextEditorPreferences(currentPreferences, preferences) {
  return {
    ...normalizeEditorPreferences(currentPreferences),
    ...normalizeEditorPreferences(preferences),
  };
}

export function editorPreferencesEqual(left, right) {
  const normalizedLeft = normalizeEditorPreferences(left);
  const normalizedRight = normalizeEditorPreferences(right);
  return normalizedLeft.autoLinkPaste === normalizedRight.autoLinkPaste;
}

export function setEditorPreferences(entry, preferences) {
  const nextPreferences = nextEditorPreferences(entry.preferences, preferences);
  if (
    entry.preferences &&
    editorPreferencesEqual(entry.preferences, nextPreferences)
  ) {
    return entry.preferences;
  }

  entry.preferences = nextPreferences;
  return entry.preferences;
}

export function normalizeBlockHints(hints) {
  if (!hints || typeof hints !== "object") return null;

  const revision = Number(hints.revision);
  if (!Number.isSafeInteger(revision) || revision < 0) return null;

  const fallback =
    hints.fallback && typeof hints.fallback === "object"
      ? hints.fallback
      : { type: "none" };
  const blocks = Array.isArray(hints.blocks) ? hints.blocks : [];

  return {
    revision,
    fallback,
    blocks,
  };
}

export function blockHintsEqual(left, right) {
  return left?.revision === right?.revision;
}

export function setBlockHints(entry, hints) {
  const nextHints = normalizeBlockHints(hints);
  if (!nextHints) return null;

  if (blockHintsEqual(entry.blockHints, nextHints)) {
    return entry.blockHints;
  }

  entry.blockHints = nextHints;
  return entry.blockHints;
}

export function markdownDecorationTier(
  selectionLineRanges,
  fromLine,
  toLine,
  nearDistance = 2,
) {
  if (!Number.isSafeInteger(fromLine) || !Number.isSafeInteger(toLine)) {
    return "remote";
  }
  if (fromLine < 1 || toLine < fromLine) return "remote";

  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const range of selectionLineRanges ?? []) {
    const selectionFrom = Number(range?.fromLine);
    const selectionTo = Number(range?.toLine);
    if (
      !Number.isSafeInteger(selectionFrom) ||
      !Number.isSafeInteger(selectionTo) ||
      selectionFrom < 1 ||
      selectionTo < selectionFrom
    ) {
      continue;
    }

    if (selectionFrom <= toLine && selectionTo >= fromLine) {
      return "current";
    }

    const distance =
      selectionTo < fromLine
        ? fromLine - selectionTo
        : selectionFrom - toLine;
    nearestDistance = Math.min(nearestDistance, distance);
  }

  return nearestDistance <= nearDistance ? "near" : "remote";
}

export function shouldUseFullDocumentHybridScan(docLength, maxLength = 256 * 1024) {
  const length = Number(docLength);
  const max = Number(maxLength);
  if (!Number.isFinite(length) || !Number.isFinite(max)) return false;
  return length >= 0 && length <= max;
}

export const hybridDecorationPolicies = Object.freeze({
  heading: {
    budget: "visible_line",
    fallback: "source",
    levels: { current: "full", near: "full", remote: "full" },
  },
  emphasis: {
    budget: "near_visible_line",
    fallback: "source",
    levels: { current: "full", near: "full", remote: "full" },
  },
  link: {
    budget: "near_visible_line",
    fallback: "source",
    levels: { current: "full", near: "full", remote: "full" },
  },
  image: {
    budget: "near_visible_line",
    fallback: "source",
    levels: { current: "source", near: "widget", remote: "widget" },
  },
  task: {
    budget: "near_visible_line",
    fallback: "source",
    levels: { current: "widget", near: "widget", remote: "widget" },
  },
  list: {
    budget: "near_visible_line",
    fallback: "source",
    levels: { current: "full", near: "full", remote: "full" },
  },
  code: {
    budget: "visible_block",
    fallback: "source",
    levels: { current: "full", near: "full", remote: "full" },
  },
  mermaid: {
    budget: "visible_block",
    fallback: "source",
    levels: { current: "full", near: "full", remote: "full" },
  },
  math: {
    budget: "near_visible_block",
    fallback: "source",
    levels: { current: "source", near: "full", remote: "full" },
  },
  quote: {
    budget: "near_visible_line",
    fallback: "source",
    levels: { current: "full", near: "full", remote: "full" },
  },
  rule: {
    budget: "near_visible_line",
    fallback: "source",
    levels: { current: "full", near: "full", remote: "full" },
  },
  table: {
    budget: "visible_block",
    fallback: "source",
    levels: { current: "full", near: "full", remote: "full" },
  },
  footnote: {
    budget: "near_visible_line",
    fallback: "source",
    levels: { current: "full", near: "full", remote: "full" },
  },
});

export function hybridDecorationPolicy(kind) {
  return hybridDecorationPolicies[kind] ?? {
    budget: "near_visible_line",
    fallback: "source",
    levels: { current: "source", near: "full", remote: "source" },
  };
}

export function hybridDecorationLevel(kind, tier) {
  const policy = hybridDecorationPolicy(kind);
  return policy.levels?.[tier] ?? policy.fallback;
}

function normalizedSelectionRange(range) {
  const from = safeInteger(range?.from);
  const to = safeInteger(range?.to ?? range?.from);
  if (from === null || to === null) return null;
  return {
    from: Math.min(from, to),
    to: Math.max(from, to),
  };
}

export function selectionTouchesTextRange(selectionRanges, textRange) {
  const from = safeInteger(textRange?.from);
  const to = safeInteger(textRange?.to);
  if (from === null || to === null || to <= from) return false;

  return (selectionRanges ?? []).some((range) => {
    const selection = normalizedSelectionRange(range);
    if (!selection) return false;
    if (selection.from === selection.to) {
      return selection.from >= from && selection.from < to;
    }

    return selection.from < to && selection.to > from;
  });
}

export function selectionOverlapsTextRange(selectionRanges, textRange) {
  const from = safeInteger(textRange?.from);
  const to = safeInteger(textRange?.to);
  if (from === null || to === null || to <= from) return false;

  return (selectionRanges ?? []).some((range) => {
    const selection = normalizedSelectionRange(range);
    if (!selection || selection.from === selection.to) return false;
    return selection.from < to && selection.to > from;
  });
}

export function collapsedSelectionTouchesTextRange(selectionRanges, textRange) {
  const from = safeInteger(textRange?.from);
  const to = safeInteger(textRange?.to);
  if (from === null || to === null || to <= from) return false;

  return (selectionRanges ?? []).some((range) => {
    const selection = normalizedSelectionRange(range);
    return Boolean(
      selection &&
        selection.from === selection.to &&
        selection.from >= from &&
        selection.from < to,
    );
  });
}

export function relaxedPointerCoordsAdjustment(input = {}) {
  const rawPos = safeInteger(input.rawPos);
  const rawLineNumber = safeInteger(input.rawLineNumber);
  const rawLineFrom = safeInteger(input.rawLineFrom);
  const previousBlockTo = safeInteger(input.previousBlockTo);
  const eventX = finiteNumber(input.eventX);
  const eventY = finiteNumber(input.eventY);
  const rawLineTop = finiteNumber(input.rawLineTop);
  const previousBlockBottom = finiteNumber(input.previousBlockBottom);
  const documentTop = finiteNumber(input.documentTop) ?? 0;
  const defaultLineHeight = finiteNumber(input.defaultLineHeight) ?? 18;

  if (
    rawPos === null ||
    rawLineNumber === null ||
    rawLineFrom === null ||
    previousBlockTo === null ||
    eventX === null ||
    eventY === null ||
    rawLineTop === null ||
    previousBlockBottom === null
  ) {
    return null;
  }
  if (rawPos <= 0 || rawLineNumber <= 1) return null;

  const topLeadingSlack = clampNumber(defaultLineHeight * 0.38, 6, 14);
  if (eventY >= rawLineTop + topLeadingSlack) return null;
  if (previousBlockTo > rawLineFrom) return null;

  const previousBottom = documentTop + previousBlockBottom;
  return {
    x: eventX,
    y: Math.min(previousBottom - 1, eventY - Math.max(2, topLeadingSlack * 0.5)),
  };
}

export function hybridPointerHitZone(input = {}) {
  const eventY = finiteNumber(input.eventY);
  const textTop = finiteNumber(input.textTop);
  const textBottom = finiteNumber(input.textBottom);
  const lineTop = finiteNumber(input.lineTop);
  const lineBottom = finiteNumber(input.lineBottom);

  if (
    eventY === null ||
    textTop === null ||
    textBottom === null ||
    lineTop === null ||
    lineBottom === null ||
    textBottom <= textTop ||
    lineBottom <= lineTop
  ) {
    return "unknown";
  }

  if (eventY >= textTop && eventY <= textBottom) return "text";
  if (eventY >= lineTop && eventY < textTop) return "gap_before_text";
  if (eventY > textBottom && eventY <= lineBottom) return "gap_after_text";
  return "outside";
}

export function hybridPointerSelectionTarget(input = {}) {
  const zone = input.zone ?? hybridPointerHitZone(input);
  const line = safeInteger(input.line);
  const previousLine = safeInteger(input.previousLine);
  const nextLine = safeInteger(input.nextLine);

  if (zone === "text") return line;
  if (zone === "gap_after_text") return nextLine ?? line;
  if (zone === "gap_before_text") return previousLine ?? line;
  return null;
}

export function hybridGlyphSelectionRect(input = {}) {
  const selectionLeft = finiteNumber(input.selectionLeft);
  const selectionRight = finiteNumber(input.selectionRight);
  const textLeft = finiteNumber(input.textLeft);
  const textRight = finiteNumber(input.textRight);
  const textTop = finiteNumber(input.textTop);
  const textBottom = finiteNumber(input.textBottom);

  if (
    selectionLeft === null ||
    selectionRight === null ||
    textLeft === null ||
    textRight === null ||
    textTop === null ||
    textBottom === null ||
    selectionRight <= selectionLeft ||
    textRight <= textLeft ||
    textBottom <= textTop
  ) {
    return null;
  }

  const left = Math.max(selectionLeft, textLeft);
  const right = Math.min(selectionRight, textRight);
  if (right <= left) return null;

  return {
    left,
    right,
    top: textTop,
    bottom: textBottom,
  };
}

export function hybridHeadingDecorationLevel(tier, markerRange, selectionRanges) {
  const level = hybridDecorationLevel("heading", tier);
  return level;
}

export function inlineMarkdownMarkersTouched(span, selectionRanges, lineFrom = 0) {
  const spanFrom = safeInteger(span?.from);
  const openTo = safeInteger(span?.openTo);
  const closeFrom = safeInteger(span?.closeFrom);
  const spanTo = safeInteger(span?.to);
  const offset = safeInteger(lineFrom);
  if (
    spanFrom === null ||
    openTo === null ||
    closeFrom === null ||
    spanTo === null ||
    offset === null
  ) {
    return false;
  }

  return (
    collapsedSelectionTouchesTextRange(selectionRanges, {
      from: offset + spanFrom,
      to: offset + openTo,
    }) ||
    collapsedSelectionTouchesTextRange(selectionRanges, {
      from: offset + closeFrom,
      to: offset + spanTo,
    })
  );
}

export function markdownTaskCheckboxToggleChange(doc, checkPosition) {
  if (typeof doc !== "string") return null;

  const position = safeInteger(checkPosition);
  if (position === null || position <= 0 || position >= doc.length - 1) {
    return null;
  }
  if (doc[position - 1] !== "[" || doc[position + 1] !== "]") return null;

  const current = doc[position];
  if (current !== " " && current !== "x" && current !== "X") return null;

  const insert = current.toLowerCase() === "x" ? " " : "x";
  return {
    changes: { from: position, to: position + 1, insert },
    selection: { anchor: position + 1 },
    doc: `${doc.slice(0, position)}${insert}${doc.slice(position + 1)}`,
  };
}

function safeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function utf8ByteLengthForCodePoint(codePoint) {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

export function utf8ByteOffsetToStringIndex(text, byteOffset) {
  if (typeof text !== "string") return null;

  const target = safeInteger(byteOffset);
  if (target === null || target < 0) return null;

  let bytes = 0;
  for (let index = 0; index < text.length;) {
    if (bytes === target) return index;

    const codePoint = text.codePointAt(index);
    const codeUnits = codePoint > 0xffff ? 2 : 1;
    const nextBytes = bytes + utf8ByteLengthForCodePoint(codePoint);
    if (target > bytes && target < nextBytes) return null;

    bytes = nextBytes;
    index += codeUnits;
  }

  return bytes === target ? text.length : null;
}

export function utf8ByteRangeToStringRange(text, fromByte, toByte) {
  const from = safeInteger(fromByte);
  const to = safeInteger(toByte);
  if (from === null || to === null || from < 0 || to < from) return null;

  const fromIndex = utf8ByteOffsetToStringIndex(text, from);
  const toIndex = utf8ByteOffsetToStringIndex(text, to);
  if (fromIndex === null || toIndex === null || toIndex < fromIndex) return null;

  return { from: fromIndex, to: toIndex };
}

function normalizeMarkdownRange(range) {
  if (!range || typeof range !== "object") return null;

  const startByte = safeInteger(range.startByte ?? range.start_byte);
  const endByte = safeInteger(range.endByte ?? range.end_byte);
  const startLine = safeInteger(range.startLine ?? range.start_line);
  const endLine = safeInteger(range.endLine ?? range.end_line);
  if (
    startByte === null ||
    endByte === null ||
    startLine === null ||
    endLine === null ||
    startByte < 0 ||
    endByte < startByte ||
    startLine < 1 ||
    endLine < startLine
  ) {
    return null;
  }

  return { startByte, endByte, startLine, endLine };
}

function legacyMarkdownBlockSourceRange(block) {
  const startByte = safeInteger(block.fromByte ?? block.startByte ?? block.start_byte);
  const endByte = safeInteger(block.toByte ?? block.endByte ?? block.end_byte);
  const startLine = safeInteger(block.fromLine ?? block.startLine ?? block.start_line);
  const endLine = safeInteger(block.toLine ?? block.endLine ?? block.end_line ?? startLine);

  if (
    startByte === null ||
    endByte === null ||
    startLine === null ||
    endLine === null ||
    startByte < 0 ||
    endByte < startByte ||
    startLine < 1 ||
    endLine < startLine
  ) {
    return null;
  }

  return { startByte, endByte, startLine, endLine };
}

export function markdownBlockEditRanges(block) {
  if (!block || typeof block !== "object") return null;

  const source =
    normalizeMarkdownRange(block.ranges?.source) ??
    legacyMarkdownBlockSourceRange(block);
  if (!source) return null;

  const content = normalizeMarkdownRange(block.ranges?.content);
  const markers = Array.isArray(block.ranges?.markers)
    ? block.ranges.markers.map(normalizeMarkdownRange).filter(Boolean)
    : [];

  return { source, content, markers };
}

export function markdownBlockLineRange(block) {
  const ranges = markdownBlockEditRanges(block);
  if (ranges) {
    return {
      fromLine: ranges.source.startLine,
      toLine: ranges.source.endLine,
    };
  }

  const fromLine = safeInteger(block?.fromLine ?? block?.startLine ?? block?.start_line);
  const toLine = safeInteger(block?.toLine ?? block?.endLine ?? block?.end_line ?? fromLine);
  if (fromLine === null || toLine === null || fromLine < 1 || toLine < fromLine) {
    return null;
  }

  return { fromLine, toLine };
}

export function markdownBlockStringRange(markdown, block) {
  if (!block || typeof block !== "object") return null;

  const source = markdownBlockEditRanges(block)?.source;
  if (!source) return null;

  return utf8ByteRangeToStringRange(markdown, source.startByte, source.endByte);
}

export function hybridBlockState(block, options = {}) {
  const fallback = options.fallback ?? block?.fallback;
  if (fallback?.type && fallback.type !== "none") return "source_fallback";

  const renderStatus = options.renderStatus ?? block?.renderStatus;
  if (
    options.renderError ||
    block?.renderError ||
    renderStatus?.type === "error" ||
    renderStatus?.state === "error"
  ) {
    return "error";
  }

  const range = markdownBlockLineRange(block);
  if (!range) return "source_fallback";

  const tier = markdownDecorationTier(
    options.selectionLineRanges ?? [],
    range.fromLine,
    range.toLine,
    options.nearDistance,
  );

  return tier === "current" ? "editing" : "rendered";
}

function hybridTraceFallback(reason) {
  return typeof reason === "string" && reason.length > 0 ? reason : "none";
}

function hybridTraceBlockKind(block) {
  const kind = block?.kind?.type;
  return typeof kind === "string" && kind.length > 0 ? kind : "unknown";
}

export function hybridInputTraceContext(
  hints,
  selectionLineRanges,
  cursorLine,
  nearDistance,
) {
  if (!hints || typeof hints !== "object") {
    return {
      hybridBlockKind: "none",
      hybridBlockState: "source_fallback",
      hybridBlockTier: "none",
      hybridFallbackReason: "missing_hints",
    };
  }

  const fallback = hints.fallback;
  if (fallback?.type && fallback.type !== "none") {
    return {
      hybridBlockKind: "source_fallback",
      hybridBlockState: "source_fallback",
      hybridBlockTier: "source_fallback",
      hybridFallbackReason: hybridTraceFallback(fallback.reason ?? fallback.type),
    };
  }

  const line = safeInteger(cursorLine);
  if (line === null) {
    return {
      hybridBlockKind: "none",
      hybridBlockState: "source_fallback",
      hybridBlockTier: "none",
      hybridFallbackReason: "invalid_cursor",
    };
  }

  const block = (Array.isArray(hints.blocks) ? hints.blocks : []).find((candidate) => {
    const range = markdownBlockLineRange(candidate);
    return range && line >= range.fromLine && line <= range.toLine;
  });
  if (!block) {
    return {
      hybridBlockKind: "none",
      hybridBlockState: "rendered",
      hybridBlockTier: "remote",
      hybridFallbackReason: "none",
    };
  }

  const range = markdownBlockLineRange(block);
  const tier = markdownDecorationTier(
    selectionLineRanges ?? [],
    range.fromLine,
    range.toLine,
    nearDistance,
  );

  return {
    hybridBlockKind: hybridTraceBlockKind(block),
    hybridBlockState: hybridBlockState(block, {
      selectionLineRanges,
      nearDistance,
    }),
    hybridBlockTier: tier,
    hybridFallbackReason: "none",
  };
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

export function viewIsComposing(view) {
  return Boolean(view.composing || view.compositionStarted);
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

export function pastePlainTextInView(view, pastedText, preferences) {
  const text = pastedText ?? "";
  if (!text) return false;
  if (pasteMarkdownLinkInView(view, text, preferences)) return true;

  const range = view.state.selection.main;
  if (range.from === range.to) return false;

  view.dispatch({
    changes: { from: range.from, to: range.to, insert: text },
    selection: { anchor: range.from + text.length },
  });
  return true;
}

function normalizedCursorOffset(cursorOffset, length) {
  if (cursorOffset === null || cursorOffset === undefined) return length;
  const offset = Number(cursorOffset);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > length) {
    return length;
  }
  return offset;
}

export function insertMarkdownInView(view, markdown, cursorOffset = null) {
  const text = markdown ?? "";
  if (!text) return false;

  const range = view.state.selection.main;
  const selectionOffset = normalizedCursorOffset(cursorOffset, text.length);
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: text },
    selection: { anchor: range.from + selectionOffset },
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

function parseMarkdownListBackspaceLine(line) {
  const task = /^(\s*)[-*+][ \t]+\[[ xX]\][ \t]+/.exec(line);
  if (task) {
    return {
      markerLength: task[0].length,
      indentLength: task[1].length,
    };
  }

  return parseMarkdownListLine(line);
}

export function markdownListBackspaceChange(doc, cursor) {
  const lineStart = doc.lastIndexOf("\n", cursor - 1) + 1;
  let lineEnd = doc.indexOf("\n", cursor);
  if (lineEnd < 0) lineEnd = doc.length;

  const line = doc.slice(lineStart, lineEnd);
  const list = parseMarkdownListBackspaceLine(line);
  if (!list) return null;

  const markerEnd = lineStart + list.markerLength;
  if (cursor !== markerEnd) return null;

  if (list.indentLength > 0) {
    const indent = line.slice(0, list.indentLength);
    const removeLength = indent.startsWith("\t")
      ? 1
      : Math.min(2, indent.match(/^ */)[0].length);
    if (removeLength === 0) return null;

    return {
      changes: { from: lineStart, to: lineStart + removeLength, insert: "" },
      selection: { anchor: cursor - removeLength },
      doc: `${doc.slice(0, lineStart)}${doc.slice(lineStart + removeLength)}`,
    };
  }

  return {
    changes: { from: lineStart, to: markerEnd, insert: "" },
    selection: { anchor: lineStart },
    doc: `${doc.slice(0, lineStart)}${doc.slice(markerEnd)}`,
  };
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

export function handleMarkdownBackspace(view) {
  if (viewIsComposing(view)) return false;

  const range = view.state.selection.main;
  if (range.from !== range.to) return false;

  const result = markdownListBackspaceChange(view.state.doc.toString(), range.from);
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

export function sanitizeMarkdownImageSrc(src) {
  const trimmed = String(src ?? "").trim();
  if (!trimmed) return "";

  const normalized = Array.from(trimmed)
    .filter((character) => !/[\s\u0000-\u001f\u007f]/.test(character))
    .join("")
    .toLowerCase();
  const schemeMatch = /^([a-z][a-z0-9+.-]*):/.exec(normalized);
  if (!schemeMatch) return trimmed;

  return ["http", "https"].includes(schemeMatch[1]) ? trimmed : "";
}

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

export function parseStandaloneMarkdownImageBlock(line) {
  const text = String(line ?? "");
  const leading = text.length - text.trimStart().length;
  const trimmed = text.trim();
  const [image] = parseMarkdownImageSpans(trimmed);

  return image && image.from === 0 && image.to === trimmed.length
    ? { ...image, from: leading, to: leading + trimmed.length }
    : null;
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

export function markdownCodeFenceInfoRange(line, lineFrom = 0) {
  if (typeof line !== "string") return null;
  const fence = parseMarkdownCodeFenceLine(line);
  const offset = safeInteger(lineFrom);
  if (!fence || offset === null) return null;

  const rest = line.slice(fence.markerLength);
  const whitespaceLength = rest.length - rest.trimStart().length;
  const from = offset + fence.markerLength + whitespaceLength;
  return { from, to: offset + line.length };
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

function splitMarkdownTableCells(body) {
  const cells = [];
  let cell = "";

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char === "|" && !isEscaped(body, index)) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }

  cells.push(cell);
  return cells;
}

function parseMarkdownTableRowParts(line) {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return null;

  const body = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
  const trimmedBody = body.endsWith("|") ? body.slice(0, -1) : body;
  const cells = splitMarkdownTableCells(trimmedBody).map((cell) => cell.trim());
  if (cells.length < 2 || cells.every((cell) => cell.length === 0)) return null;

  return {
    cells,
    indent: line.match(/^\s*/)?.[0] ?? "",
    leadingPipe: trimmed.startsWith("|"),
    trailingPipe: trimmed.endsWith("|"),
  };
}

function parseMarkdownTableRow(line) {
  return parseMarkdownTableRowParts(line)?.cells ?? null;
}

function isMarkdownTableSeparator(line) {
  const cells = parseMarkdownTableRow(line);
  if (!cells) return false;

  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function markdownTableAlignment(cell) {
  if (/^:-{3,}:$/.test(cell)) return "center";
  if (/^:-{3,}$/.test(cell)) return "left";
  if (/^-{3,}:$/.test(cell)) return "right";
  return null;
}

export function parseMarkdownTable(markdown) {
  if (typeof markdown !== "string") return null;

  const lines = markdown.split(/\r\n|\n/);
  if (lines.length < 2 || !isMarkdownTableSeparator(lines[1] ?? "")) {
    return null;
  }

  const header = parseMarkdownTableRowParts(lines[0]);
  const separator = parseMarkdownTableRowParts(lines[1]);
  if (!header || !separator) return null;

  const columnCount = header.cells.length;
  const rows = [{ kind: "header", sourceRowIndex: 0, cells: header.cells }];

  for (let index = 2; index < lines.length; index += 1) {
    const row = parseMarkdownTableRowParts(lines[index]);
    if (!row) return null;
    rows.push({
      kind: "body",
      sourceRowIndex: index,
      cells: row.cells,
    });
  }

  return {
    columnCount,
    alignments: separator.cells.slice(0, columnCount).map(markdownTableAlignment),
    rows: rows.map((row) => ({
      ...row,
      cells: Array.from(
        { length: columnCount },
        (_, index) => row.cells[index] ?? "",
      ),
    })),
  };
}

function parseMarkdownTableDocument(markdown) {
  if (typeof markdown !== "string") return null;

  const lineEnding = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = markdown.split(/\r\n|\n/);
  if (lines.length < 2 || !isMarkdownTableSeparator(lines[1] ?? "")) {
    return null;
  }

  const parts = lines.map(parseMarkdownTableRowParts);
  if (parts.some((part) => !part)) return null;

  const columnCount = parts[0].cells.length;
  if (columnCount < 2) return null;

  return { lineEnding, parts, columnCount };
}

function renderMarkdownTableDocument(table) {
  return table.parts.map(renderMarkdownTableRow).join(table.lineEnding);
}

export function appendMarkdownTableRow(markdown) {
  return insertMarkdownTableRowAfter(markdown, Number.MAX_SAFE_INTEGER);
}

export function deleteMarkdownTableLastRow(markdown) {
  const table = parseMarkdownTableDocument(markdown);
  if (!table || table.parts.length <= 2) return null;

  return deleteMarkdownTableRow(markdown, table.parts.length - 1);
}

export function appendMarkdownTableColumn(markdown, header = "Column") {
  return insertMarkdownTableColumnAfter(markdown, Number.MAX_SAFE_INTEGER, header);
}

export function deleteMarkdownTableLastColumn(markdown) {
  const table = parseMarkdownTableDocument(markdown);
  if (!table || table.columnCount <= 2) return null;

  return deleteMarkdownTableColumn(markdown, table.columnCount - 1);
}

export function insertMarkdownTableRowAfter(markdown, rowIndex) {
  const table = parseMarkdownTableDocument(markdown);
  if (!table) return null;

  const targetRow = safeInteger(rowIndex);
  if (targetRow === null || targetRow < 0) return null;

  const insertionIndex =
    targetRow <= 1
      ? 2
      : Math.min(targetRow + 1, table.parts.length);
  const template =
    table.parts[Math.min(Math.max(insertionIndex - 1, 0), table.parts.length - 1)] ??
    table.parts[0];

  table.parts.splice(insertionIndex, 0, {
    ...template,
    cells: Array.from({ length: table.columnCount }, () => ""),
  });
  return renderMarkdownTableDocument(table);
}

export function deleteMarkdownTableRow(markdown, rowIndex) {
  const table = parseMarkdownTableDocument(markdown);
  if (!table || table.parts.length <= 2) return null;

  const targetRow = safeInteger(rowIndex);
  if (targetRow === null || targetRow <= 1 || targetRow >= table.parts.length) {
    return null;
  }

  table.parts.splice(targetRow, 1);
  return renderMarkdownTableDocument(table);
}

export function insertMarkdownTableColumnAfter(markdown, columnIndex, header = "Column") {
  const table = parseMarkdownTableDocument(markdown);
  if (!table) return null;

  const targetColumn = safeInteger(columnIndex);
  if (targetColumn === null || targetColumn < 0) return null;
  const insertionIndex = Math.min(targetColumn + 1, table.columnCount);

  table.parts.forEach((part, index) => {
    if (index === 0) {
      part.cells.splice(insertionIndex, 0, escapeMarkdownTableCell(header));
    } else if (index === 1) {
      part.cells.splice(insertionIndex, 0, "---");
    } else {
      part.cells.splice(insertionIndex, 0, "");
    }
  });
  return renderMarkdownTableDocument(table);
}

export function deleteMarkdownTableColumn(markdown, columnIndex) {
  const table = parseMarkdownTableDocument(markdown);
  if (!table || table.columnCount <= 2) return null;

  const targetColumn = safeInteger(columnIndex);
  if (
    targetColumn === null ||
    targetColumn < 0 ||
    targetColumn >= table.columnCount
  ) {
    return null;
  }

  table.parts.forEach((part) => {
    part.cells.splice(targetColumn, 1);
  });
  return renderMarkdownTableDocument(table);
}

export function nextMarkdownTableCellPosition(
  rowCount,
  columnCount,
  rowIndex,
  columnIndex,
  direction = 1,
) {
  const rows = safeInteger(rowCount);
  const columns = safeInteger(columnCount);
  const row = safeInteger(rowIndex);
  const column = safeInteger(columnIndex);
  const step = Number(direction) < 0 ? -1 : 1;

  if (
    rows === null ||
    columns === null ||
    row === null ||
    column === null ||
    rows <= 0 ||
    columns <= 0 ||
    row < 0 ||
    column < 0 ||
    row >= rows ||
    column >= columns
  ) {
    return null;
  }

  const cellCount = rows * columns;
  const current = row * columns + column;
  const next = (current + step + cellCount) % cellCount;
  return {
    rowIndex: Math.floor(next / columns),
    columnIndex: next % columns,
  };
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

function escapeMarkdownTableCell(value) {
  const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
  let escaped = "";

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    escaped += char === "|" && !isEscaped(text, index) ? "\\|" : char;
  }

  return escaped;
}

function renderMarkdownTableRow(parts) {
  const body = parts.cells.map((cell) => ` ${cell} `).join("|");
  return `${parts.indent}${parts.leadingPipe ? "|" : ""}${body}${parts.trailingPipe ? "|" : ""}`;
}

export function rewriteMarkdownTableCell(markdown, rowIndex, columnIndex, value) {
  if (typeof markdown !== "string") return null;

  const targetRow = safeInteger(rowIndex);
  const targetColumn = safeInteger(columnIndex);
  if (targetRow === null || targetColumn === null || targetRow < 0 || targetColumn < 0) {
    return null;
  }

  const lineEnding = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = markdown.split(/\r\n|\n/);
  if (targetRow >= lines.length || targetRow === 1) return null;
  if (!isMarkdownTableSeparator(lines[1] ?? "")) return null;

  const header = parseMarkdownTableRowParts(lines[0]);
  const row = parseMarkdownTableRowParts(lines[targetRow]);
  if (!header || !row || targetColumn >= header.cells.length) return null;

  while (row.cells.length < header.cells.length) {
    row.cells.push("");
  }

  row.cells[targetColumn] = escapeMarkdownTableCell(value);
  lines[targetRow] = renderMarkdownTableRow(row);
  return lines.join(lineEnding);
}

export function nextMermaidBlockState(currentState = {}, event = {}) {
  const current =
    currentState && typeof currentState === "object"
      ? { mode: currentState.mode ?? currentState.state ?? "rendered", ...currentState }
      : { mode: "rendered" };
  const type = event?.type;

  switch (type) {
    case "pointer_down":
    case "edit":
      return { ...current, mode: "editing", pending: false, error: null };
    case "source_changed":
      return {
        ...current,
        mode: "editing",
        source: event.source ?? current.source ?? "",
        dirty: true,
        error: null,
      };
    case "blur":
    case "confirm":
      return { ...current, mode: "rendered", pending: true, dirty: false, error: null };
    case "render_succeeded":
      return {
        ...current,
        mode: "rendered",
        pending: false,
        svg: event.svg ?? current.svg ?? "",
        error: null,
      };
    case "render_failed":
      return {
        ...current,
        mode: "error",
        pending: false,
        error: String(event.error ?? "Mermaid render failed"),
      };
    case "source_fallback":
      return { ...current, mode: "source_fallback", pending: false };
    default:
      return current;
  }
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

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clampRatio(value) {
  return clampNumber(value, 0, 1);
}

export function modeSupportsEditorScroll(mode) {
  const normalized = normalizeViewMode(mode);
  return normalized === "source" || normalized === "hybrid";
}

export function normalizeScrollSnapshot(snapshot) {
  if (!snapshot) return null;

  const scrollHeight = Math.max(0, finiteNumber(snapshot.scrollHeight) ?? 0);
  const clientHeight = Math.max(0, finiteNumber(snapshot.clientHeight) ?? 0);
  const scrollWidth = Math.max(0, finiteNumber(snapshot.scrollWidth) ?? 0);
  const clientWidth = Math.max(0, finiteNumber(snapshot.clientWidth) ?? 0);
  const maxTop = Math.max(0, scrollHeight - clientHeight);
  const maxLeft = Math.max(0, scrollWidth - clientWidth);
  const top = clampNumber(finiteNumber(snapshot.top) ?? 0, 0, maxTop);
  const left = clampNumber(finiteNumber(snapshot.left) ?? 0, 0, maxLeft);
  const topRatio =
    maxTop > 0
      ? top / maxTop
      : clampRatio(finiteNumber(snapshot.topRatio) ?? 0);
  const leftRatio =
    maxLeft > 0
      ? left / maxLeft
      : clampRatio(finiteNumber(snapshot.leftRatio) ?? 0);

  return {
    top,
    left,
    topRatio,
    leftRatio,
    scrollHeight,
    clientHeight,
    scrollWidth,
    clientWidth,
  };
}

export function readScrollSnapshot(scroller) {
  if (!scroller) return null;
  return normalizeScrollSnapshot({
    top: scroller.scrollTop,
    left: scroller.scrollLeft,
    scrollHeight: scroller.scrollHeight,
    clientHeight: scroller.clientHeight,
    scrollWidth: scroller.scrollWidth,
    clientWidth: scroller.clientWidth,
  });
}

export function restoreScrollSnapshot(scroller, snapshot) {
  if (!scroller) return false;

  const normalized = normalizeScrollSnapshot(snapshot);
  if (!normalized) return false;

  const scrollHeight = Math.max(0, finiteNumber(scroller.scrollHeight) ?? 0);
  const clientHeight = Math.max(0, finiteNumber(scroller.clientHeight) ?? 0);
  const scrollWidth = Math.max(0, finiteNumber(scroller.scrollWidth) ?? 0);
  const clientWidth = Math.max(0, finiteNumber(scroller.clientWidth) ?? 0);
  const maxTop = Math.max(0, scrollHeight - clientHeight);
  const maxLeft = Math.max(0, scrollWidth - clientWidth);

  scroller.scrollTop = clampNumber(normalized.topRatio * maxTop, 0, maxTop);
  scroller.scrollLeft = clampNumber(normalized.leftRatio * maxLeft, 0, maxLeft);
  return true;
}

function docText(doc) {
  return typeof doc?.toString === "function" ? doc.toString() : null;
}

function docLineCount(doc) {
  if (Number.isSafeInteger(doc?.lines) && doc.lines >= 1) {
    return doc.lines;
  }

  const text = docText(doc);
  if (typeof text !== "string") return null;
  return text.length === 0 ? 1 : text.split(/\r\n|\n/).length;
}

function docLineAtNumber(doc, lineNumber) {
  if (typeof doc?.line === "function") {
    try {
      return doc.line(lineNumber);
    } catch (_) {
      return null;
    }
  }

  const text = docText(doc);
  const target = safeInteger(lineNumber);
  if (typeof text !== "string" || target === null || target < 1) {
    return null;
  }

  let currentLine = 1;
  let lineStart = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "\n") continue;

    if (currentLine === target) {
      const lineEnd = index > 0 && text[index - 1] === "\r" ? index - 1 : index;
      return {
        number: currentLine,
        from: lineStart,
        to: lineEnd,
        text: text.slice(lineStart, lineEnd),
      };
    }

    currentLine += 1;
    lineStart = index + 1;
  }

  if (currentLine === target) {
    return {
      number: currentLine,
      from: lineStart,
      to: text.length,
      text: text.slice(lineStart),
    };
  }

  return null;
}

export function scrollEditorViewToLine(view, lineNumber, options = {}) {
  if (!view || typeof view.dispatch !== "function") return false;

  const lineCount = docLineCount(view.state?.doc);
  if (lineCount === null) return false;

  const requested = safeInteger(lineNumber) ?? 1;
  const clamped = clampNumber(requested, 1, Math.max(1, lineCount));
  const line = docLineAtNumber(view.state?.doc, clamped);
  if (!line) return false;

  const scrollEffect =
    typeof options.scrollEffect === "function"
      ? options.scrollEffect(line.from)
      : null;
  const transaction = {
    selection: { anchor: line.from },
  };
  if (scrollEffect) {
    transaction.effects = scrollEffect;
  }

  view.dispatch(transaction);
  if (options.focus !== false && typeof view.focus === "function") {
    view.focus();
  }
  return true;
}

const PREVIEW_HEADING_SELECTOR =
  ".mn-preview h1, .mn-preview h2, .mn-preview h3, .mn-preview h4, .mn-preview h5, .mn-preview h6";

export function scrollPreviewToHeading(scroller, headingIndex, options = {}) {
  if (!scroller || typeof scroller.querySelectorAll !== "function") return false;

  const index = safeInteger(headingIndex);
  if (index === null || index < 0) return false;

  const headings = Array.from(scroller.querySelectorAll(PREVIEW_HEADING_SELECTOR));
  const heading = headings[index];
  if (
    !heading ||
    typeof heading.getBoundingClientRect !== "function" ||
    typeof scroller.getBoundingClientRect !== "function"
  ) {
    return false;
  }

  const scrollerRect = scroller.getBoundingClientRect();
  const headingRect = heading.getBoundingClientRect();
  const offset = Math.max(0, finiteNumber(options.offset) ?? 12);
  const top = Math.max(
    0,
    headingRect.top - scrollerRect.top + scroller.scrollTop - offset,
  );

  if (typeof scroller.scrollTo === "function") {
    scroller.scrollTo({
      top,
      behavior: options.behavior ?? "smooth",
    });
  } else {
    scroller.scrollTop = top;
  }
  return true;
}

export function activeOutlineHeadingIndex(lineNumbers, activeLine) {
  const targetLine = safeInteger(activeLine);
  if (targetLine === null || targetLine < 1) return -1;

  let activeIndex = -1;
  for (let index = 0; index < (lineNumbers?.length ?? 0); index += 1) {
    const lineNumber = safeInteger(lineNumbers[index]);
    if (lineNumber === null || lineNumber < 1) continue;
    if (lineNumber > targetLine) break;
    activeIndex = index;
  }

  return activeIndex;
}

export function activePreviewHeadingIndex(headingOffsets, scrollTop, threshold = 24) {
  const top = finiteNumber(scrollTop);
  if (top === null || !Array.isArray(headingOffsets) || headingOffsets.length === 0) {
    return -1;
  }

  const targetOffset = top + Math.max(0, finiteNumber(threshold) ?? 0);
  let activeIndex = 0;

  for (let index = 0; index < headingOffsets.length; index += 1) {
    const offset = finiteNumber(headingOffsets[index]);
    if (offset === null) continue;
    if (offset > targetOffset) break;
    activeIndex = index;
  }

  return activeIndex;
}

export function saveModeScrollSnapshot(store, tabId, mode, snapshot) {
  if (!(store instanceof Map)) return null;
  if (typeof tabId !== "string" || tabId.length === 0) return null;

  const normalized = normalizeScrollSnapshot(snapshot);
  if (!normalized) return null;

  const normalizedMode = normalizeViewMode(mode);
  const record = store.get(tabId) ?? {
    latestMode: normalizedMode,
    modes: {},
  };

  record.latestMode = normalizedMode;
  record.modes[normalizedMode] = normalized;
  store.set(tabId, record);
  return normalized;
}

export function latestModeScrollSnapshot(store, tabId) {
  if (!(store instanceof Map)) return null;
  if (typeof tabId !== "string" || tabId.length === 0) return null;

  const record = store.get(tabId);
  if (!record) return null;
  return record.modes?.[record.latestMode] ?? null;
}

export function setViewMode(entry, mode) {
  const normalized = normalizeViewMode(mode);
  if (
    entry.viewMode === normalized &&
    entry.view?.dom?.dataset?.viewMode === normalized
  ) {
    return normalized;
  }

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
    blockHints: null,
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
  const setHints = options.setBlockHints ?? setBlockHints;

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
      insertMarkdownInView(entry.view, message.markdown, message.cursor_offset);
      return "markdown_inserted";
    case "set_view_mode": {
      if (!entry) return "missing";
      const nextMode = normalizeViewMode(message.mode);
      if (
        entry.viewMode === nextMode &&
        entry.view?.dom?.dataset?.viewMode === nextMode
      ) {
        return "mode_unchanged";
      }
      setMode(entry, message.mode);
      refreshEditorLayout(entry.view);
      return "mode_updated";
    }
    case "set_preferences":
      if (!entry) return "missing";
      if (
        entry.preferences &&
        editorPreferencesEqual(
          entry.preferences,
          nextEditorPreferences(entry.preferences, message),
        )
      ) {
        return "preferences_unchanged";
      }
      setPreferences(entry, message);
      return "preferences_updated";
    case "set_block_hints": {
      if (!entry) return "missing";
      const current = entry.blockHints;
      const next = setHints(entry, message.hints);
      if (!next) return "block_hints_invalid";
      if (blockHintsEqual(current, next)) return "block_hints_unchanged";
      return "block_hints_updated";
    }
    case "focus":
      if (!entry) return "missing";
      entry.view.focus();
      refreshEditorLayout(entry.view);
      return "focused";
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
