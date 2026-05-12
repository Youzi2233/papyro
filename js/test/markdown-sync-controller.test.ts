import test from "node:test";
import assert from "node:assert/strict";
import { importBundledModule } from "./helpers/load-esbuild-module.js";

const { createMarkdownSyncController } = await importBundledModule(
  new URL("../src/markdown-sync-controller.js", import.meta.url),
);
const { parseTiptapMarkdown } = await importBundledModule(
  new URL("../src/tiptap-markdown.js", import.meta.url),
);

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

test("MarkdownSyncController serializes editor JSON before getMarkdown fallback", () => {
  const controller = createMarkdownSyncController({ initialMarkdown: "# Old" });
  const markdown = controller.setFromEditor({
    getJSON: () => ({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: {
            id: "runtime-heading",
            level: 1,
          },
          content: [{ type: "text", text: "New" }],
        },
        {
          type: "paragraph",
          attrs: {
            id: "runtime-trailing",
          },
        },
      ],
    }),
    getMarkdown: () => "# New\n\n",
  });

  assert.equal(markdown, "# New");
  assert.equal(controller.markdown, "# New");
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

test("MarkdownSyncController requires editor.getJSON or getMarkdown for editor-origin updates", () => {
  const controller = createMarkdownSyncController();

  assert.throws(() => controller.setFromEditor({}), /requires editor\.getJSON\(\) or editor\.getMarkdown\(\)/);
});
