import { EditorState, StateEffect, StateField } from "@codemirror/state";
import {
  EditorView,
  Decoration,
  ViewPlugin,
  keymap,
  lineNumbers,
  drawSelection,
  highlightActiveLine,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import {
  applyFormatToView,
  attachViewToTab as attachViewToTabCore,
  handleRustMessage as handleRustMessageCore,
  parseMarkdownHeadingLine,
  recycleEditor as recycleEditorCore,
  setViewMode as setViewModeCore,
} from "./editor-core.js";

// tabId → { view, dioxus, suppressChange }
const editorRegistry = new Map();

const setViewModeEffect = StateEffect.define();
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

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "var(--mn-editor-font-size, 15px)",
    backgroundColor: "var(--mn-editor-bg, #fffdf8)",
    color: "var(--mn-editor-ink, var(--mn-ink, #25211a))",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: 'var(--mn-editor-font, "Cascadia Code", "JetBrains Mono", "Fira Code", monospace)',
    lineHeight: "var(--mn-editor-line-height, 1.75)",
    padding: "24px 28px",
  },
  ".cm-content": {
    minHeight: "100%",
    caretColor: "var(--mn-accent, #b24b2f)",
    maxWidth: "860px",
    color: "var(--mn-editor-ink, var(--mn-ink, #25211a))",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
    color: "var(--mn-ink-3, #a08f78)",
    paddingTop: "24px",
    paddingRight: "8px",
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
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--mn-selection, rgba(178,75,47,.15))",
  },
  ".cm-focused": { outline: "none" },
  ".cm-panels": {
    backgroundColor: "var(--mn-surface, #fbf6ea)",
    color: "var(--mn-ink, #25211a)",
  },
  ".cm-line.cm-hybrid-heading-line": {
    letterSpacing: "0",
  },
  ".cm-hybrid-heading": {
    color: "var(--mn-ink)",
    fontFamily: "var(--mn-editor-heading-font, Georgia, serif)",
    fontWeight: "700",
    lineHeight: "1.25",
  },
  ".cm-hybrid-heading-1": { fontSize: "1.9em" },
  ".cm-hybrid-heading-2": { fontSize: "1.55em" },
  ".cm-hybrid-heading-3": { fontSize: "1.3em" },
  ".cm-hybrid-heading-4": { fontSize: "1.12em" },
  ".cm-hybrid-heading-5, .cm-hybrid-heading-6": {
    fontSize: "1em",
    letterSpacing: "0",
    textTransform: "uppercase",
  },
});

const markdownHighlightStyle = HighlightStyle.define([
  { tag: t.heading1, color: "var(--mn-ink)", fontWeight: "700" },
  { tag: t.heading2, color: "var(--mn-ink)", fontWeight: "700" },
  { tag: t.heading3, color: "var(--mn-ink)", fontWeight: "600" },
  { tag: [t.heading4, t.heading5, t.heading6], color: "var(--mn-ink)", fontWeight: "600" },

  { tag: t.strong, color: "var(--mn-ink)", fontWeight: "700" },
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

  { tag: t.keyword, color: "var(--mn-accent)", fontWeight: "500" },
  { tag: [t.atom, t.bool, t.number], color: "var(--mn-accent-strong)" },
  { tag: t.string, color: "var(--mn-ink-2)" },
  { tag: t.regexp, color: "var(--mn-accent-strong)" },
  { tag: [t.variableName, t.propertyName], color: "var(--mn-ink)" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--mn-ink)", fontWeight: "500" },
  { tag: [t.typeName, t.className], color: "var(--mn-accent-strong)" },
  { tag: [t.operator, t.punctuation], color: "var(--mn-ink-2)" },
  { tag: t.definition(t.variableName), color: "var(--mn-ink)" },
]);

function selectionTouchesLine(state, line) {
  return state.selection.ranges.some((range) => {
    const fromLine = state.doc.lineAt(range.from);
    const toLine = state.doc.lineAt(range.to);
    return line.number >= fromLine.number && line.number <= toLine.number;
  });
}

