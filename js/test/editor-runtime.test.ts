import test from "node:test";
import assert from "node:assert/strict";

import { importBundledModule } from "./helpers/load-esbuild-module.js";

const {
  EDITOR_RUNTIME_ADAPTER_METHODS,
  EDITOR_RUNTIME_HOST_METHODS,
  assertEditorRuntimeAdapter,
  assertEditorRuntimeHostAdapter,
  createEditorRuntimeAdapterContract,
  createPapyroEditorFacade,
  missingEditorRuntimeHostMethods,
  missingEditorRuntimeAdapterMethods,
} = await importBundledModule(
  new URL("../src/editor-runtime-contract.ts", import.meta.url),
);

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

test("host runtime adapter validation reports missing methods", () => {
  assert.deepEqual(missingEditorRuntimeHostMethods(null), EDITOR_RUNTIME_HOST_METHODS);
  assert.deepEqual(missingEditorRuntimeHostMethods({ ensureEditor: () => {} }), [
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

test("host runtime adapter validation rejects incomplete adapters", () => {
  assert.throws(
    () => assertEditorRuntimeHostAdapter(createRuntimeAdapter({ syncOutline: undefined })),
    /missing: syncOutline/,
  );
});

test("editor runtime adapter contract validation reports stable migration methods", () => {
  assert.deepEqual(missingEditorRuntimeAdapterMethods(null), EDITOR_RUNTIME_ADAPTER_METHODS);
  assert.deepEqual(missingEditorRuntimeAdapterMethods({ mount: () => {} }), [
    "attachChannel",
    "handleMessage",
    "setViewMode",
    "destroy",
    "getMarkdown",
    "attachPreviewScroll",
    "navigateOutline",
    "syncOutline",
    "scrollEditorToLine",
    "scrollPreviewToHeading",
    "renderPreviewMermaid",
  ]);
  assert.throws(
    () => assertEditorRuntimeAdapter({ mount: () => {} }),
    /missing: attachChannel/,
  );
});

test("editor runtime adapter contract bridges host messages to stable methods", () => {
  const calls = [];
  const host = createRuntimeAdapter({
    ensureEditor: (options) => {
      calls.push(["ensureEditor", options.tabId]);
      return { mounted: true };
    },
    attachChannel: (...args) => calls.push(["attachChannel", ...args]),
    handleRustMessage: (...args) => calls.push(["handleRustMessage", ...args]),
  });
  const adapter = createEditorRuntimeAdapterContract(host, {
    getMarkdown: (tabId) => `markdown:${tabId}`,
  });

  assert.deepEqual(adapter.mount({ tabId: "tab-a" }), { mounted: true });
  adapter.attachChannel("tab-a", "channel");
  adapter.handleMessage("tab-a", { type: "focus" });
  adapter.setViewMode("tab-a", "source");
  adapter.destroy("tab-a", "host-a");

  assert.equal(adapter.getMarkdown("tab-a"), "markdown:tab-a");
  assert.deepEqual(calls, [
    ["ensureEditor", "tab-a"],
    ["attachChannel", "tab-a", "channel"],
    ["handleRustMessage", "tab-a", { type: "focus" }],
    ["handleRustMessage", "tab-a", { type: "set_view_mode", mode: "source" }],
    ["handleRustMessage", "tab-a", { type: "destroy", instance_id: "host-a" }],
  ]);
});

test("editor runtime adapter contract requires getMarkdown implementation", () => {
  const adapter = createEditorRuntimeAdapterContract(createRuntimeAdapter());

  assert.throws(() => adapter.getMarkdown("tab-a"), /requires getMarkdown/);
});

test("Papyro editor facade delegates calls without exposing runtime internals", () => {
  const calls = [];
  const runtime = createRuntimeAdapter({
    kind: "tiptap",
    ensureEditor: (...args) => calls.push(["ensureEditor", args]),
    handleRustMessage: (...args) => calls.push(["handleRustMessage", args]),
  });
  const facade = createPapyroEditorFacade(runtime);

  facade.ensureEditor({ tabId: "tab-a" });
  facade.handleRustMessage("tab-a", { type: "set_content" });

  assert.equal(facade.kind, undefined);
  assert.deepEqual(calls, [
    ["ensureEditor", [{ tabId: "tab-a" }]],
    ["handleRustMessage", ["tab-a", { type: "set_content" }]],
  ]);
});
