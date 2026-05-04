import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_EDITOR_RUNTIME_KIND,
  normalizeEditorRuntimeKind,
  selectEditorRuntimeAdapter,
} from "../src/editor-runtime-selector.js";

test("editor runtime selector defaults to CodeMirror", () => {
  assert.equal(DEFAULT_EDITOR_RUNTIME_KIND, "codemirror");
  assert.equal(normalizeEditorRuntimeKind(undefined), "codemirror");
  assert.equal(normalizeEditorRuntimeKind("unknown"), "codemirror");
});

test("editor runtime selector can opt into Tiptap", () => {
  const adapters = {
    codemirror: { kind: "codemirror" },
    tiptap: { kind: "tiptap" },
  };

  assert.equal(selectEditorRuntimeAdapter({ requestedKind: "tiptap", adapters }), adapters.tiptap);
});

test("editor runtime selector falls back to CodeMirror when requested adapter is absent", () => {
  const adapters = {
    codemirror: { kind: "codemirror" },
  };

  assert.equal(selectEditorRuntimeAdapter({ requestedKind: "tiptap", adapters }), adapters.codemirror);
});