function buildHybridHeadingDecorations(view) {
  if (view.state.field(viewModeField, false) !== "hybrid") {
    return Decoration.none;
  }

  const decorations = [];
  let lastLineNumber = -1;

  for (const range of view.visibleRanges) {
    for (let pos = range.from; pos <= range.to;) {
      const line = view.state.doc.lineAt(pos);
      pos = line.to + 1;

      if (line.number === lastLineNumber) continue;
      lastLineNumber = line.number;
      if (selectionTouchesLine(view.state, line)) continue;

      const heading = parseMarkdownHeadingLine(line.text);
      if (!heading) continue;

      const markerTo = line.from + heading.markerLength;
      decorations.push(
        Decoration.line({
          class: `cm-hybrid-heading-line cm-hybrid-heading-line-${heading.level}`,
        }).range(line.from),
      );
      decorations.push(Decoration.replace({}).range(line.from, markerTo));
      decorations.push(
        Decoration.mark({
          class: `cm-hybrid-heading cm-hybrid-heading-${heading.level}`,
        }).range(markerTo, line.to),
      );
    }
  }

  return Decoration.set(decorations, true);
}

function viewModeChanged(update) {
  return update.transactions.some((transaction) =>
    transaction.effects.some((effect) => effect.is(setViewModeEffect)),
  );
}

const hybridHeadingPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildHybridHeadingDecorations(view);
    }

    update(update) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        viewModeChanged(update)
      ) {
        this.decorations = buildHybridHeadingDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);

/* Extensions read the current tab id from `view.dom.dataset.tabId` instead of
 * closure-capturing it. That lets a single view be recycled across tabs
 * without rebuilding all its extensions — the hot path for pool reuse. */
function buildExtensions() {
  const routedSaveKeymap = keymap.of([
    {
      key: "Mod-s",
      run(view) {
        const tabId = view.dom.dataset.tabId;
        if (!tabId) return false;
        editorRegistry.get(tabId)?.dioxus?.send({
          type: "save_requested",
          tab_id: tabId,
        });
        return true;
      },
    },
    { key: "Mod-b", run(view) { applyFormatToView(view, "bold"); return true; } },
    { key: "Mod-i", run(view) { applyFormatToView(view, "italic"); return true; } },
    { key: "Mod-k", run(view) { applyFormatToView(view, "link"); return true; } },
  ]);

  return [
    viewModeField,
    lineNumbers(),
    drawSelection(),
    highlightActiveLine(),
    history(),
    markdown({ codeLanguages: languages }),
    syntaxHighlighting(markdownHighlightStyle, { fallback: true }),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    routedSaveKeymap,
    hybridHeadingPlugin,
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

function setEditorViewMode(entry, mode) {
  const normalized = setViewModeCore(entry, mode);
  entry.view?.dispatch({
    effects: setViewModeEffect.of(normalized),
  });
  return normalized;
}

function attachViewToTab(view, tabId, container, initialContent, viewMode) {
  attachViewToTabCore({
    editorRegistry,
    view,
    tabId,
    container,
    initialContent,
    viewMode,
    refreshEditorLayout,
    setViewMode: setEditorViewMode,
  });
}

function ensureEditor({ tabId, containerId, initialContent, viewMode }) {
  const container = document.getElementById(containerId);
  if (!container) throw new Error(`Editor container not found: ${containerId}`);

  const existing = editorRegistry.get(tabId);
  if (existing) {
    // Re-attach in case the DOM got detached across re-renders.
    if (existing.view.dom.parentElement !== container) {
      container.replaceChildren(existing.view.dom);
    }
    existing.view.dom.dataset.tabId = tabId;
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
    attachViewToTab(view, tabId, container, initialContent, viewMode);
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
    const entry = { view, dioxus: null, suppressChange: false, viewMode: "hybrid" };
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
  recycleEditorCore(editorRegistry, tabId);
}

window.papyroEditor = {
  ensureEditor,

  handleRustMessage(tabId, message) {
    return handleRustMessageCore(editorRegistry, tabId, message, {
      applyFormat: applyFormatToView,
      refreshEditorLayout,
      setViewMode: setEditorViewMode,
    });
  },

  attachChannel(tabId, dioxus) {
    const entry = editorRegistry.get(tabId);
    if (entry) entry.dioxus = dioxus;
  },
};
