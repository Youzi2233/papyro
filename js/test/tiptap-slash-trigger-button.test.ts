import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";

import { insertSlashCommand } from "../src/components/tiptap-ui/slash-command-trigger-button/use-slash-command-trigger.ts";
import { createPapyroTableExtensions } from "../src/tiptap-table.ts";

function destroy(editor: Editor) {
  try {
    editor.destroy();
  } catch {
    // Ignore detached headless editor cleanup failures.
  }
}

test("slash trigger inserts into an empty text block target", () => {
  const editor = new Editor({
    extensions: [StarterKit],
    content: {
      type: "doc",
      content: [{ type: "paragraph" }],
    },
  });

  try {
    const paragraph = editor.state.doc.firstChild;
    assert.ok(paragraph);
    assert.equal(insertSlashCommand(editor, "/", paragraph, 0), true);

    assert.deepEqual(editor.getJSON(), {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "/" }],
        },
      ],
    });
    assert.equal(editor.state.selection.from, 2);
  } finally {
    destroy(editor);
  }
});

test("slash trigger inserts a command paragraph after a heading target", () => {
  const editor = new Editor({
    extensions: [StarterKit],
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Roadmap" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Next" }],
        },
      ],
    },
  });

  try {
    const heading = editor.state.doc.firstChild;
    assert.ok(heading);
    assert.equal(insertSlashCommand(editor, "/", heading, 0), true);

    const content = editor.getJSON().content ?? [];
    assert.equal(content[0].type, "heading");
    assert.deepEqual(content[1], {
      type: "paragraph",
      content: [{ type: "text", text: "/" }],
    });
    assert.equal(content[2].type, "paragraph");
  } finally {
    destroy(editor);
  }
});

test("slash trigger inserts a command paragraph after a whole table target", () => {
  const table = {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            attrs: {
              align: null,
              backgroundColor: null,
              verticalAlign: null,
              colspan: 1,
              rowspan: 1,
              colwidth: null,
            },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "A" }],
              },
            ],
          },
        ],
      },
    ],
  };
  const editor = new Editor({
    extensions: [StarterKit, ...createPapyroTableExtensions()],
    content: {
      type: "doc",
      content: [
        table,
        {
          type: "paragraph",
          content: [{ type: "text", text: "Next" }],
        },
      ],
    },
  });

  try {
    const tableNode = editor.state.doc.firstChild;
    assert.ok(tableNode);
    assert.equal(insertSlashCommand(editor, "/", tableNode, 0), true);

    const content = editor.getJSON().content ?? [];
    assert.equal(content[0].type, "table");
    assert.deepEqual(content[1], {
      type: "paragraph",
      content: [{ type: "text", text: "/" }],
    });
    assert.equal(content[2].type, "paragraph");
  } finally {
    destroy(editor);
  }
});
