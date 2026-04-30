import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyFormatToView,
  appendMarkdownTableColumn,
  appendMarkdownTableRow,
  attachViewToTab,
  collectMarkdownCodeBlocks,
  collectMarkdownFrontMatterBlock,
  collectMarkdownMathBlocks,
  collectMarkdownTableBlocks,
  completeMarkdownShortcutOnSpace,
  deleteMarkdownTableLastColumn,
  deleteMarkdownTableLastRow,
  formatSelectionChange,
  handleMarkdownBackspace,
  handleRustMessage,
  handleMarkdownEnter,
  hybridBlockState,
  hybridDecorationLevel,
  hybridHeadingDecorationLevel,
  hybridDecorationPolicy,
  hybridDecorationPolicies,
  indentMarkdownListInView,
  inlineMarkdownMarkersTouched,
  insertMarkdownInView,
  latestModeScrollSnapshot,
  markdownBlockEditRanges,
  markdownBlockLineRange,
  markdownBlockStringRange,
  markdownCodeFenceInfoRange,
  markdownLinkPasteChange,
  markdownTaskCheckboxToggleChange,
  markdownBlockquoteEnterChange,
  markdownCodeFenceEnterChange,
  markdownEnterChange,
  markdownListIndentChange,
  markdownDecorationTier,
  markdownListBackspaceChange,
  markdownListEnterChange,
  markdownShortcutSpaceChange,
  modeSupportsEditorScroll,
  normalizeBlockHints,
  normalizeEditorPreferences,
  nextLayoutSize,
  nextMermaidBlockState,
  normalizeViewMode,
  openReplacePanelInView,
  parseMarkdownBlockquoteLine,
  parseMarkdownCodeFenceLine,
  parseMarkdownFootnoteDefinitionLine,
  parseMarkdownHeadingLine,
  parseMarkdownHorizontalRuleLine,
  parseMarkdownImageSpans,
  parseMarkdownInlineSpans,
  parseMarkdownListLine,
  parseMarkdownTable,
  parseMarkdownTaskLine,
  pasteMarkdownLinkInView,
  recycleEditor,
  readScrollSnapshot,
  requestSaveForView,
  restoreScrollSnapshot,
  rewriteMarkdownTableCell,
  saveModeScrollSnapshot,
  selectionTouchesTextRange,
  shouldUseFullDocumentHybridScan,
  utf8ByteOffsetToStringIndex,
  utf8ByteRangeToStringRange,
  viewIsComposing,
} from "../src/editor-core.js";

