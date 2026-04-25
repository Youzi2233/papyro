import test from "node:test";
import assert from "node:assert/strict";
import {
  applyFormatToView,
  attachViewToTab,
  handleRustMessage,
  normalizeViewMode,
  recycleEditor,
} from "../src/editor-core.js";

function fakeContainer() {
  return {
    replaceChildren(dom) {
      dom.parentElement = this;
    },
  };
}

function fakeView(initialDoc = "", selection = { from: 0, to: 0 }, onDispatch = () => {}) {
  let doc = initialDoc;
  let main = { ...selection };

  const view = {
    dom: { dataset: {}, parentElement: null },
    focused: false,
    requestMeasureCalled: false,
    get state() {
      return {
        doc: { toString: () => doc },
        selection: { main },
        sliceDoc: (from, to) => doc.slice(from, to),
      };
    },
    dispatch(spec) {
      if (spec.changes) {
        const { from, to, insert } = spec.changes;
        doc = `${doc.slice(0, from)}${insert}${doc.slice(to)}`;
      }
      if (spec.selection) {
        main = { from: spec.selection.anchor, to: spec.selection.head };
      }
      onDispatch(view, spec);
    },
    focus() {
      this.focused = true;
    },
    requestMeasure() {
      this.requestMeasureCalled = true;
    },
  };

  return view;
}

function attach(registry, view, tabId, initialContent = "") {
  attachViewToTab({
    editorRegistry: registry,
    view,
    tabId,
    container: fakeContainer(),
    initialContent,
    refreshEditorLayout: () => {},
  });
}

test("normalize_view_mode accepts known modes and falls back to hybrid", () => {
  assert.equal(normalizeViewMode("Source"), "source");
  assert.equal(normalizeViewMode("HYBRID"), "hybrid");
  assert.equal(normalizeViewMode("preview"), "preview");
  assert.equal(normalizeViewMode("unknown"), "hybrid");
});

test("set_content updates content without echoing content_changed", () => {
  const registry = new Map();
  const sent = [];
  const view = fakeView("old", { from: 0, to: 0 }, () => {
    const tabId = view.dom.dataset.tabId;
    const entry = registry.get(tabId);
    if (entry && !entry.suppressChange) {
      entry.dioxus?.send({ type: "content_changed", tab_id: tabId });
    }
  });

  attach(registry, view, "tab-a", "old");
  registry.get("tab-a").dioxus = { send: (message) => sent.push(message) };

  const result = handleRustMessage(registry, "tab-a", {
    type: "set_content",
    content: "new",
  });

  assert.equal(result, "updated");
  assert.equal(view.state.doc.toString(), "new");
  assert.deepEqual(sent, []);
});

test("apply_format wraps a selected range", () => {
  const view = fakeView("word", { from: 0, to: 4 });

  assert.equal(applyFormatToView(view, "bold"), true);

  assert.equal(view.state.doc.toString(), "**word**");
  assert.deepEqual(view.state.selection.main, { from: 2, to: 6 });
  assert.equal(view.focused, true);
});

test("apply_format inserts fallback text for empty selection", () => {
  const view = fakeView("", { from: 0, to: 0 });

  assert.equal(applyFormatToView(view, "link"), true);

  assert.equal(view.state.doc.toString(), "[link text](https://)");
  assert.deepEqual(view.state.selection.main, { from: 1, to: 10 });
});

test("tab recycle detaches old tab and prevents stale content routing", () => {
  const registry = new Map();
  const view = fakeView("first");

  attach(registry, view, "tab-a", "A");
  assert.equal(registry.has("tab-a"), true);

  recycleEditor(registry, "tab-a");
  attach(registry, view, "tab-b", "B");

  assert.equal(registry.has("tab-a"), false);
  assert.equal(registry.has("tab-b"), true);
  assert.equal(view.dom.dataset.tabId, "tab-b");
  assert.equal(view.state.doc.toString(), "B");
  assert.equal(
    handleRustMessage(registry, "tab-a", { type: "set_content", content: "stale" }),
    "missing",
  );
  assert.equal(view.state.doc.toString(), "B");
});

test("set_view_mode stores mode on entry and editor dom", () => {
  const registry = new Map();
  const view = fakeView("body");

  attachViewToTab({
    editorRegistry: registry,
    view,
    tabId: "tab-a",
    container: fakeContainer(),
    initialContent: "body",
    viewMode: "Source",
    refreshEditorLayout: () => {},
  });

  assert.equal(registry.get("tab-a").viewMode, "source");
  assert.equal(view.dom.dataset.viewMode, "source");

  const result = handleRustMessage(registry, "tab-a", {
    type: "set_view_mode",
    mode: "Preview",
  });

  assert.equal(result, "mode_updated");
  assert.equal(registry.get("tab-a").viewMode, "preview");
  assert.equal(view.dom.dataset.viewMode, "preview");
});
