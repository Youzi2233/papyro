import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_EDITOR_RUNTIME_KIND,
  normalizeEditorRuntimeKind,
  selectEditorRuntimeAdapter,
} from "../src/editor-runtime-selector.ts";

test("editor runtime selector defaults to Tiptap on the migration branch", () => {
  assert.equal(DEFAULT_EDITOR_RUNTIME_KIND, "tiptap");
  assert.equal(normalizeEditorRuntimeKind(undefined), "tiptap");
  assert.equal(normalizeEditorRuntimeKind("unknown"), "tiptap");
  assert.equal(normalizeEditorRuntimeKind("codemirror"), "tiptap");
});

test("editor runtime selector uses Tiptap by default", () => {
  const adapters = {
    tiptap: { kind: "tiptap" },
  };

  assert.equal(selectEditorRuntimeAdapter({ requestedKind: undefined, adapters }), adapters.tiptap);
  assert.equal(selectEditorRuntimeAdapter({ requestedKind: "tiptap", adapters }), adapters.tiptap);
});

test("editor runtime selector reports missing Tiptap adapters", () => {
  assert.equal(selectEditorRuntimeAdapter({ requestedKind: "tiptap", adapters: {} }), null);
});
