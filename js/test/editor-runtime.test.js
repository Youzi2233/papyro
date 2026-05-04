import test from "node:test";
import assert from "node:assert/strict";

import {
  EDITOR_RUNTIME_ADAPTER_METHODS,
  assertEditorRuntimeAdapter,
  createCodeMirrorRuntimeAdapter,
  createPapyroEditorFacade,
  missingEditorRuntimeAdapterMethods,
} from "../src/editor-runtime.js";

function createRuntimeAdapter(overrides = {}) {
  return {
    ensureEditor: () => "ensureEditor",
    attachChannel: () => "attachChannel",
    handleRustMessage: () => "handleRustMessage",
    attachPreviewScroll: () => "attachPreviewScroll",
    navigateOutline: () => "navigateOutline",
    syncOutline: () => "syncOutline",
    scrollEditorToLine: () => "scrollEditorToLine",
    scrollPreviewToHeading: () => "scrollPreviewToHeading",
    renderPreviewMermaid: () => "renderPreviewMermaid",
    ...overrides,
  };
}

test("runtime adapter validation reports missing methods", () => {
  assert.deepEqual(missingEditorRuntimeAdapterMethods(null), EDITOR_RUNTIME_ADAPTER_METHODS);
  assert.deepEqual(missingEditorRuntimeAdapterMethods({ ensureEditor: () => {} }), [
    "attachChannel",
    "handleRustMessage",
    "attachPreviewScroll",
    "navigateOutline",
    "syncOutline",
    "scrollEditorToLine",
    "scrollPreviewToHeading",
    "renderPreviewMermaid",
  ]);
});

test("runtime adapter validation rejects incomplete adapters", () => {
  assert.throws(
    () => assertEditorRuntimeAdapter(createRuntimeAdapter({ syncOutline: undefined })),
    /missing: syncOutline/,
  );
});

test("CodeMirror runtime adapter keeps an explicit runtime kind", () => {
  const runtime = createCodeMirrorRuntimeAdapter(createRuntimeAdapter({ kind: "custom" }));

  assert.equal(runtime.kind, "codemirror");
  assert.equal(runtime.ensureEditor(), "ensureEditor");
});

test("Papyro editor facade delegates calls without exposing runtime internals", () => {
  const calls = [];
  const runtime = createCodeMirrorRuntimeAdapter(
    createRuntimeAdapter({
      ensureEditor: (...args) => calls.push(["ensureEditor", args]),
      handleRustMessage: (...args) => calls.push(["handleRustMessage", args]),
    }),
  );
  const facade = createPapyroEditorFacade(runtime);

  facade.ensureEditor({ tabId: "tab-a" });
  facade.handleRustMessage("tab-a", { type: "set_content" });

  assert.equal(facade.kind, undefined);
  assert.deepEqual(calls, [
    ["ensureEditor", [{ tabId: "tab-a" }]],
    ["handleRustMessage", ["tab-a", { type: "set_content" }]],
  ]);
});
