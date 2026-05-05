import test from "node:test";
import assert from "node:assert/strict";

import {
  createTiptapBlockActionController,
  PAPYRO_TIPTAP_BLOCK_ACTIONS,
} from "../src/tiptap-block-actions.js";

function createEditor() {
  const calls = [];
  const editor = {
    commands: {
      deleteRange: (range) => {
        calls.push(["deleteRange", range.from, range.to]);
        return true;
      },
      focus: (pos) => {
        calls.push(["focus", pos ?? null]);
        return true;
      },
      insertContentAt: (pos, markdown, options) => {
        calls.push(["insertContentAt", pos, markdown, options.contentType]);
        return true;
      },
      insertContent: (markdown, options) => {
        calls.push(["insertContent", markdown, options.contentType]);
        return true;
      },
      insertTable: (attrs) => {
        calls.push(["insertTable", attrs.rows, attrs.cols, attrs.withHeaderRow]);
        return true;
      },
      setHorizontalRule: () => {
        calls.push(["setHorizontalRule"]);
        return true;
      },
      setImage: (attrs) => {
        calls.push(["setImage", attrs.src, attrs.alt, attrs.title]);
        return true;
      },
      setMathBlock: (attrs) => {
        calls.push(["setMathBlock", attrs.source]);
        return true;
      },
      setMermaidBlock: (attrs) => {
        calls.push(["setMermaidBlock", attrs.source]);
        return true;
      },
      setParagraph: () => {
        calls.push(["setParagraph"]);
        return true;
      },
      toggleBlockquote: () => {
        calls.push(["toggleBlockquote"]);
        return true;
      },
      toggleBulletList: () => {
        calls.push(["toggleBulletList"]);
        return true;
      },
      toggleCodeBlock: () => {
        calls.push(["toggleCodeBlock"]);
        return true;
      },
      toggleHeading: (attrs) => {
        calls.push(["toggleHeading", attrs.level]);
        return true;
      },
      toggleOrderedList: () => {
        calls.push(["toggleOrderedList"]);
        return true;
      },
      toggleTaskList: () => {
        calls.push(["toggleTaskList"]);
        return true;
      },
    },
  };

  return { calls, editor };
}

test("Tiptap block actions expose stable command ids", () => {
  assert.deepEqual(
    PAPYRO_TIPTAP_BLOCK_ACTIONS.map((command) => command.id),
    [
      "insert-before",
      "insert-after",
      "paragraph",
      "heading-1",
      "heading-2",
      "heading-3",
      "bullet-list",
      "ordered-list",
      "task-list",
      "blockquote",
      "code-block",
      "divider",
      "table",
      "math-block",
      "mermaid",
      "image",
      "delete",
    ],
  );
});

test("Tiptap block actions insert paragraphs around the target block", () => {
  const { calls, editor } = createEditor();
  const controller = createTiptapBlockActionController();
  const target = { pos: 5, node: { nodeSize: 8 } };

  assert.deepEqual(controller.run("insert-after", { editor, target }), {
    ok: true,
    commandId: "insert-after",
    error: null,
  });
  assert.deepEqual(calls, [
    ["focus", 5],
    ["insertContentAt", 13, "\n", "markdown"],
    ["focus", null],
  ]);
});

test("Tiptap block actions transform the active block", () => {
  const { calls, editor } = createEditor();
  const controller = createTiptapBlockActionController();

  assert.equal(controller.run("heading-2", { editor, target: { pos: 3 } }).ok, true);
  assert.deepEqual(calls, [
    ["focus", 3],
    ["toggleHeading", 2],
    ["focus", null],
  ]);
});

test("Tiptap block actions delete the target range", () => {
  const { calls, editor } = createEditor();
  const controller = createTiptapBlockActionController();

  assert.equal(
    controller.run("delete", { editor, target: { pos: 2, node: { nodeSize: 6 } } }).ok,
    true,
  );
  assert.deepEqual(calls, [
    ["focus", 2],
    ["deleteRange", 2, 8],
    ["focus", null],
  ]);
});

test("Tiptap block actions expose menu metadata in priority order", () => {
  const controller = createTiptapBlockActionController();

  assert.deepEqual(controller.list()[12], {
    id: "table",
    title: "Table",
    description: "Insert a 3 by 2 table",
    group: "Advanced",
    icon: "table",
    shortcut: "",
    tone: "default",
  });
});

test("Tiptap block actions create rich advanced blocks when available", () => {
  const { calls, editor } = createEditor();
  const controller = createTiptapBlockActionController();

  assert.equal(controller.run("table", { editor, target: { pos: 3 } }).ok, true);
  assert.deepEqual(calls, [
    ["focus", 3],
    ["insertTable", 3, 2, true],
    ["focus", null],
  ]);
});

test("Tiptap block actions fall back to Markdown for unavailable rich commands", () => {
  const calls = [];
  const editor = {
    commands: {
      focus: (pos) => calls.push(["focus", pos ?? null]),
      insertContent: (markdown, options) => {
        calls.push(["insertContent", markdown, options.contentType]);
        return true;
      },
    },
  };
  const controller = createTiptapBlockActionController();

  assert.equal(controller.run("math-block", { editor, target: { pos: 7 } }).ok, true);
  assert.deepEqual(calls, [
    ["focus", 7],
    ["insertContent", "\n$$\n\n$$\n", "markdown"],
    ["focus", null],
  ]);
});

test("Tiptap block actions report unknown commands", () => {
  const controller = createTiptapBlockActionController();

  assert.deepEqual(controller.run("unknown"), {
    ok: false,
    commandId: "unknown",
    error: "unknown_block_action",
  });
});
