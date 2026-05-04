import test from "node:test";
import assert from "node:assert/strict";

import { createEditorRuntimeRegistry } from "../src/editor-registry.js";
import { createTiptapEditorRuntime } from "../src/tiptap-runtime.js";

function createContainer() {
  return {
    children: [],
    replaceChildren(child) {
      this.children = [child];
      child.parentElement = this;
    },
  };
}

function createElement(tagName) {
  return {
    tagName,
    className: "",
    dataset: {},
    parentElement: null,
  };
}

function createRuntimeHarness({ container = createContainer() } = {}) {
  const calls = [];
  const registry = createEditorRuntimeRegistry();

  class FakeTiptapEditor {
    constructor(options) {
      this.options = options;
      this.destroyed = false;
      this.commands = {
        setContent: (content, options) => calls.push(["setContent", content, options.contentType]),
        insertContent: (content, options) =>
          calls.push(["insertContent", content, options.contentType]),
        focus: () => calls.push(["focus"]),
      };
      calls.push([
        "constructor",
        options.content,
        options.contentType,
        options.injectCSS,
        options.editable,
      ]);
    }

    mount(root) {
      this.root = root;
      calls.push(["mount", root.className, root.dataset.tabId]);
    }

    destroy() {
      this.destroyed = true;
      calls.push(["destroy"]);
    }
  }

  const runtime = createTiptapEditorRuntime({
    registry,
    dom: {
      document: {
        getElementById: (containerId) => (containerId === "editor-root" ? container : null),
      },
      createElement,
    },
    editorConstructor: FakeTiptapEditor,
    extensionsFactory: () => ["starter-kit"],
    markdownManagerFactory: ({ extensions }) => ({ extensions }),
    navigation: {
      attachPreviewScroll: () => "preview-scroll",
      navigateOutline: () => "navigate-outline",
      syncOutline: (tabId, mode) => calls.push(["syncOutline", tabId, mode]),
      scrollEditorToLine: () => "editor-line",
      scrollPreviewToHeading: () => "preview-heading",
      renderPreviewMermaid: () => "mermaid",
    },
  });

  return { calls, container, registry, runtime };
}

test("Tiptap runtime creates an editor instance and registry entry", () => {
  const { calls, container, registry, runtime } = createRuntimeHarness();

  const editor = runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    instanceId: "host-a",
    initialContent: "# Note",
    viewMode: "hybrid",
  });

  assert.equal(editor.root, container.children[0]);
  assert.equal(editor.root.dataset.tabId, "tab-a");
  assert.equal(editor.root.dataset.viewMode, "hybrid");
  assert.equal(registry.get("tab-a").instanceId, "host-a");
  assert.equal(registry.get("tab-a").markdown, "# Note");
  assert.deepEqual(calls, [
    ["constructor", "# Note", "markdown", false, true],
    ["mount", "mn-tiptap-runtime", "tab-a"],
  ]);
});

test("Tiptap runtime reattaches existing editors without rebuilding", () => {
  const { calls, container, registry, runtime } = createRuntimeHarness();
  const editor = runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    instanceId: "host-a",
    initialContent: "# Note",
    viewMode: "hybrid",
  });

  const reused = runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    instanceId: "host-b",
    viewMode: "preview",
  });

  assert.equal(reused, editor);
  assert.equal(registry.get("tab-a").instanceId, "host-b");
  assert.equal(registry.get("tab-a").viewMode, "preview");
  assert.equal(registry.get("tab-a").dom.dataset.viewMode, "preview");
  assert.deepEqual(calls, [
    ["constructor", "# Note", "markdown", false, true],
    ["mount", "mn-tiptap-runtime", "tab-a"],
  ]);
});

test("Tiptap runtime handles baseline Rust messages", () => {
  const { calls, registry, runtime } = createRuntimeHarness();
  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    initialContent: "# Note",
    viewMode: "hybrid",
  });
  calls.length = 0;

  runtime.attachChannel("tab-a", { id: "dioxus-a" });
  runtime.handleRustMessage("tab-a", { type: "set_view_mode", mode: "source" });
  runtime.handleRustMessage("tab-a", { type: "set_content", content: "## Updated" });
  runtime.handleRustMessage("tab-a", { type: "insert_markdown", markdown: "\n- item" });
  runtime.handleRustMessage("tab-a", { type: "focus" });

  assert.equal(registry.get("tab-a").dioxus.id, "dioxus-a");
  assert.equal(registry.get("tab-a").viewMode, "source");
  assert.equal(registry.get("tab-a").dom.dataset.viewMode, "source");
  assert.deepEqual(calls, [
    ["syncOutline", "tab-a", "hybrid"],
    ["syncOutline", "tab-a", "source"],
    ["setContent", "## Updated", "markdown"],
    ["insertContent", "\n- item", "markdown"],
    ["focus"],
  ]);
});

test("Tiptap runtime destroys and unregisters editor entries", () => {
  const { calls, registry, runtime } = createRuntimeHarness();
  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    initialContent: "# Note",
  });
  calls.length = 0;

  runtime.handleRustMessage("tab-a", { type: "destroy" });

  assert.equal(registry.has("tab-a"), false);
  assert.deepEqual(calls, [["destroy"]]);
});

test("Tiptap runtime keeps facade navigation methods available", () => {
  const { runtime } = createRuntimeHarness();

  assert.equal(runtime.attachPreviewScroll(), "preview-scroll");
  assert.equal(runtime.navigateOutline(), "navigate-outline");
  assert.equal(runtime.scrollEditorToLine(), "editor-line");
  assert.equal(runtime.scrollPreviewToHeading(), "preview-heading");
  assert.equal(runtime.renderPreviewMermaid(), "mermaid");
});
