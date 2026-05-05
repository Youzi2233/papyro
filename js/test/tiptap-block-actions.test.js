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
      setCalloutBlock: (attrs) => {
        calls.push(["setCalloutBlock", attrs.kind, attrs.text]);
        return true;
      },
      setCalloutKind: (attrs) => {
        calls.push(["setCalloutKind", attrs.kind, attrs.pos]);
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
    state: {
      doc: {
        nodeAt() {
          return null;
        },
        textBetween(from, to) {
          calls.push(["textBetween", from, to]);
          return "Block text";
        },
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
      "callout",
      "callout-kind-note",
      "callout-kind-tip",
      "callout-kind-warning",
      "callout-kind-danger",
      "code-block",
      "divider",
      "table",
      "math-block",
      "mermaid",
      "image",
      "copy-block",
      "duplicate-block",
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

test("Tiptap block actions duplicate target Markdown below the block", () => {
  const { calls, editor } = createEditor();
  const controller = createTiptapBlockActionController();

  assert.equal(
    controller.run("duplicate-block", {
      editor,
      target: { pos: 2, node: { nodeSize: 6 } },
    }).ok,
    true,
  );
  assert.deepEqual(calls, [
    ["focus", 2],
    ["textBetween", 2, 8],
    ["insertContentAt", 8, "\nBlock text\n", "markdown"],
    ["focus", null],
  ]);
});

test("Tiptap block actions prefer Markdown manager serialization for duplicate", () => {
  const { calls, editor } = createEditor();
  editor.storage = {
    markdown: {
      manager: {
        serialize(json) {
          calls.push(["serialize", json.type]);
          return "## Serialized";
        },
      },
    },
  };
  const controller = createTiptapBlockActionController();

  assert.equal(
    controller.run("duplicate-block", {
      editor,
      target: {
        pos: 2,
        node: {
          nodeSize: 6,
          toJSON: () => ({ type: "heading", attrs: { level: 2 }, content: [] }),
        },
      },
    }).ok,
    true,
  );
  assert.deepEqual(calls, [
    ["focus", 2],
    ["serialize", "heading"],
    ["insertContentAt", 8, "\n## Serialized\n", "markdown"],
    ["focus", null],
  ]);
});

test("Tiptap block actions expose menu metadata in priority order", () => {
  const controller = createTiptapBlockActionController();

  assert.deepEqual(controller.list()[13], {
    id: "table",
    title: "Table",
    description: "Insert a 3 by 2 table",
    group: "Advanced",
    icon: "table",
    shortcut: "",
    tone: "default",
  });
});

test("Tiptap block actions show callout kind actions only for callout blocks", () => {
  const controller = createTiptapBlockActionController();

  assert.equal(
    controller
      .list({ target: { kind: "paragraph" } })
      .some((command) => command.id === "callout-kind-tip"),
    false,
  );
  assert.deepEqual(
    controller
      .list({
        target: {
          kind: "calloutBlock",
          node: { type: { name: "calloutBlock" }, nodeSize: 6 },
        },
      })
      .filter((command) => command.group === "Callout")
      .map((command) => command.id),
    [
      "callout-kind-note",
      "callout-kind-tip",
      "callout-kind-warning",
      "callout-kind-danger",
    ],
  );
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

test("Tiptap block actions create rich callout blocks when available", () => {
  const { calls, editor } = createEditor();
  const controller = createTiptapBlockActionController();

  assert.equal(controller.run("callout", { editor, target: { pos: 3 } }).ok, true);
  assert.deepEqual(calls, [
    ["focus", 3],
    ["setCalloutBlock", "NOTE", "Callout text"],
    ["focus", null],
  ]);
});

test("Tiptap block actions switch existing callout kinds", () => {
  const { calls, editor } = createEditor();
  const controller = createTiptapBlockActionController();

  assert.equal(
    controller.run("callout-kind-warning", {
      editor,
      target: { pos: 11, kind: "calloutBlock", node: { type: "calloutBlock" } },
    }).ok,
    true,
  );
  assert.deepEqual(calls, [
    ["focus", 11],
    ["setCalloutKind", "WARNING", 11],
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

test("Tiptap block actions fall back to Markdown for callouts", () => {
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

  assert.equal(controller.run("callout", { editor, target: { pos: 7 } }).ok, true);
  assert.deepEqual(calls, [
    ["focus", 7],
    ["insertContent", "\n> [!NOTE]\n> Callout text\n", "markdown"],
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
