import test from "node:test";
import assert from "node:assert/strict";

import { importBundledModule } from "./helpers/load-esbuild-module.js";

const {
  createEditorRuntimeFacade,
  installPapyroEditorRuntime,
} = await importBundledModule(
  new URL("../src/editor-runtime-bootstrap.ts", import.meta.url),
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
    renderPreviewMath: () => "renderPreviewMath",
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
  assert.equal(facade.runtimeKind, "tiptap");
  assert.equal(facade.describe().runtimeKind, "tiptap");
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
  assert.equal(Object.getOwnPropertyDescriptor(host, "papyroEditor").writable, false);
  assert.equal(Object.getOwnPropertyDescriptor(host, "papyroEditor").configurable, false);
});

test("editor runtime bootstrap allows explicit runtime overrides", () => {
  const calls = [];
  const host = { PAPYRO_EDITOR_RUNTIME: "unknown" };
  const mounted = createEditorRuntimeFacade({
    requestedKind: "tiptap",
    adapters: { tiptap: createRuntimeAdapter({ kind: "tiptap" }) },
  });
  const facade = installPapyroEditorRuntime(host, {
    requestedKind: "tiptap",
    adapters: { tiptap: createRuntimeAdapter() },
    createFacade: (adapter) => {
      calls.push(adapter);
      return mounted;
    },
  });

  assert.equal(facade, mounted);
  assert.equal(calls.length, 1);
});

test("editor runtime bootstrap reuses an existing valid facade", () => {
  const host = {};
  const tiptap = createRuntimeAdapter({ kind: "tiptap" });
  const facade = installPapyroEditorRuntime(host, {
    adapters: { tiptap },
  });
  const reused = installPapyroEditorRuntime(host, {
    adapters: { tiptap: createRuntimeAdapter() },
  });

  assert.equal(reused, facade);
  assert.equal(host.papyroEditor, facade);
});

test("editor runtime bootstrap rejects an existing invalid facade", () => {
  assert.throws(
    () => installPapyroEditorRuntime({ papyroEditor: {} }, { adapters: {} }),
    /Invalid Papyro editor facade/,
  );
});

test("editor runtime bootstrap rejects invalid facade factories", () => {
  assert.throws(
    () =>
      createEditorRuntimeFacade({
        adapters: { tiptap: createRuntimeAdapter({ kind: "tiptap" }) },
        createFacade: () => ({ mounted: true }),
      }),
    /Invalid Papyro editor facade/,
  );
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
