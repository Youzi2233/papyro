import test from "node:test";
import assert from "node:assert/strict";

import { createMarkdownSyncController } from "../src/markdown-sync-controller.js";
import { parseTiptapMarkdown } from "../src/tiptap-markdown.js";

test("MarkdownSyncController keeps canonical Markdown after set", () => {
  const controller = createMarkdownSyncController();
  const result = controller.setMarkdown("# Title\n\nBody");

  assert.equal(result.ok, true);
  assert.equal(controller.markdown, "# Title\n\nBody");
  assert.equal(controller.lastError, null);
  assert.equal(result.doc.content[0].type, "heading");
});

test("MarkdownSyncController inserts snippets at a bounded offset", () => {
  const controller = createMarkdownSyncController({ initialMarkdown: "# Title\n\nBody" });

  const result = controller.insertMarkdown("\n- item", 999);

  assert.equal(result.ok, true);
  assert.equal(controller.markdown, "# Title\n\nBody\n- item");
});

test("MarkdownSyncController can update from Tiptap editor markdown", () => {
  const controller = createMarkdownSyncController({ initialMarkdown: "# Old" });
  const markdown = controller.setFromEditor({
    getMarkdown: () => "## New",
  });

  assert.equal(markdown, "## New");
  assert.equal(controller.markdown, "## New");
  assert.equal(controller.lastError, null);
});

test("MarkdownSyncController serializes a Tiptap document into canonical Markdown", () => {
  const controller = createMarkdownSyncController();
  const doc = parseTiptapMarkdown("A paragraph with **bold**.");
  const result = controller.serializeDoc(doc);

  assert.deepEqual(result, {
    ok: true,
    markdown: "A paragraph with **bold**.",
  });
  assert.equal(controller.markdown, "A paragraph with **bold**.");
});

test("MarkdownSyncController reports parse errors without losing previous Markdown", () => {
  const manager = {
    parse(markdown) {
      throw new Error(`cannot parse ${markdown}`);
    },
  };
  const controller = createMarkdownSyncController({
    initialMarkdown: "# Safe",
    manager,
  });

  const result = controller.setMarkdown("# Broken");

  assert.equal(result.ok, false);
  assert.equal(result.error.type, "markdown_parse_failed");
  assert.equal(result.error.markdown, "# Broken");
  assert.equal(controller.markdown, "# Safe");
  assert.equal(controller.lastError.message, "cannot parse # Broken");
});

test("MarkdownSyncController requires editor.getMarkdown for editor-origin updates", () => {
  const controller = createMarkdownSyncController();

  assert.throws(() => controller.setFromEditor({}), /requires editor\.getMarkdown/);
});
