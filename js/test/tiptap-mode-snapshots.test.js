import test from "node:test";
import assert from "node:assert/strict";

import { createTiptapModeSnapshotController } from "../src/tiptap-mode-snapshots.js";

function createEditorSelectionHarness() {
  const calls = [];
  const editor = {
    state: {
      selection: {
        from: 4,
        to: 9,
      },
    },
    commands: {
      focus: () => calls.push(["focus"]),
      setTextSelection: (selection) => {
        calls.push(["setTextSelection", selection.from, selection.to]);
        return true;
      },
    },
  };
  return { calls, editor };
}

function createSourcePane() {
  const textarea = {
    value: "Hello source",
    selectionStart: 2,
    selectionEnd: 7,
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
    focus() {
      this.focused = true;
    },
  };
  return { textarea };
}

test("Tiptap mode snapshots capture and restore Hybrid editor selections", () => {
  const { calls, editor } = createEditorSelectionHarness();
  const controller = createTiptapModeSnapshotController();
  const entry = {
    viewMode: "hybrid",
    editor,
    markdownSync: { markdown: "# Note" },
  };

  assert.deepEqual(controller.capture(entry), {
    mode: "hybrid",
    selection: { from: 4, to: 9 },
    markdownRevision: 6,
  });

  editor.state.selection = { from: 1, to: 1 };

  assert.equal(controller.restore(entry, "hybrid"), true);
  assert.deepEqual(calls, [
    ["setTextSelection", 4, 9],
    ["focus"],
  ]);
});

test("Tiptap mode snapshots skip stale Hybrid selections after content changes", () => {
  const { calls, editor } = createEditorSelectionHarness();
  const controller = createTiptapModeSnapshotController();
  const entry = {
    viewMode: "hybrid",
    editor,
    markdownSync: { markdown: "# Note" },
  };

  controller.capture(entry);
  entry.markdownSync.markdown = "# Updated note";

  assert.equal(controller.restore(entry, "hybrid"), false);
  assert.deepEqual(calls, []);
});

test("Tiptap mode snapshots capture and restore Source textarea selections", () => {
  const sourcePane = createSourcePane();
  const controller = createTiptapModeSnapshotController();
  const entry = {
    viewMode: "source",
    sourcePane,
    markdownSync: { markdown: "Hello source" },
  };

  assert.deepEqual(controller.capture(entry), {
    mode: "source",
    selection: { from: 2, to: 7 },
    markdownRevision: 12,
  });

  sourcePane.textarea.value = "Hi";
  sourcePane.textarea.selectionStart = 0;
  sourcePane.textarea.selectionEnd = 0;

  assert.equal(controller.restore(entry, "source"), true);
  assert.deepEqual(
    [sourcePane.textarea.selectionStart, sourcePane.textarea.selectionEnd],
    [2, 2],
  );
  assert.equal(sourcePane.textarea.focused, true);
});

test("Tiptap mode snapshots skip stale Source selections after content changes", () => {
  const sourcePane = createSourcePane();
  const controller = createTiptapModeSnapshotController();
  const entry = {
    viewMode: "source",
    sourcePane,
    markdownSync: { markdown: "Hello source" },
  };

  controller.capture(entry);
  entry.markdownSync.markdown = "Changed source";
  sourcePane.textarea.selectionStart = 0;
  sourcePane.textarea.selectionEnd = 0;

  assert.equal(controller.restore(entry, "source"), false);
  assert.deepEqual(
    [sourcePane.textarea.selectionStart, sourcePane.textarea.selectionEnd],
    [0, 0],
  );
});
