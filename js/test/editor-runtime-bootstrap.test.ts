import test from "node:test";
import assert from "node:assert/strict";

import { importBundledModule } from "./helpers/load-esbuild-module.js";

const {
  createEditorRuntimeFacade,
  installPapyroEditorRuntime,
} = await importBundledModule(
  new URL("../src/editor-runtime-bootstrap.js", import.meta.url),
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

test("editor runtime bootstrap creates a stable host facade", () => {
  const runtime = createRuntimeAdapter({ kind: "tiptap" });
  const facade = createEditorRuntimeFacade({
    requestedKind: "tiptap",
    adapters: { tiptap: runtime },
  });

  assert.equal(facade.kind, undefined);
  assert.equal(facade.ensureEditor(), "ensureEditor");
  assert.equal(facade.handleRustMessage(), "handleRustMessage");
});

test("editor runtime bootstrap installs the facade on the host object", () => {
  const host = { PAPYRO_EDITOR_RUNTIME: "tiptap" };
  const tiptap = createRuntimeAdapter({ kind: "tiptap" });

  const facade = installPapyroEditorRuntime(host, {
    adapters: { tiptap },
  });

  assert.equal(host.papyroEditor, facade);
  assert.equal(host.papyroEditor.ensureEditor(), "ensureEditor");
});

test("editor runtime bootstrap allows explicit runtime overrides", () => {
  const calls = [];
  const host = { PAPYRO_EDITOR_RUNTIME: "unknown" };
  const facade = installPapyroEditorRuntime(host, {
    requestedKind: "tiptap",
    adapters: { tiptap: createRuntimeAdapter() },
    createFacade: (adapter) => {
      calls.push(adapter);
      return { mounted: true };
    },
  });

  assert.deepEqual(facade, { mounted: true });
  assert.equal(calls.length, 1);
});

test("editor runtime bootstrap rejects missing runtime adapters", () => {
  assert.throws(
    () => createEditorRuntimeFacade({ adapters: {} }),
    /No Papyro editor runtime adapter/,
  );
  assert.throws(
    () => installPapyroEditorRuntime(null, { adapters: {} }),
    /requires a host object/,
  );
});
