import test from "node:test";
import assert from "node:assert/strict";

import {
  lineNumberAtOffset,
  lineStartOffset,
  scrollTiptapEntryToLine,
  tiptapActiveMarkdownLineNumber,
  tiptapActiveOutlineIndex,
  tiptapEditorScroller,
  tiptapTopMarkdownLineNumber,
} from "../src/tiptap-navigation.ts";

function createTextarea(value = "") {
  return {
    value,
    selectionStart: 0,
    selectionEnd: 0,
    scrollTop: 0,
    clientHeight: 120,
    scrollHeight: 800,
    ownerDocument: {
      defaultView: {
        getComputedStyle: () => ({
          lineHeight: "20px",
          fontSize: "14px",
        }),
      },
    },
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
    focus() {
      this.focused = true;
    },
    scrollTo({ top }) {
      this.scrollTop = top;
    },
  };
}

function fakeDoc(nodes = []) {
  return {
    descendants(callback) {
      nodes.forEach((node) => callback(node, node.pos));
    },
  };
}

function headingNode(pos, text = "Heading") {
  return {
    pos,
    type: { name: "heading" },
    isTextblock: true,
    content: { size: text.length },
    textContent: text,
  };
}

function paragraphNode(pos, text = "Body") {
  return {
    pos,
    type: { name: "paragraph" },
    isTextblock: true,
    content: { size: text.length },
    textContent: text,
  };
}

function createHybridEntry({ selectionFrom = 1, headingRects = [] } = {}) {
  const calls = [];
  const headings = headingRects.map((top) => ({
    getBoundingClientRect: () => ({ top }),
  }));
  const scroller = {
    scrollTop: 40,
    getBoundingClientRect: () => ({ top: 10 }),
    scrollTo({ top }) {
      this.scrollTop = top;
      calls.push(["scrollTo", top]);
    },
    querySelectorAll(selector) {
      assert.match(selector, /h1/);
      return headings;
    },
  };
  const editor = {
    state: {
      doc: fakeDoc([
        headingNode(0, "Title"),
        paragraphNode(8),
        headingNode(15, "Next"),
      ]),
      selection: {
        from: selectionFrom,
      },
    },
    view: {
      dom: {
        querySelectorAll: scroller.querySelectorAll.bind(scroller),
      },
    },
    chain() {
      const chainCalls = [];
      return {
        setTextSelection(position) {
          chainCalls.push(["setTextSelection", position]);
          calls.push(["setTextSelection", position]);
          return this;
        },
        scrollIntoView() {
          chainCalls.push(["scrollIntoView"]);
          calls.push(["scrollIntoView"]);
          return this;
        },
        focus() {
          chainCalls.push(["focus"]);
          calls.push(["focus"]);
          return this;
        },
        run() {
          calls.push(["run", chainCalls]);
          return true;
        },
      };
    },
  };

  return {
    calls,
    entry: {
      editor,
      dom: scroller,
      viewMode: "hybrid",
      markdownSync: {
        markdown: "# Title\n\nBody\n\n## Next",
      },
    },
  };
}

test("Tiptap navigation maps Markdown line numbers to offsets", () => {
  assert.equal(lineStartOffset("alpha\nbeta\ngamma", 1), 0);
  assert.equal(lineStartOffset("alpha\nbeta\ngamma", 2), 6);
  assert.equal(lineStartOffset("alpha\nbeta\ngamma", 99), 11);
  assert.equal(lineNumberAtOffset("alpha\nbeta\ngamma", 8), 2);
});

test("Tiptap navigation jumps Source textarea to the requested line", () => {
  const textarea = createTextarea("# Title\n\nBody\n\n## Next");
  const entry = {
    editor: {},
    dom: { dataset: { tabId: "tab-a" } },
    viewMode: "source",
    sourcePane: { textarea },
    markdownSync: { markdown: textarea.value },
  };

  assert.equal(scrollTiptapEntryToLine(entry, 5), true);
  assert.deepEqual([textarea.selectionStart, textarea.selectionEnd], [15, 15]);
  assert.equal(textarea.focused, true);
  assert.equal(textarea.scrollTop, 68);
  assert.equal(tiptapEditorScroller(entry), textarea);
  assert.equal(tiptapActiveMarkdownLineNumber(entry, [1, 5]), 5);
  assert.equal(tiptapActiveOutlineIndex(entry, [1, 5]), 1);
});

test("Tiptap navigation jumps Hybrid editor by outline heading index", () => {
  const { calls, entry } = createHybridEntry({ headingRects: [60, 220] });

  assert.equal(scrollTiptapEntryToLine(entry, 5, { headingIndex: 1 }), true);
  assert.equal(tiptapEditorScroller(entry), entry.dom);
  assert.deepEqual(calls.slice(0, 4), [
    ["setTextSelection", 16],
    ["scrollIntoView"],
    ["focus"],
    ["run", [
      ["setTextSelection", 16],
      ["scrollIntoView"],
      ["focus"],
    ]],
  ]);
  assert.deepEqual(calls.at(-1), ["scrollTo", 238]);
});

test("Tiptap navigation derives Hybrid outline state from selection and scroll", () => {
  const { entry } = createHybridEntry({
    selectionFrom: 18,
    headingRects: [-10, 30],
  });

  assert.equal(tiptapActiveOutlineIndex(entry, [1, 5]), 1);
  assert.equal(tiptapActiveMarkdownLineNumber(entry, [1, 5]), 5);
  assert.equal(tiptapTopMarkdownLineNumber(entry, [1, 5], entry.dom), 5);
});

test("Tiptap navigation clears Hybrid outline before the first heading", () => {
  const { entry } = createHybridEntry({
    selectionFrom: 0,
    headingRects: [200, 320],
  });

  assert.equal(tiptapActiveOutlineIndex(entry, [3, 8]), 0);
  entry.editor.state.selection.from = -1;
  assert.equal(tiptapActiveMarkdownLineNumber(entry, [3, 8]), 0);
});