const hybridFixture = readFileSync(
  new URL("./fixtures/hybrid-editing-baseline.md", import.meta.url),
  "utf8",
);
const hybridFixtureLines = hybridFixture.trimEnd().split(/\r?\n/);

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
    composing: false,
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
        const changes = Array.isArray(spec.changes) ? spec.changes : [spec.changes];
        let nextDoc = "";
        let cursor = 0;
        for (const { from, to, insert } of changes) {
          nextDoc += doc.slice(cursor, from);
          nextDoc += insert;
          cursor = to;
        }
        doc = nextDoc + doc.slice(cursor);
      }
      if (spec.selection) {
        main = {
          from: spec.selection.anchor,
          to: spec.selection.head ?? spec.selection.anchor,
        };
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

function fakeScroller({
  scrollTop = 0,
  scrollLeft = 0,
  scrollHeight = 1000,
  clientHeight = 100,
  scrollWidth = 800,
  clientWidth = 400,
} = {}) {
  return {
    scrollTop,
    scrollLeft,
    scrollHeight,
    clientHeight,
    scrollWidth,
    clientWidth,
  };
}

function attach(registry, view, tabId, initialContent = "", instanceId = "") {
  attachViewToTab({
    editorRegistry: registry,
    view,
    tabId,
    container: fakeContainer(),
    instanceId,
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

test("next_layout_size only reports real nonzero size changes", () => {
  assert.deepEqual(nextLayoutSize(null, { width: 800.4, height: 600.4 }), {
    width: 800,
    height: 600,
  });
  assert.equal(nextLayoutSize({ width: 800, height: 600 }, { width: 800, height: 600 }), null);
  assert.equal(nextLayoutSize(null, { width: 0, height: 600 }), null);
  assert.equal(nextLayoutSize(null, { width: 800, height: 0 }), null);
  assert.deepEqual(nextLayoutSize({ width: 800, height: 600 }, { width: 801, height: 600 }), {
    width: 801,
    height: 600,
  });
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
  assert.deepEqual(parseMarkdownInlineSpans("A **bold** and *soft* ~~old~~ `code` $x^2$"), [
    { type: "strong", from: 2, to: 10, openTo: 4, closeFrom: 8 },
    { type: "emphasis", from: 15, to: 21, openTo: 16, closeFrom: 20 },
    { type: "strikethrough", from: 22, to: 29, openTo: 24, closeFrom: 27 },
    { type: "inline_code", from: 30, to: 36, openTo: 31, closeFrom: 35 },
    { type: "inline_math", from: 37, to: 42, openTo: 38, closeFrom: 41 },
  ]);
});

test("parse_markdown_inline_spans recognizes links but skips images", () => {
  assert.deepEqual(parseMarkdownInlineSpans("See [docs](https://example.test)"), [
    { type: "link", from: 4, to: 32, openTo: 5, closeFrom: 9 },
  ]);
  assert.deepEqual(parseMarkdownInlineSpans("![alt](assets/image.png)"), []);
});

test("parse_markdown_inline_spans recognizes footnote references", () => {
  assert.deepEqual(parseMarkdownInlineSpans("A[^one] and `[^code]`"), [
    { type: "footnote_ref", from: 1, to: 7, label: "one" },
    { type: "inline_code", from: 12, to: 21, openTo: 13, closeFrom: 20 },
  ]);
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

test("parse_markdown_image_spans keeps external image urls", () => {
  const markdown =
    '![Remote](https://cdn.example.test/images/photo.webp?size=large "Remote title")';

  assert.deepEqual(parseMarkdownImageSpans(markdown), [
    {
      from: 0,
      to: markdown.length,
      alt: "Remote",
      src: "https://cdn.example.test/images/photo.webp?size=large",
      title: "Remote title",
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

test("parse_markdown_list_line recognizes plain list markers", () => {
  assert.deepEqual(parseMarkdownListLine("- item"), {
    markerLength: 2,
    indentLength: 0,
    marker: "-",
    ordered: false,
  });
  assert.deepEqual(parseMarkdownListLine("  12. item"), {
    markerLength: 6,
    indentLength: 2,
    marker: "12.",
    ordered: true,
  });
  assert.equal(parseMarkdownListLine("- [ ] todo"), null);
  assert.equal(parseMarkdownListLine("plain - item"), null);
});

test("parse_markdown_horizontal_rule_line recognizes thematic breaks", () => {
  assert.deepEqual(parseMarkdownHorizontalRuleLine("---"), { marker: "-" });
  assert.deepEqual(parseMarkdownHorizontalRuleLine("  * * *"), { marker: "*" });
  assert.deepEqual(parseMarkdownHorizontalRuleLine("___"), { marker: "_" });
  assert.equal(parseMarkdownHorizontalRuleLine("--"), null);
  assert.equal(parseMarkdownHorizontalRuleLine("--- text"), null);
  assert.equal(parseMarkdownHorizontalRuleLine("- _ -"), null);
});

test("parse_markdown_blockquote_line recognizes quote markers", () => {
  assert.deepEqual(parseMarkdownBlockquoteLine("> quote"), { markerLength: 2 });
  assert.deepEqual(parseMarkdownBlockquoteLine("   >quote"), { markerLength: 4 });
  assert.equal(parseMarkdownBlockquoteLine("    > code"), null);
  assert.equal(parseMarkdownBlockquoteLine("plain > quote"), null);
});

test("parse_markdown_footnote_definition_line recognizes definitions", () => {
  assert.deepEqual(parseMarkdownFootnoteDefinitionLine("[^one]: Note"), {
    markerLength: 8,
    label: "one",
  });
  assert.deepEqual(parseMarkdownFootnoteDefinitionLine("  [^2]: Note"), {
    markerLength: 8,
    label: "2",
  });
  assert.equal(parseMarkdownFootnoteDefinitionLine("[one]: Note"), null);
});

test("parse_markdown_code_fence_line recognizes fenced code markers", () => {
  assert.deepEqual(parseMarkdownCodeFenceLine("```rust"), {
    marker: "`",
    markerLength: 3,
    info: "rust",
  });
  assert.deepEqual(parseMarkdownCodeFenceLine("~~~"), {
    marker: "~",
    markerLength: 3,
    info: "",
  });
  assert.equal(parseMarkdownCodeFenceLine("``code`"), null);
  assert.equal(parseMarkdownCodeFenceLine("    ```"), null);
});

test("collect_markdown_code_blocks returns fenced ranges", () => {
  assert.deepEqual(collectMarkdownCodeBlocks([
    "Intro",
    "```js",
    "const value = 1;",
    "```",
    "Outro",
  ]), [
    { fromLine: 2, toLine: 4, info: "js" },
  ]);
  assert.deepEqual(collectMarkdownCodeBlocks([
    "~~~",
    "open",
  ]), [
    { fromLine: 1, toLine: 2, info: "" },
  ]);
});

test("collect_markdown_front_matter_block returns top metadata range", () => {
  assert.deepEqual(collectMarkdownFrontMatterBlock([
    "---",
    "title: Test",
    "---",
    "Body",
  ]), {
    fromLine: 1,
    toLine: 3,
  });
  assert.deepEqual(collectMarkdownFrontMatterBlock([
    "---",
    "title: Test",
    "...",
  ]), {
    fromLine: 1,
    toLine: 3,
  });
  assert.deepEqual(collectMarkdownFrontMatterBlock(["---", "---"]), {
    fromLine: 1,
    toLine: 2,
  });
  assert.equal(collectMarkdownFrontMatterBlock(["---", "title: Test"]), null);
  assert.equal(collectMarkdownFrontMatterBlock(["Body", "---", "x", "---"]), null);
});

test("collect_markdown_math_blocks returns display math ranges", () => {
  assert.deepEqual(collectMarkdownMathBlocks([
    "Before",
    "$$",
    "x^2 + y^2 = z^2",
    "$$",
    "After",
  ]), [
    { fromLine: 2, toLine: 4, source: "x^2 + y^2 = z^2" },
  ]);
  assert.deepEqual(collectMarkdownMathBlocks(["$$x^2$$"]), [
    { fromLine: 1, toLine: 1, source: "x^2" },
  ]);
  assert.deepEqual(collectMarkdownMathBlocks(["$$", "x^2"]), []);
});

test("collect_markdown_table_blocks returns pipe table ranges", () => {
  assert.deepEqual(collectMarkdownTableBlocks([
    "Before",
    "| Name | Value |",
    "| --- | :---: |",
    "| A | 1 |",
    "| B | |",
    "After",
  ]), [
    { fromLine: 2, toLine: 5 },
  ]);
  assert.deepEqual(collectMarkdownTableBlocks([
    "Name | Value",
    "--- | ---",
  ]), [
    { fromLine: 1, toLine: 2 },
  ]);
  assert.deepEqual(collectMarkdownTableBlocks([
    "| Name | Value |",
    "| -- | --- |",
  ]), []);
});

test("hybrid fixture covers target markdown editing blocks", () => {
  assert.ok(hybridFixture.includes("# Hybrid 标题"));

  const paragraph = hybridFixtureLines.find((line) => line.startsWith("Paragraph"));
  const inlineTypes = parseMarkdownInlineSpans(paragraph).map((span) => span.type);
  assert.ok(inlineTypes.includes("strong"));
  assert.ok(inlineTypes.includes("emphasis"));
  assert.ok(inlineTypes.includes("link"));
  assert.ok(inlineTypes.includes("inline_code"));
  assert.ok(inlineTypes.includes("inline_math"));

  assert.ok(hybridFixtureLines.some((line) => parseMarkdownHeadingLine(line)));
  assert.ok(hybridFixtureLines.some((line) => parseMarkdownTaskLine(line)));
  assert.ok(hybridFixtureLines.some((line) => parseMarkdownListLine(line)));
  assert.ok(hybridFixtureLines.some((line) => parseMarkdownBlockquoteLine(line)));
  assert.ok(hybridFixtureLines.some((line) => parseMarkdownImageSpans(line).length > 0));
  assert.ok(collectMarkdownMathBlocks(hybridFixtureLines).length > 0);
  assert.ok(collectMarkdownTableBlocks(hybridFixtureLines).length > 0);

  const codeBlocks = collectMarkdownCodeBlocks(hybridFixtureLines);
  assert.ok(codeBlocks.some((block) => block.info === "rust"));
  assert.ok(codeBlocks.some((block) => block.info === "mermaid"));
});

test("utf8 byte range mapping preserves rust offsets for unicode markdown", () => {
  const heading = "# Hybrid 标题\n";
  const fromByte = new TextEncoder().encode("# Hybrid ").length;
  const toByte = new TextEncoder().encode("# Hybrid 标题").length;

  assert.deepEqual(utf8ByteRangeToStringRange(heading, fromByte, toByte), {
    from: 9,
    to: 11,
  });
  assert.deepEqual(
    markdownBlockStringRange(heading, {
      start_byte: fromByte,
      end_byte: toByte,
      start_line: 1,
      end_line: 1,
    }),
    { from: 9, to: 11 },
  );
  assert.equal(utf8ByteOffsetToStringIndex(heading, fromByte + 1), null);
});

test("markdown block edit ranges normalize rust range payloads", () => {
  const block = {
    start_byte: 0,
    end_byte: 12,
    start_line: 1,
    end_line: 1,
    ranges: {
      source: { start_byte: 0, end_byte: 12, start_line: 1, end_line: 1 },
      content: { start_byte: 3, end_byte: 11, start_line: 1, end_line: 1 },
      markers: [{ start_byte: 0, end_byte: 3, start_line: 1, end_line: 1 }],
    },
  };

  assert.deepEqual(markdownBlockEditRanges(block), {
    source: { startByte: 0, endByte: 12, startLine: 1, endLine: 1 },
    content: { startByte: 3, endByte: 11, startLine: 1, endLine: 1 },
    markers: [{ startByte: 0, endByte: 3, startLine: 1, endLine: 1 }],
  });
  assert.deepEqual(markdownBlockLineRange(block), { fromLine: 1, toLine: 1 });
});

test("parse_markdown_inline_spans ignores emphasis inside image alt", () => {
  assert.deepEqual(parseMarkdownInlineSpans("![*alt*](assets/a.png)"), []);
});

test("parse_markdown_inline_spans prefers code inside nested delimiters", () => {
  assert.deepEqual(parseMarkdownInlineSpans("**bold `code`**"), [
    { type: "inline_code", from: 7, to: 13, openTo: 8, closeFrom: 12 },
  ]);
});

test("parse_markdown_inline_spans skips ambiguous inline math", () => {
  assert.deepEqual(parseMarkdownInlineSpans("Price is $5 and `cost $x$`"), [
    { type: "inline_code", from: 16, to: 26, openTo: 17, closeFrom: 25 },
  ]);
  assert.deepEqual(parseMarkdownInlineSpans("Escaped \\$x$ and $$block$$"), []);
});

test("parse_markdown_inline_spans skips empty spans", () => {
  assert.deepEqual(parseMarkdownInlineSpans("**** __  __"), []);
});

test("parse_markdown_inline_spans falls back on malformed decorations", () => {
  assert.deepEqual(parseMarkdownInlineSpans("Broken **strong and [link](url"), []);
  assert.deepEqual(parseMarkdownInlineSpans("Unclosed `code and $math"), []);
  assert.deepEqual(parseMarkdownInlineSpans("Image ![alt](missing close"), []);
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

test("set_content skips dispatch when content is unchanged", () => {
  const registry = new Map();
  let dispatches = 0;
  const view = fakeView("same", { from: 0, to: 0 }, () => {
    dispatches += 1;
  });

  attach(registry, view, "tab-a", "same");

  assert.equal(
    handleRustMessage(registry, "tab-a", {
      type: "set_content",
      content: "same",
    }),
    "updated",
  );
  assert.equal(view.state.doc.toString(), "same");
  assert.equal(dispatches, 0);
  assert.equal(registry.get("tab-a").suppressChange, false);
});

test("rust message handling ignores missing tabs and unknown messages", () => {
  const registry = new Map();
  const view = fakeView("body");

  attach(registry, view, "tab-a", "body");

  assert.equal(
    handleRustMessage(registry, "missing-tab", {
      type: "set_content",
      content: "stale",
    }),
    "missing",
  );
  assert.equal(view.state.doc.toString(), "body");

  assert.equal(
    handleRustMessage(registry, "tab-a", {
      type: "unknown_command",
    }),
    "ignored",
  );
  assert.equal(view.state.doc.toString(), "body");
  assert.equal(registry.has("tab-a"), true);
});

test("attach_view_to_tab initializes runtime entry without echoing content", () => {
  const registry = new Map();
  const sent = [];
  let layoutRefreshes = 0;
  const view = fakeView("", { from: 0, to: 0 }, () => {
    const tabId = view.dom.dataset.tabId;
    const entry = registry.get(tabId);
    if (entry && !entry.suppressChange) {
      entry.dioxus?.send({ type: "content_changed", tab_id: tabId });
    }
  });
  const container = fakeContainer();

  attachViewToTab({
    editorRegistry: registry,
    view,
    tabId: "tab-a",
    container,
    instanceId: "host-a",
    initialContent: "Initial note",
    viewMode: "Preview",
    refreshEditorLayout: () => {
      layoutRefreshes += 1;
    },
  });
  registry.get("tab-a").dioxus = { send: (message) => sent.push(message) };

  assert.equal(view.dom.dataset.tabId, "tab-a");
  assert.equal(view.dom.dataset.viewMode, "preview");
  assert.equal(view.dom.parentElement, container);
  assert.equal(view.state.doc.toString(), "Initial note");
  assert.equal(layoutRefreshes, 1);
  assert.equal(registry.get("tab-a").instanceId, "host-a");
  assert.equal(registry.get("tab-a").suppressChange, false);
  assert.deepEqual(registry.get("tab-a").preferences, {
    autoLinkPaste: true,
  });
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

test("apply_format rust message routes through the format adapter", () => {
  const registry = new Map();
  const view = fakeView("word", { from: 0, to: 4 });
  let formatted = null;

  attach(registry, view, "tab-a", "word");

  const result = handleRustMessage(
    registry,
    "tab-a",
    { type: "apply_format", kind: "bold" },
    {
      applyFormat: (targetView, kind) => {
        formatted = { targetView, kind };
        return true;
      },
    },
  );

  assert.equal(result, "formatted");
  assert.deepEqual(formatted, { targetView: view, kind: "bold" });
});

test("format_selection_change supports image and code shortcuts", () => {
  assert.deepEqual(formatSelectionChange("name", 0, 4, "image"), {
    changes: { from: 0, to: 4, insert: "![name](assets/image.png)" },
    selection: { anchor: 2, head: 6 },
    doc: "![name](assets/image.png)",
  });
  assert.deepEqual(formatSelectionChange("value", 0, 5, "inline_code"), {
    changes: { from: 0, to: 5, insert: "`value`" },
    selection: { anchor: 1, head: 6 },
    doc: "`value`",
  });
  assert.deepEqual(formatSelectionChange("", 0, 0, "code_block"), {
    changes: { from: 0, to: 0, insert: "```\ncode\n```" },
    selection: { anchor: 4, head: 8 },
    doc: "```\ncode\n```",
  });
});

test("markdown_link_paste_change wraps selected text with a plain URL", () => {
  assert.deepEqual(
    markdownLinkPasteChange("Read docs today", 5, 9, "https://example.test/docs"),
    {
      changes: {
        from: 5,
        to: 9,
        insert: "[docs](https://example.test/docs)",
      },
      selection: { anchor: 38 },
      doc: "Read [docs](https://example.test/docs) today",
    },
  );
  assert.deepEqual(
    markdownLinkPasteChange("Read [docs] today", 5, 11, "https://example.test"),
    {
      changes: {
        from: 5,
        to: 11,
        insert: "[[docs\\]](https://example.test)",
      },
      selection: { anchor: 36 },
      doc: "Read [[docs\\]](https://example.test) today",
    },
  );
});

test("markdown_link_paste_change respects preferences and URL shape", () => {
  assert.deepEqual(normalizeEditorPreferences({ autoLinkPaste: false }), {
    autoLinkPaste: false,
  });
  assert.equal(
    markdownLinkPasteChange("docs", 0, 4, "https://example.test", {
      autoLinkPaste: false,
    }),
    null,
  );
  assert.equal(markdownLinkPasteChange("docs", 0, 4, "not a url"), null);
  assert.equal(markdownLinkPasteChange("docs", 0, 0, "https://example.test"), null);
});

test("paste_markdown_link_in_view dispatches selected URL paste", () => {
  const view = fakeView("Read docs", { from: 5, to: 9 });

  assert.equal(pasteMarkdownLinkInView(view, "https://example.test", {}), true);
  assert.equal(view.state.doc.toString(), "Read [docs](https://example.test)");
  assert.deepEqual(view.state.selection.main, { from: 33, to: 33 });
});

test("insert_markdown_in_view replaces selection and moves cursor", () => {
  const view = fakeView("before selection after", { from: 7, to: 16 });

  assert.equal(insertMarkdownInView(view, "![image](assets/paste.png)"), true);
  assert.equal(view.state.doc.toString(), "before ![image](assets/paste.png) after");
  assert.deepEqual(view.state.selection.main, { from: 33, to: 33 });
});

test("request_save_for_view routes active tab save requests", () => {
  const sent = [];
  const view = fakeView("body");
  view.dom.dataset.tabId = "tab-a";
  const registry = new Map([
    ["tab-a", { dioxus: { send: (message) => sent.push(message) } }],
  ]);

  assert.equal(requestSaveForView(registry, view), true);
  assert.deepEqual(sent, [{ type: "save_requested", tab_id: "tab-a" }]);
});

test("request_save_for_view ignores unrouted editor views", () => {
  const view = fakeView("body");

  assert.equal(requestSaveForView(new Map(), view), false);
});

test("open_replace_panel focuses the replace field", () => {
  let opened = false;
  let focused = false;
  let selected = false;
  const replaceField = {
    focus() {
      focused = true;
    },
    select() {
      selected = true;
    },
  };
  const view = fakeView("body");
  view.dom.querySelector = (selector) => {
    assert.equal(selector, '.cm-search input[name="replace"]');
    return replaceField;
  };

  assert.equal(openReplacePanelInView(view, () => {
    opened = true;
    return true;
  }), true);
  assert.equal(opened, true);
  assert.equal(focused, true);
  assert.equal(selected, true);
});

test("markdown_list_enter_change continues unordered and ordered lists", () => {
  assert.deepEqual(markdownListEnterChange("- item", 6), {
    changes: { from: 6, to: 6, insert: "\n- " },
    selection: { anchor: 9 },
    doc: "- item\n- ",
  });
  assert.deepEqual(markdownListEnterChange("  9. item", 9), {
    changes: { from: 9, to: 9, insert: "\n  10. " },
    selection: { anchor: 16 },
    doc: "  9. item\n  10. ",
  });
});

test("markdown_list_enter_change exits empty list items", () => {
  assert.deepEqual(markdownListEnterChange("- ", 2), {
    changes: { from: 0, to: 2, insert: "" },
    selection: { anchor: 0 },
    doc: "",
  });
  assert.deepEqual(markdownListEnterChange("text\n  3. ", 10), {
    changes: { from: 5, to: 10, insert: "" },
    selection: { anchor: 5 },
    doc: "text\n",
  });
});

test("markdown_list_enter_change ignores non-list lines", () => {
  assert.equal(markdownListEnterChange("plain", 5), null);
});

test("markdown_list_backspace_change exits and outdents list prefixes", () => {
  assert.deepEqual(markdownListBackspaceChange("- item", 2), {
    changes: { from: 0, to: 2, insert: "" },
    selection: { anchor: 0 },
    doc: "item",
  });
  assert.deepEqual(markdownListBackspaceChange("  - item", 4), {
    changes: { from: 0, to: 2, insert: "" },
    selection: { anchor: 2 },
    doc: "- item",
  });
  assert.deepEqual(markdownListBackspaceChange("- [ ] task", 6), {
    changes: { from: 0, to: 6, insert: "" },
    selection: { anchor: 0 },
    doc: "task",
  });
  assert.equal(markdownListBackspaceChange("- item", 4), null);
});

test("markdown_blockquote_enter_change continues and exits quotes", () => {
  assert.deepEqual(markdownBlockquoteEnterChange("> quote", 7), {
    changes: { from: 7, to: 7, insert: "\n> " },
    selection: { anchor: 10 },
    doc: "> quote\n> ",
  });
  assert.deepEqual(markdownBlockquoteEnterChange("> ", 2), {
    changes: { from: 0, to: 2, insert: "" },
    selection: { anchor: 0 },
    doc: "",
  });
});

test("markdown_code_fence_enter_change inserts closing fence", () => {
  assert.deepEqual(markdownCodeFenceEnterChange("```rust", 7), {
    changes: { from: 7, to: 7, insert: "\n\n```" },
    selection: { anchor: 8 },
    doc: "```rust\n\n```",
  });
  assert.deepEqual(markdownCodeFenceEnterChange("text", 4), null);
});

test("markdown_enter_change combines list quote and fence handling", () => {
  assert.equal(markdownEnterChange("- item", 6)?.doc, "- item\n- ");
  assert.equal(markdownEnterChange("> quote", 7)?.doc, "> quote\n> ");
  assert.equal(markdownEnterChange("```", 3)?.doc, "```\n\n```");
});

test("markdown_shortcut_space_change completes line-start markers", () => {
  assert.deepEqual(markdownShortcutSpaceChange("#", 1), {
    changes: { from: 1, to: 1, insert: " " },
    selection: { anchor: 2 },
    doc: "# ",
  });
  assert.deepEqual(markdownShortcutSpaceChange("note\n>", 6), {
    changes: { from: 6, to: 6, insert: " " },
    selection: { anchor: 7 },
    doc: "note\n> ",
  });
  assert.equal(markdownShortcutSpaceChange("word#", 5), null);
});

test("markdown shortcut view commands dispatch completions", () => {
  const heading = fakeView("#", { from: 1, to: 1 });
  assert.equal(completeMarkdownShortcutOnSpace(heading), true);
  assert.equal(heading.state.doc.toString(), "# ");

  const fence = fakeView("```", { from: 3, to: 3 });
  assert.equal(handleMarkdownEnter(fence), true);
  assert.equal(fence.state.doc.toString(), "```\n\n```");
});

test("heading decoration keeps content editable while exposing touched markers", () => {
  const tier = markdownDecorationTier([{ fromLine: 1, toLine: 1 }], 1, 1);
  const marker = { from: 0, to: 2 };

  assert.equal(tier, "current");
  assert.equal(hybridDecorationLevel("heading", tier), "full");
  assert.equal(
    hybridHeadingDecorationLevel(tier, marker, [{ from: 2, to: 2 }]),
    "full",
  );
  assert.equal(
    hybridHeadingDecorationLevel(tier, marker, [{ from: 1, to: 1 }]),
    "source",
  );
  assert.equal(
    hybridHeadingDecorationLevel(tier, marker, [{ from: 0, to: 7 }]),
    "source",
  );
  assert.equal(selectionTouchesTextRange([{ from: 2, to: 2 }], marker), false);
  assert.equal(selectionTouchesTextRange([{ from: 1, to: 1 }], marker), true);
});

test("inline decoration keeps content editable while exposing touched markers", () => {
  const [strong, link] = parseMarkdownInlineSpans("A **bold** [link](https://example.com)");

  assert.equal(strong.type, "strong");
  assert.equal(
    inlineMarkdownMarkersTouched(strong, [{ from: 5, to: 5 }], 0),
    false,
  );
  assert.equal(
    inlineMarkdownMarkersTouched(strong, [{ from: 2, to: 3 }], 0),
    true,
  );
  assert.equal(
    inlineMarkdownMarkersTouched(strong, [{ from: 8, to: 10 }], 0),
    true,
  );

  assert.equal(link.type, "link");
  assert.equal(
    inlineMarkdownMarkersTouched(link, [{ from: 13, to: 13 }], 0),
    false,
  );
  assert.equal(
    inlineMarkdownMarkersTouched(link, [{ from: 17, to: 18 }], 0),
    true,
  );
  assert.equal(hybridDecorationLevel("emphasis", "current"), "full");
  assert.equal(hybridDecorationLevel("link", "remote"), "full");
});

test("current code and table blocks keep source editing tier", () => {
  const currentCodeTier = markdownDecorationTier(
    [{ fromLine: 2, toLine: 2 }],
    1,
    3,
  );
  const currentTableTier = markdownDecorationTier(
    [{ fromLine: 5, toLine: 5 }],
    4,
    6,
  );

  assert.equal(currentCodeTier, "current");
  assert.equal(currentTableTier, "current");
  assert.equal(hybridDecorationLevel("code", currentCodeTier), "source");
  assert.equal(hybridDecorationLevel("table", currentTableTier), "source");
  assert.equal(hybridDecorationLevel("table", "near"), "full");
  assert.equal(hybridDecorationLevel("mermaid", "current"), "source");
  assert.equal(hybridDecorationLevel("mermaid", "remote"), "full");
  assert.equal(hybridDecorationLevel("math", "current"), "source");
  assert.equal(hybridDecorationLevel("math", "remote"), "full");
});

test("task checkbox toggle change rewrites only the checkbox marker", () => {
  assert.deepEqual(markdownTaskCheckboxToggleChange("- [ ] Todo", 3), {
    changes: { from: 3, to: 4, insert: "x" },
    selection: { anchor: 4 },
    doc: "- [x] Todo",
  });
  assert.deepEqual(markdownTaskCheckboxToggleChange("- [X] Todo", 3), {
    changes: { from: 3, to: 4, insert: " " },
    selection: { anchor: 4 },
    doc: "- [ ] Todo",
  });
  assert.equal(markdownTaskCheckboxToggleChange("- [?] Todo", 3), null);
  assert.equal(hybridDecorationLevel("task", "current"), "widget");
  assert.equal(hybridDecorationLevel("list", "current"), "full");
  assert.equal(hybridDecorationLevel("quote", "current"), "full");
});

test("code fence info range targets the editable language segment", () => {
  assert.deepEqual(markdownCodeFenceInfoRange("```rust", 10), {
    from: 13,
    to: 17,
  });
  assert.deepEqual(markdownCodeFenceInfoRange("~~~", 4), {
    from: 7,
    to: 7,
  });
  assert.equal(markdownCodeFenceInfoRange("    ```rust", 0), null);
});

test("markdown input commands yield during IME composition", () => {
  const space = fakeView("#", { from: 1, to: 1 });
  space.composing = true;
  assert.equal(completeMarkdownShortcutOnSpace(space), false);
  assert.equal(space.state.doc.toString(), "#");

  const enter = fakeView("> quote", { from: 7, to: 7 });
  enter.composing = true;
  assert.equal(handleMarkdownEnter(enter), false);
  assert.equal(enter.state.doc.toString(), "> quote");

  const indent = fakeView("- item", { from: 0, to: 0 });
  indent.composing = true;
  assert.equal(indentMarkdownListInView(indent, "indent"), false);
  assert.equal(indent.state.doc.toString(), "- item");

  const backspace = fakeView("- item", { from: 2, to: 2 });
  backspace.composing = true;
  assert.equal(handleMarkdownBackspace(backspace), false);
  assert.equal(backspace.state.doc.toString(), "- item");
});

test("markdown input commands yield while IME composition is starting", () => {
  const space = fakeView("#", { from: 1, to: 1 });
  space.compositionStarted = true;
  assert.equal(completeMarkdownShortcutOnSpace(space), false);
  assert.equal(space.state.doc.toString(), "#");

  const enter = fakeView("- 中文", { from: 4, to: 4 });
  enter.compositionStarted = true;
  assert.equal(handleMarkdownEnter(enter), false);
  assert.equal(enter.state.doc.toString(), "- 中文");

  const indent = fakeView("- 中文", { from: 0, to: 0 });
  indent.compositionStarted = true;
  assert.equal(indentMarkdownListInView(indent, "indent"), false);
  assert.equal(indent.state.doc.toString(), "- 中文");

  const backspace = fakeView("- 中文", { from: 2, to: 2 });
  backspace.compositionStarted = true;
  assert.equal(handleMarkdownBackspace(backspace), false);
  assert.equal(backspace.state.doc.toString(), "- 中文");
});

test("markdown_list_indent_change indents selected list lines", () => {
  assert.deepEqual(markdownListIndentChange("- one\ntext\n1. two", 0, 17, "indent"), {
    changes: [
      { from: 0, to: 0, insert: "  " },
      { from: 11, to: 11, insert: "  " },
    ],
    selection: { anchor: 2, head: 21 },
    doc: "  - one\ntext\n  1. two",
  });
});

test("markdown_list_indent_change outdents selected list lines", () => {
  assert.deepEqual(markdownListIndentChange("  - one\n\t- two\n- three", 0, 22, "outdent"), {
    changes: [
      { from: 0, to: 2, insert: "" },
      { from: 8, to: 9, insert: "" },
    ],
    selection: { anchor: 0, head: 19 },
    doc: "- one\n- two\n- three",
  });
});

test("markdown_list_indent_change ignores non-list and flush outdent lines", () => {
  assert.equal(markdownListIndentChange("plain", 0, 5, "indent"), null);
  assert.equal(markdownListIndentChange("- item", 0, 6, "outdent"), null);
});

test("indent_markdown_list_in_view dispatches list indentation", () => {
  const view = fakeView("- item", { from: 0, to: 0 });

  assert.equal(indentMarkdownListInView(view, "indent"), true);
  assert.equal(view.state.doc.toString(), "  - item");
  assert.deepEqual(view.state.selection.main, { from: 2, to: 2 });
});

test("markdown backspace view command exits list prefix", () => {
  const view = fakeView("- item", { from: 2, to: 2 });

  assert.equal(handleMarkdownBackspace(view), true);
  assert.equal(view.state.doc.toString(), "item");
  assert.deepEqual(view.state.selection.main, { from: 0, to: 0 });
});

test("tab recycle detaches old tab and prevents stale content routing", () => {
  const registry = new Map();
  const view = fakeView("first");
  let recycleCalls = 0;

  attach(registry, view, "tab-a", "A");
  registry.get("tab-a").onRecycle = () => {
    recycleCalls += 1;
  };
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
  assert.equal(recycleCalls, 1);
});

test("view_is_composing covers active and starting composition", () => {
  assert.equal(viewIsComposing({ composing: false, compositionStarted: false }), false);
  assert.equal(viewIsComposing({ composing: true, compositionStarted: false }), true);
  assert.equal(viewIsComposing({ composing: false, compositionStarted: true }), true);
});

test("recycle_editor clears routed dataset and channel state", () => {
  const registry = new Map();
  const view = fakeView("body");
  let recycleCalls = 0;

  attachViewToTab({
    editorRegistry: registry,
    view,
    tabId: "tab-a",
    container: fakeContainer(),
    instanceId: "host-a",
    initialContent: "body",
    viewMode: "Preview",
    refreshEditorLayout: () => {},
  });
  const entry = registry.get("tab-a");
  entry.dioxus = { send: () => {} };
  entry.onRecycle = () => {
    recycleCalls += 1;
  };

  assert.equal(recycleEditor(registry, "tab-a"), true);

  assert.equal(registry.has("tab-a"), false);
  assert.equal(view.dom.dataset.tabId, undefined);
  assert.equal(view.dom.dataset.viewMode, undefined);
  assert.equal(entry.dioxus, null);
  assert.equal(recycleCalls, 1);
});

test("destroy ignores stale editor host instances", () => {
  const registry = new Map();
  const view = fakeView("body");

  attach(registry, view, "tab-a", "body", "host-new");

  assert.equal(
    handleRustMessage(registry, "tab-a", {
      type: "destroy",
      instance_id: "host-old",
    }),
    "destroyed",
  );
  assert.equal(registry.has("tab-a"), true);

  assert.equal(
    handleRustMessage(registry, "tab-a", {
      type: "destroy",
      instance_id: "host-new",
    }),
    "destroyed",
  );
  assert.equal(registry.has("tab-a"), false);
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

test("set_view_mode ignores duplicate runtime commands", () => {
  const registry = new Map();
  const view = fakeView("body");
  let layoutRefreshes = 0;

  attachViewToTab({
    editorRegistry: registry,
    view,
    tabId: "tab-a",
    container: fakeContainer(),
    initialContent: "body",
    viewMode: "Hybrid",
    refreshEditorLayout: () => {
      layoutRefreshes += 1;
    },
  });

  assert.equal(layoutRefreshes, 1);
  assert.equal(
    handleRustMessage(
      registry,
      "tab-a",
      { type: "set_view_mode", mode: "Hybrid" },
      {
        refreshEditorLayout: () => {
          layoutRefreshes += 1;
        },
      },
    ),
    "mode_unchanged",
  );
  assert.equal(layoutRefreshes, 1);
});

test("scroll snapshots restore by relative document position", () => {
  const source = fakeScroller({
    scrollTop: 250,
    scrollLeft: 80,
    scrollHeight: 1100,
    clientHeight: 100,
    scrollWidth: 1000,
    clientWidth: 200,
  });
  const snapshot = readScrollSnapshot(source);

  assert.equal(snapshot.topRatio, 0.25);
  assert.equal(snapshot.leftRatio, 0.1);

  const target = fakeScroller({
    scrollTop: 0,
    scrollLeft: 0,
    scrollHeight: 2200,
    clientHeight: 200,
    scrollWidth: 1800,
    clientWidth: 200,
  });

  assert.equal(restoreScrollSnapshot(target, snapshot), true);
  assert.equal(target.scrollTop, 500);
  assert.equal(target.scrollLeft, 160);
});

test("mode scroll snapshots share latest position across view modes", () => {
  const store = new Map();

  assert.equal(modeSupportsEditorScroll("source"), true);
  assert.equal(modeSupportsEditorScroll("Hybrid"), true);
  assert.equal(modeSupportsEditorScroll("preview"), false);

  saveModeScrollSnapshot(
    store,
    "tab-a",
    "source",
    readScrollSnapshot(fakeScroller({ scrollTop: 200, scrollHeight: 900, clientHeight: 100 })),
  );
  assert.equal(latestModeScrollSnapshot(store, "tab-a").top, 200);

  saveModeScrollSnapshot(
    store,
    "tab-a",
    "preview",
    readScrollSnapshot(fakeScroller({ scrollTop: 420, scrollHeight: 1500, clientHeight: 100 })),
  );
  assert.equal(latestModeScrollSnapshot(store, "tab-a").top, 420);
});

test("set_preferences stores editor preferences on entry", () => {
  const registry = new Map();
  const view = fakeView("body");

  attach(registry, view, "tab-a", "body");

  const result = handleRustMessage(registry, "tab-a", {
    type: "set_preferences",
    auto_link_paste: false,
  });

  assert.equal(result, "preferences_updated");
  assert.deepEqual(registry.get("tab-a").preferences, {
    autoLinkPaste: false,
  });
});

test("set_preferences ignores duplicate runtime commands", () => {
  const registry = new Map();
  const view = fakeView("body");
  let preferenceWrites = 0;

  attach(registry, view, "tab-a", "body");

  assert.equal(
    handleRustMessage(registry, "tab-a", {
      type: "set_preferences",
      auto_link_paste: false,
    }),
    "preferences_updated",
  );
  assert.equal(
    handleRustMessage(
      registry,
      "tab-a",
      { type: "set_preferences", auto_link_paste: false },
      {
        setEditorPreferences: (entry, preferences) => {
          preferenceWrites += 1;
          entry.preferences = normalizeEditorPreferences(preferences);
        },
      },
    ),
    "preferences_unchanged",
  );
  assert.equal(preferenceWrites, 0);
});

test("normalize_block_hints keeps revisioned hint payloads", () => {
  assert.deepEqual(
    normalizeBlockHints({
      revision: "7",
      fallback: { type: "none" },
      blocks: [{ kind: { type: "heading", level: 1 }, start_line: 1 }],
    }),
    {
      revision: 7,
      fallback: { type: "none" },
      blocks: [{ kind: { type: "heading", level: 1 }, start_line: 1 }],
    },
  );
  assert.equal(normalizeBlockHints({ revision: -1, blocks: [] }), null);
  assert.equal(normalizeBlockHints(null), null);
});

test("set_block_hints stores revisioned runtime hints", () => {
  const registry = new Map();
  const view = fakeView("body");

  attach(registry, view, "tab-a", "body");

  const result = handleRustMessage(registry, "tab-a", {
    type: "set_block_hints",
    hints: {
      revision: 2,
      fallback: { type: "none" },
      blocks: [{ kind: { type: "paragraph" }, start_line: 1, end_line: 1 }],
    },
  });

  assert.equal(result, "block_hints_updated");
  assert.equal(registry.get("tab-a").blockHints.revision, 2);
  assert.equal(
    handleRustMessage(registry, "tab-a", {
      type: "set_block_hints",
      hints: { revision: 2, fallback: { type: "none" }, blocks: [] },
    }),
    "block_hints_unchanged",
  );
});

test("set_block_hints decoration effects do not change document content", () => {
  const registry = new Map();
  const dispatched = [];
  const view = fakeView("body", { from: 0, to: 0 }, (_view, spec) => {
    dispatched.push(spec);
  });

  attach(registry, view, "tab-a", "body");

  const result = handleRustMessage(
    registry,
    "tab-a",
    {
      type: "set_block_hints",
      hints: { revision: 3, fallback: { type: "none" }, blocks: [] },
    },
    {
      setBlockHints(entry, hints) {
        entry.blockHints = normalizeBlockHints(hints);
        entry.view.dispatch({ effects: ["set_block_hints"] });
        return entry.blockHints;
      },
    },
  );

  assert.equal(result, "block_hints_updated");
  assert.equal(view.state.doc.toString(), "body");
  assert.deepEqual(dispatched, [{ effects: ["set_block_hints"] }]);
});

test("markdown_decoration_tier separates current near and remote blocks", () => {
  const selections = [
    { fromLine: 10, toLine: 12 },
    { fromLine: 30, toLine: 30 },
  ];

  assert.equal(markdownDecorationTier(selections, 11, 11), "current");
  assert.equal(markdownDecorationTier(selections, 13, 13), "near");
  assert.equal(markdownDecorationTier(selections, 27, 27), "remote");
  assert.equal(markdownDecorationTier(selections, 28, 29), "near");
  assert.equal(markdownDecorationTier(selections, 40, 40), "remote");
  assert.equal(markdownDecorationTier([], 1, 1), "remote");
});

test("markdown_decoration_tier treats cross block selections as current", () => {
  const selections = [{ fromLine: 5, toLine: 12 }];

  assert.equal(markdownDecorationTier(selections, 1, 4), "near");
  assert.equal(markdownDecorationTier(selections, 4, 6), "current");
  assert.equal(markdownDecorationTier(selections, 8, 15), "current");
  assert.equal(markdownDecorationTier(selections, 13, 14), "near");
});

test("hybrid_block_state models edit render error and fallback modes", () => {
  const block = {
    kind: { type: "heading", level: 1 },
    start_line: 6,
    end_line: 6,
  };

  assert.deepEqual(markdownBlockLineRange(block), { fromLine: 6, toLine: 6 });
  assert.equal(
    hybridBlockState(block, {
      selectionLineRanges: [{ fromLine: 6, toLine: 6 }],
    }),
    "editing",
  );
  assert.equal(
    hybridBlockState(block, {
      selectionLineRanges: [{ fromLine: 20, toLine: 20 }],
    }),
    "rendered",
  );
  assert.equal(
    hybridBlockState(block, {
      fallback: { type: "source_only", reason: "document_too_large" },
    }),
    "source_fallback",
  );
  assert.equal(
    hybridBlockState(block, {
      renderStatus: { state: "error", message: "render failed" },
    }),
    "error",
  );
});

test("should_use_full_document_hybrid_scan caps large documents", () => {
  assert.equal(shouldUseFullDocumentHybridScan(64 * 1024), true);
  assert.equal(shouldUseFullDocumentHybridScan(64 * 1024 + 1), false);
  assert.equal(shouldUseFullDocumentHybridScan(Number.NaN), false);
});

test("hybrid_decoration_policies cover required markdown kinds", () => {
  for (const kind of [
    "heading",
    "emphasis",
    "link",
    "image",
    "task",
    "list",
    "code",
    "math",
    "quote",
    "rule",
    "table",
    "footnote",
  ]) {
    assert.ok(hybridDecorationPolicies[kind], `${kind} policy missing`);
    assert.equal(hybridDecorationPolicy(kind).fallback, "source");
    assert.ok(hybridDecorationPolicy(kind).budget);
  }

  assert.equal(hybridDecorationLevel("heading", "remote"), "structure");
  assert.equal(hybridDecorationLevel("code", "near"), "full");
  assert.equal(hybridDecorationLevel("image", "remote"), "source");
  assert.equal(hybridDecorationLevel("unknown", "near"), "full");
});

test("rewrite_markdown_table_cell updates one cell without changing table shape", () => {
  const table = [
    "| Name | Status |",
    "| --- | :---: |",
    "| Alpha | Ready |",
    "| Beta | Waiting |",
  ].join("\n");

  assert.equal(
    rewriteMarkdownTableCell(table, 2, 1, "Done | blocked"),
    [
      "| Name | Status |",
      "| --- | :---: |",
      "| Alpha | Done \\| blocked |",
      "| Beta | Waiting |",
    ].join("\n"),
  );
  assert.equal(rewriteMarkdownTableCell(table, 1, 0, "invalid"), null);
  assert.equal(rewriteMarkdownTableCell(table, 2, 3, "invalid"), null);
});

test("parse_markdown_table exposes editable cells and alignments", () => {
  assert.deepEqual(
    parseMarkdownTable([
      "| Name | Status | Count |",
      "| :--- | :---: | ---: |",
      "| Alpha | Ready | 1 |",
    ].join("\n")),
    {
      columnCount: 3,
      alignments: ["left", "center", "right"],
      rows: [
        {
          kind: "header",
          sourceRowIndex: 0,
          cells: ["Name", "Status", "Count"],
        },
        {
          kind: "body",
          sourceRowIndex: 2,
          cells: ["Alpha", "Ready", "1"],
        },
      ],
    },
  );
  assert.equal(parseMarkdownTable("| A |\n| --- |"), null);
});

test("markdown table row and column commands preserve table shape", () => {
  const table = [
    "| Name | Status |",
    "| --- | :---: |",
    "| Alpha | Ready |",
  ].join("\n");

  assert.equal(
    appendMarkdownTableRow(table),
    [
      "| Name | Status |",
      "| --- | :---: |",
      "| Alpha | Ready |",
      "|  |  |",
    ].join("\n"),
  );
  assert.equal(
    appendMarkdownTableColumn(table, "Owner"),
    [
      "| Name | Status | Owner |",
      "| --- | :---: | --- |",
      "| Alpha | Ready |  |",
    ].join("\n"),
  );
  assert.equal(
    deleteMarkdownTableLastRow(table),
    [
      "| Name | Status |",
      "| --- | :---: |",
    ].join("\n"),
  );
  assert.equal(
    deleteMarkdownTableLastColumn([
      "| Name | Status | Owner |",
      "| --- | :---: | --- |",
      "| Alpha | Ready | You |",
    ].join("\n")),
    [
      "| Name | Status |",
      "| --- | :---: |",
      "| Alpha | Ready |",
    ].join("\n"),
  );
  assert.equal(deleteMarkdownTableLastColumn("| A | B |\n| --- | --- |"), null);
});

test("next_mermaid_block_state toggles between rendered editing and error states", () => {
  let state = {
    mode: "rendered",
    source: "flowchart TD\nA --> B",
  };

  state = nextMermaidBlockState(state, { type: "pointer_down" });
  assert.equal(state.mode, "editing");

  state = nextMermaidBlockState(state, {
    type: "source_changed",
    source: "flowchart LR\nA --> B",
  });
  assert.equal(state.mode, "editing");
  assert.equal(state.dirty, true);
  assert.equal(state.source, "flowchart LR\nA --> B");

  state = nextMermaidBlockState(state, { type: "blur" });
  assert.equal(state.mode, "rendered");
  assert.equal(state.pending, true);
  assert.equal(state.dirty, false);

  state = nextMermaidBlockState(state, {
    type: "render_failed",
    error: "Parse error",
  });
  assert.equal(state.mode, "error");
  assert.equal(state.error, "Parse error");

  state = nextMermaidBlockState(state, { type: "pointer_down" });
  assert.equal(state.mode, "editing");
  assert.equal(state.error, null);

  state = nextMermaidBlockState(state, {
    type: "render_succeeded",
    svg: "<svg></svg>",
  });
  assert.equal(state.mode, "rendered");
  assert.equal(state.pending, false);
  assert.equal(state.svg, "<svg></svg>");
});

test("insert_markdown message inserts markdown into editor", () => {
  const registry = new Map();
  const view = fakeView("body", { from: 4, to: 4 });

  attach(registry, view, "tab-a", "body");

  const result = handleRustMessage(registry, "tab-a", {
    type: "insert_markdown",
    markdown: "![image](assets/paste.png)",
  });

  assert.equal(result, "markdown_inserted");
  assert.equal(view.state.doc.toString(), "body![image](assets/paste.png)");
});
