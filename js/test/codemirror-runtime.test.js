import test from "node:test";
import assert from "node:assert/strict";

import { createCodeMirrorEditorRuntime } from "../src/codemirror-runtime.js";
import { createEditorRuntimeRegistry } from "../src/editor-registry.js";

function createView(label = "view") {
  return {
    label,
    dom: {
      dataset: {},
      parentElement: null,
    },
  };
}

function createContainer() {
  return {
    children: [],
    replaceChildren(child) {
      this.children = [child];
      child.parentElement = this;
    },
  };
}

function createRuntimeHarness({ container = createContainer(), spareView = null } = {}) {
  const calls = [];
  const registry = createEditorRuntimeRegistry();
  const dependencies = {
    registry,
    dom: {
      document: {
        getElementById: (containerId) => (containerId === "editor-root" ? container : null),
      },
      isElement: (value) => value === container,
    },
    viewPool: {
      takeSpareView: () => spareView,
      resetViewState: (view, content) => calls.push(["resetViewState", view.label, content]),
      scheduleWarmSpare: () => calls.push(["scheduleWarmSpare"]),
    },
    viewFactory: {
      attachViewToTab: (view, tabId, target, instanceId, initialContent, viewMode) => {
        calls.push(["attachViewToTab", view.label, tabId, instanceId, initialContent, viewMode]);
        target.replaceChildren(view.dom);
        registry.set(tabId, {
          view,
          instanceId,
          dioxus: null,
          suppressChange: false,
          viewMode: viewMode ?? "hybrid",
        });
      },
      createEditorView: ({ container: target, initialContent }) => {
        calls.push(["createEditorView", initialContent]);
        const view = createView("created");
        target.replaceChildren(view.dom);
        return view;
      },
      createEntry: ({ view, instanceId }) => ({
        view,
        instanceId,
        dioxus: null,
        suppressChange: false,
        viewMode: "hybrid",
      }),
    },
    protocol: {
      handleRustMessage: (runtimeRegistry, tabId, message, options) => {
        calls.push([
          "handleRustMessage",
          runtimeRegistry === registry,
          tabId,
          message.type,
          message.mode ?? null,
          typeof options.setViewMode,
        ]);
        if (message.type === "set_view_mode") {
          const entry = registry.get(tabId);
          if (entry) entry.viewMode = message.mode;
        }
        return "handled";
      },
      applyFormat: () => {},
      refreshEditorLayout: () => {},
      setEditorPreferences: () => {},
      setBlockHints: () => {},
      setViewMode: () => {},
    },
    layout: {
      attachEditorScroll: (tabId, entry) => calls.push(["attachEditorScroll", tabId, entry.view.label]),
      attachLayoutObserver: (tabId, target, dioxus) => {
        calls.push(["attachLayoutObserver", tabId, target === container, dioxus.id]);
      },
    },
    navigation: {
      attachPreviewScroll: () => "preview-scroll",
      navigateOutline: () => "navigate-outline",
      syncOutline: (tabId, mode) => calls.push(["syncOutline", tabId, mode]),
      scrollEditorToLine: () => "editor-line",
      scrollPreviewToHeading: () => "preview-heading",
      renderPreviewMermaid: () => "mermaid",
    },
  };

  return {
    calls,
    registry,
    runtime: createCodeMirrorEditorRuntime(dependencies),
  };
}

test("CodeMirror editor runtime rejects missing containers", () => {
  const { runtime } = createRuntimeHarness();

  assert.throws(
    () => runtime.ensureEditor({ tabId: "tab-a", containerId: "missing" }),
    /Editor container not found: missing/,
  );
});

test("CodeMirror editor runtime creates a fresh view and registers it", () => {
  const { calls, registry, runtime } = createRuntimeHarness();

  const view = runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    instanceId: "host-a",
    initialContent: "# Note",
    viewMode: "source",
  });

  assert.equal(view.label, "created");
  assert.equal(view.dom.dataset.tabId, "tab-a");
  assert.equal(registry.get("tab-a").instanceId, "host-a");
  assert.equal(registry.get("tab-a").viewMode, "source");
  assert.deepEqual(calls, [
    ["createEditorView", "# Note"],
    ["handleRustMessage", true, "tab-a", "set_view_mode", "source", "function"],
    ["scheduleWarmSpare"],
  ]);
});

test("CodeMirror editor runtime reuses spare views", () => {
  const spareView = createView("spare");
  const { calls, runtime } = createRuntimeHarness({ spareView });

  assert.equal(
    runtime.ensureEditor({
      tabId: "tab-a",
      containerId: "editor-root",
      instanceId: "host-a",
      initialContent: "content",
      viewMode: "hybrid",
    }),
    spareView,
  );

  assert.deepEqual(calls, [
    ["resetViewState", "spare", "content"],
    ["attachViewToTab", "spare", "tab-a", "host-a", "content", "hybrid"],
    ["scheduleWarmSpare"],
  ]);
});

test("CodeMirror editor runtime reattaches existing views", () => {
  const view = createView("existing");
  const container = createContainer();
  const { calls, registry, runtime } = createRuntimeHarness({ container });
  registry.set("tab-a", {
    view,
    instanceId: "old-host",
    dioxus: null,
    suppressChange: false,
    viewMode: "hybrid",
  });

  assert.equal(
    runtime.ensureEditor({
      tabId: "tab-a",
      containerId: "editor-root",
      instanceId: "host-a",
      viewMode: "preview",
    }),
    view,
  );

  assert.equal(view.dom.parentElement, container);
  assert.equal(registry.get("tab-a").instanceId, "host-a");
  assert.equal(registry.get("tab-a").viewMode, "preview");
  assert.deepEqual(calls, [
    ["handleRustMessage", true, "tab-a", "set_view_mode", "preview", "function"],
  ]);
});

test("CodeMirror editor runtime proxies channels and messages", () => {
  const view = createView("existing");
  const container = createContainer();
  container.replaceChildren(view.dom);
  const { calls, registry, runtime } = createRuntimeHarness({ container });
  registry.set("tab-a", {
    view,
    instanceId: "host-a",
    dioxus: null,
    suppressChange: false,
    viewMode: "hybrid",
  });

  assert.equal(runtime.handleRustMessage("tab-a", { type: "focus" }), "handled");
  runtime.attachChannel("tab-a", { id: "dioxus-a" });

  assert.equal(registry.get("tab-a").dioxus.id, "dioxus-a");
  assert.deepEqual(calls, [
    ["handleRustMessage", true, "tab-a", "focus", null, "function"],
    ["attachEditorScroll", "tab-a", "existing"],
    ["syncOutline", "tab-a", "hybrid"],
    ["attachLayoutObserver", "tab-a", true, "dioxus-a"],
  ]);
});
