import { EditorState } from "@codemirror/state";
import {
  EditorView,
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

function withSelection(view, before, after, fallback = "") {
  const { state } = view;
  const range = state.selection.main;
  const selected = state.sliceDoc(range.from, range.to);
  const content = selected || fallback;
  const insert = `${before}${content}${after}`;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: {
      anchor: range.from + before.length,
      head: range.from + before.length + content.length,
    },
  });
  view.focus();
}

function applyFormat(view, kind) {
  switch (kind) {
    case "bold":      withSelection(view, "**", "**", "bold text"); break;
    case "italic":    withSelection(view, "*", "*", "italic text"); break;
    case "link":      withSelection(view, "[", "](https://)", "link text"); break;
    case "image":     withSelection(view, "![", "](assets/image.png)", "alt text"); break;
    case "code_block":withSelection(view, "```\n", "\n```", "code"); break;
    case "heading1":  withSelection(view, "# ", "", "Heading 1"); break;
    case "heading2":  withSelection(view, "## ", "", "Heading 2"); break;
    case "heading3":  withSelection(view, "### ", "", "Heading 3"); break;
    case "quote":     withSelection(view, "> ", "", "quote"); break;
    case "ul":        withSelection(view, "- ", "", "list item"); break;
    case "ol":        withSelection(view, "1. ", "", "list item"); break;
  }
}

// tabId → { view, dioxus, suppressChange }
const editorRegistry = new Map();

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
    { key: "Mod-b", run(view) { applyFormat(view, "bold"); return true; } },
    { key: "Mod-i", run(view) { applyFormat(view, "italic"); return true; } },
    { key: "Mod-k", run(view) { applyFormat(view, "link"); return true; } },
  ]);

  return [
    lineNumbers(),
    drawSelection(),
    highlightActiveLine(),
    history(),
    markdown({ codeLanguages: languages }),
    syntaxHighlighting(markdownHighlightStyle, { fallback: true }),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    routedSaveKeymap,
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

function attachViewToTab(view, tabId, container, initialContent) {
  view.dom.dataset.tabId = tabId;

  // Register BEFORE dispatching so the updateListener finds the entry and
  // respects suppressChange instead of echoing the swap back to Rust as
  // user-typed content.
  const entry = { view, dioxus: null, suppressChange: true };
  editorRegistry.set(tabId, entry);

  const current = view.state.doc.toString();
  const next = initialContent ?? "";
  if (current !== next) {
    view.dispatch({ changes: { from: 0, to: current.length, insert: next } });
  }
  entry.suppressChange = false;

  if (view.dom.parentElement !== container) {
    container.replaceChildren(view.dom);
  }
  refreshEditorLayout(view);
}

function ensureEditor({ tabId, containerId, initialContent }) {
  const container = document.getElementById(containerId);
  if (!container) throw new Error(`Editor container not found: ${containerId}`);

  const existing = editorRegistry.get(tabId);
  if (existing) {
    // Re-attach in case the DOM got detached across re-renders.
    if (existing.view.dom.parentElement !== container) {
      container.replaceChildren(existing.view.dom);
    }
    existing.view.dom.dataset.tabId = tabId;
    refreshEditorLayout(existing.view);
    return existing.view;
  }

  let view;
  if (spareViews.length > 0) {
    view = spareViews.pop();
    resetViewState(view, initialContent ?? "");
    attachViewToTab(view, tabId, container, initialContent);
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
    editorRegistry.set(tabId, { view, dioxus: null, suppressChange: false });
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
  if (!entry) return;
  editorRegistry.delete(tabId);
  entry.dioxus = null;
  delete entry.view.dom.dataset.tabId;
}

window.papyroEditor = {
  ensureEditor,

  handleRustMessage(tabId, message) {
    const entry = editorRegistry.get(tabId);
    if (!entry && message.type !== "destroy") return "missing";

    switch (message.type) {
      case "set_content": {
        if (!entry) return "missing";
        const next = message.content ?? "";
        const current = entry.view.state.doc.toString();
        if (current !== next) {
          entry.suppressChange = true;
          entry.view.dispatch({
            changes: { from: 0, to: current.length, insert: next },
          });
          entry.suppressChange = false;
        }
        return "updated";
      }
      case "apply_format":
        if (!entry) return "missing";
        applyFormat(entry.view, message.kind);
        return "formatted";
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
        recycleEditor(tabId);
        return "destroyed";
      default:
        return "ignored";
    }
  },

  attachChannel(tabId, dioxus) {
    const entry = editorRegistry.get(tabId);
    if (entry) entry.dioxus = dioxus;
  },
};
