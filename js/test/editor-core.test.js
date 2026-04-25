import test from "node:test";
import assert from "node:assert/strict";
import {
  applyFormatToView,
  attachViewToTab,
  handleRustMessage,
  normalizeViewMode,
  parseMarkdownHeadingLine,
  parseMarkdownHorizontalRuleLine,
  parseMarkdownImageSpans,
  parseMarkdownInlineSpans,
  parseMarkdownTaskLine,
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

test("parse_markdown_heading_line recognizes atx headings", () => {
  assert.deepEqual(parseMarkdownHeadingLine("### Section"), {
    level: 3,
    markerLength: 4,
    text: "Section",
  });
  assert.deepEqual(parseMarkdownHeadingLine("#\tTabbed"), {
    level: 1,
    markerLength: 2,
    text: "Tabbed",
  });
  assert.equal(parseMarkdownHeadingLine("#NoSpace"), null);
  assert.equal(parseMarkdownHeadingLine("####### Too deep"), null);
});

test("parse_markdown_inline_spans recognizes strong emphasis and code", () => {
  assert.deepEqual(parseMarkdownInlineSpans("A **bold** and *soft* ~~old~~ `code`"), [
    { type: "strong", from: 2, to: 10, openTo: 4, closeFrom: 8 },
    { type: "emphasis", from: 15, to: 21, openTo: 16, closeFrom: 20 },
    { type: "strikethrough", from: 22, to: 29, openTo: 24, closeFrom: 27 },
    { type: "inline_code", from: 30, to: 36, openTo: 31, closeFrom: 35 },
  ]);
});

test("parse_markdown_inline_spans recognizes links but skips images", () => {
  assert.deepEqual(parseMarkdownInlineSpans("See [docs](https://example.test)"), [
    { type: "link", from: 4, to: 32, openTo: 5, closeFrom: 9 },
  ]);
  assert.deepEqual(parseMarkdownInlineSpans("![alt](assets/image.png)"), []);
});

test("parse_markdown_image_spans recognizes image syntax", () => {
  assert.deepEqual(parseMarkdownImageSpans('![Alt text](assets/a.png "Title")'), [
    {
      from: 0,
      to: 33,
      alt: "Alt text",
      src: "assets/a.png",
      title: "Title",
    },
  ]);
});

test("parse_markdown_task_line recognizes task markers", () => {
  assert.deepEqual(parseMarkdownTaskLine("- [ ] todo"), {
    markerLength: 6,
    checked: false,
  });
  assert.deepEqual(parseMarkdownTaskLine("  * [X] done"), {
    markerLength: 8,
    checked: true,
  });
  assert.equal(parseMarkdownTaskLine("- todo"), null);
});

test("parse_markdown_horizontal_rule_line recognizes thematic breaks", () => {
  assert.deepEqual(parseMarkdownHorizontalRuleLine("---"), { marker: "-" });
  assert.deepEqual(parseMarkdownHorizontalRuleLine("  * * *"), { marker: "*" });
  assert.deepEqual(parseMarkdownHorizontalRuleLine("___"), { marker: "_" });
  assert.equal(parseMarkdownHorizontalRuleLine("--"), null);
  assert.equal(parseMarkdownHorizontalRuleLine("--- text"), null);
  assert.equal(parseMarkdownHorizontalRuleLine("- _ -"), null);
});

test("parse_markdown_inline_spans ignores emphasis inside image alt", () => {
  assert.deepEqual(parseMarkdownInlineSpans("![*alt*](assets/a.png)"), []);
});

test("parse_markdown_inline_spans prefers code inside nested delimiters", () => {
  assert.deepEqual(parseMarkdownInlineSpans("**bold `code`**"), [
    { type: "inline_code", from: 7, to: 13, openTo: 8, closeFrom: 12 },
  ]);
});

test("parse_markdown_inline_spans skips empty spans", () => {
  assert.deepEqual(parseMarkdownInlineSpans("**** __  __"), []);
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
