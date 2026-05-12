import test from "node:test";
import assert from "node:assert/strict";

import {
  createTiptapModeController,
  normalizeTiptapViewMode,
  tiptapModeAllowsRichTextEditing,
} from "../src/tiptap-mode-controller.js";

test("Tiptap mode controller normalizes supported modes", () => {
  assert.equal(normalizeTiptapViewMode("Source"), "source");
  assert.equal(normalizeTiptapViewMode(" HYBRID "), "hybrid");
  assert.equal(normalizeTiptapViewMode("preview"), "preview");
  assert.equal(normalizeTiptapViewMode("unknown"), "hybrid");
});

test("Tiptap rich text editing is enabled only in Hybrid", () => {
  assert.equal(tiptapModeAllowsRichTextEditing("hybrid"), true);
  assert.equal(tiptapModeAllowsRichTextEditing("source"), false);
  assert.equal(tiptapModeAllowsRichTextEditing("preview"), false);
});

test("Tiptap mode controller applies mode to entry, DOM, and editor", () => {
  const editable = [];
  const controller = createTiptapModeController("Preview");
  const entry = {
    viewMode: "hybrid",
    dom: { dataset: {} },
    editor: {
      setEditable(value) {
        editable.push(value);
      },
    },
  };

  assert.equal(controller.mode, "preview");
  assert.equal(controller.apply(entry, "source"), "source");
  assert.equal(entry.viewMode, "source");
  assert.equal(entry.dom.dataset.viewMode, "source");
  assert.deepEqual(editable, [false]);

  assert.equal(controller.apply(entry, "hybrid"), "hybrid");
  assert.deepEqual(editable, [false, true]);
});
