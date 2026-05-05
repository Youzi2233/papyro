import test from "node:test";
import assert from "node:assert/strict";

import {
  applyMarkToBlockText,
  blockTextRanges,
  createPapyroTextStyleExtensions,
} from "../src/tiptap-text-style.js";
import {
  roundTripTiptapMarkdown,
  serializeTiptapMarkdown,
} from "../src/tiptap-markdown.js";

function collectMarks(node, marks = []) {
  if (!node || typeof node !== "object") return marks;

  for (const mark of node.marks ?? []) {
    marks.push({
      type: mark.type,
      attrs: mark.attrs ?? {},
      text: node.text ?? "",
    });
  }

  for (const child of node.content ?? []) {
    collectMarks(child, marks);
  }

  return marks;
}

test("Papyro text style extensions expose reusable color and highlight marks", () => {
  assert.deepEqual(
    createPapyroTextStyleExtensions().map((extension) => extension.name),
    ["textStyle", "color", "highlight"],
  );
});

test("Tiptap Markdown highlight syntax remains portable", () => {
  const markdown = "Use ==careful emphasis== inside notes.";
  const { parsed, serialized, reparsed } = roundTripTiptapMarkdown(markdown);

  assert.deepEqual(collectMarks(parsed), [
    { type: "highlight", attrs: {}, text: "careful emphasis" },
  ]);
  assert.equal(serialized, markdown);
  assert.deepEqual(collectMarks(reparsed), collectMarks(parsed));
});

test("Tiptap Markdown serializes colored text as inline HTML", () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Accent",
            marks: [
              {
                type: "textStyle",
                attrs: { color: "var(--mn-accent)" },
              },
            ],
          },
        ],
      },
    ],
  };

  assert.equal(
    serializeTiptapMarkdown(doc),
    '<span style="color: var(--mn-accent)">Accent</span>',
  );
});

test("Papyro block style helpers mark the text ranges inside a block", () => {
  const calls = [];
  const marks = {
    highlight: {
      create: (attrs) => ({ type: "highlight", attrs }),
    },
  };
  const tr = {
    addMark(from, to, mark) {
      calls.push(["addMark", from, to, mark]);
      return tr;
    },
  };
  const node = { nodeSize: 12, type: { name: "paragraph" } };
  const textNode = { isText: true, nodeSize: 10, type: { name: "text" } };
  const editor = {
    commands: {
      focus() {
        calls.push(["focus"]);
      },
    },
    state: {
      schema: { marks },
      tr,
      doc: {
        nodesBetween(from, to, visit) {
          calls.push(["nodesBetween", from, to]);
          visit(node, from);
          visit(textNode, from + 1);
        },
      },
    },
    view: {
      dispatch(transaction) {
        calls.push(["dispatch", transaction === tr]);
      },
    },
  };

  assert.deepEqual(blockTextRanges(editor, { pos: 0, node }), [{ from: 1, to: 11 }]);
  calls.length = 0;
  assert.equal(
    applyMarkToBlockText(editor, { pos: 0, node }, "highlight", {
      color: "rgba(245, 158, 11, 0.2)",
    }),
    true,
  );
  assert.deepEqual(calls, [
    ["nodesBetween", 0, 12],
    [
      "addMark",
      1,
      11,
      { type: "highlight", attrs: { color: "rgba(245, 158, 11, 0.2)" } },
    ],
    ["dispatch", true],
    ["focus"],
  ]);
});
