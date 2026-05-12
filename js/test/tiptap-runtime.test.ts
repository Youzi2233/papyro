import test from "node:test";
import assert from "node:assert/strict";
import { createEditorRuntimeRegistry } from "../src/editor-registry.js";
import { importBundledModule } from "./helpers/load-esbuild-module.js";

const { createTiptapEditorRuntime } = await importBundledModule(
  new URL("../src/editor-runtime.ts", import.meta.url),
);

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
    value: "",
    hidden: false,
    selectionStart: 0,
    selectionEnd: 0,
    attributes: {},
    listeners: new Map(),
    appendChild(child) {
      child.parentElement = this;
      return child;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      if (this.listeners.get(type) === handler) {
        this.listeners.delete(type);
      }
    },
    dispatch(type, event = {}) {
      this.listeners.get(type)?.(event);
    },
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
    focus() {},
    remove() {
      this.parentElement = null;
    },
  };
}

function createRuntimeHarness({
  container = createContainer(),
  clipboard,
  createEditorHostElement,
  mountEditorTree,
  layout,
  document: documentOverride,
} = {}) {
  const calls = [];
  const registry = createEditorRuntimeRegistry();

  class FakeTiptapEditor {
    constructor(options) {
      this.options = options;
      this.destroyed = false;
      this.handlers = new Map();
      this.markdown = options.content;
      this.commands = {
        setContent: (content, options) => {
          this.markdown = content;
          calls.push(["setContent", content, options.contentType]);
        },
        insertContent: (content, options) => {
          this.markdown = `${this.markdown}${content}`;
          calls.push(["insertContent", content, options.contentType]);
          this.emit("update", { editor: this });
        },
        focus: () => calls.push(["focus"]),
        undo: () => {
          calls.push(["undo"]);
          return true;
        },
        redo: () => {
          calls.push(["redo"]);
          return true;
        },
        toggleBold: () => calls.push(["toggleBold"]),
        toggleItalic: () => calls.push(["toggleItalic"]),
        setHorizontalRule: () => calls.push(["setHorizontalRule"]),
        setParagraph: () => calls.push(["setParagraph"]),
        setTextSelection: (position) => {
          calls.push(["setTextSelection", position]);
          if (typeof position === "number") {
            this.state.selection = { from: position, to: position, empty: true };
          } else {
            this.state.selection = {
              from: position.from,
              to: position.to,
              empty: position.from === position.to,
            };
          }
          return true;
        },
        toggleHeading: (attrs) => calls.push(["toggleHeading", attrs.level]),
        setLink: (attrs) => {
          calls.push(["setLink", attrs.href]);
          return true;
        },
      };
      this.state = {
        selection: {
          from: 1,
          to: 1,
          empty: true,
        },
        doc: {
          textBetween: () => "",
        },
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

    on(eventName, handler) {
      this.handlers.set(eventName, handler);
    }

    emit(eventName, payload) {
      this.handlers.get(eventName)?.(payload);
    }

    getMarkdown() {
      return this.markdown;
    }

    setEditable(value) {
      this.editable = value;
      calls.push(["setEditable", value]);
    }

    destroy() {
      this.destroyed = true;
      calls.push(["destroy"]);
    }
  }

  const documentRef =
    documentOverride ??
    {
      getElementById: (containerId) => (containerId === "editor-root" ? container : null),
      createElement,
    };

  const runtime = createTiptapEditorRuntime({
    registry,
    dom: {
      document: documentRef,
      createElement,
    },
    editorConstructor: FakeTiptapEditor,
    ...(clipboard ? { clipboard } : {}),
    ...(createEditorHostElement ? { createEditorHostElement } : {}),
    ...(mountEditorTree ? { mountEditorTree } : {}),
    ...(layout ? { layout } : {}),
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
  assert.equal(editor.root.dataset.language, "english");
  assert.equal(editor.options.editorProps.attributes.class, "mn-tiptap-editor tiptap");
  assert.equal(registry.get("tab-a").instanceId, "host-a");
  assert.equal(registry.get("tab-a").markdownSync.markdown, "# Note");
  assert.deepEqual(calls, [
    ["constructor", "# Note", "markdown", false, true],
    ["mount", "mn-tiptap-runtime", "tab-a"],
    ["setEditable", true],
  ]);
});


test("Tiptap runtime attaches editor chrome and syncs outline on selection changes", () => {
  const calls = [];
  const container = createContainer();
  const harness = createRuntimeHarness({
    container,
    layout: {
      attachEditorScroll: (tabId, entry) => calls.push(["attachEditorScroll", tabId, entry.viewMode]),
      detachEditorScroll: (entry) => calls.push(["detachEditorScroll", entry.viewMode]),
      attachLayoutObserver: (tabId, target, dioxus) => {
        calls.push(["attachLayoutObserver", tabId, target === container, dioxus.id]);
      },
      restoreEditorScrollSnapshot: (entry) => calls.push(["restoreEditorScrollSnapshot", entry.viewMode]),
    },
  });
  harness.runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    instanceId: "host-a",
    initialContent: "# Note",
    viewMode: "hybrid",
  });

  harness.runtime.attachChannel("tab-a", { id: "dioxus-a" });
  harness.registry.get("tab-a").editor.emit("selectionUpdate");
  harness.runtime.handleRustMessage("tab-a", {
    type: "set_view_mode",
    mode: "source",
  });

  assert.deepEqual(calls, [
    ["attachEditorScroll", "tab-a", "hybrid"],
    ["attachLayoutObserver", "tab-a", true, "dioxus-a"],
    ["restoreEditorScrollSnapshot", "source"],
    ["attachEditorScroll", "tab-a", "source"],
  ]);
  assert.deepEqual(
    harness.calls.filter((call) => call[0] === "syncOutline"),
    [
      ["syncOutline", "tab-a", "hybrid"],
      ["syncOutline", "tab-a", "hybrid"],
      ["syncOutline", "tab-a", "source"],
    ],
  );
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
    ["setEditable", true],
    ["setEditable", false],
  ]);
});

test("Tiptap runtime can mount through a React island host", () => {
  const mountCalls = [];
  const createEditorHostElement = ({ root }) => {
    mountCalls.push(["createEditorElement", root.className]);
    return {
      className: "mn-tiptap-react-seed",
    };
  };
  const mountEditorTree = ({ root, editor, entry }) => {
    mountCalls.push(["reactMount", root.className, editor.markdown, entry.viewMode]);
    return {
      refresh: (nextEntry) => mountCalls.push([
        "reactRefresh",
        nextEntry?.viewMode,
        nextEntry?.preferences?.language,
        Boolean(nextEntry?.dioxus),
      ]),
      destroy: () => mountCalls.push(["reactDestroy"]),
    };
  };
  const { calls, runtime } = createRuntimeHarness({
    createEditorHostElement,
    mountEditorTree,
  });

  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    instanceId: "host-a",
    initialContent: "# React",
    viewMode: "hybrid",
  });
  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    instanceId: "host-b",
    viewMode: "source",
  });
  runtime.attachChannel("tab-a", { id: "dioxus-a" });
  runtime.handleRustMessage("tab-a", {
    type: "set_preferences",
    language: "Chinese",
  });
  runtime.handleRustMessage("tab-a", { type: "destroy", instance_id: "host-b" });

  assert.deepEqual(mountCalls, [
    ["createEditorElement", "mn-tiptap-runtime"],
    ["reactMount", "mn-tiptap-runtime", "# React", "hybrid"],
    ["reactRefresh", "source", "english", false],
    ["reactRefresh", "source", "english", true],
    ["reactRefresh", "source", "Chinese", true],
    ["reactDestroy"],
  ]);
  assert.deepEqual(
    calls.filter((call) => call[0] === "mount"),
    [],
);
});

test("Tiptap runtime passes the root into the React tree mount callback", () => {
  const mountCalls = [];
  const mountEditorTree = ({ root, editor }) => {
    mountCalls.push(["mount", root.className, root.dataset.tabId, editor.markdown]);
    return {
      refresh: () => mountCalls.push(["refresh"]),
      destroy: () => mountCalls.push(["destroy"]),
    };
  };
  const { runtime } = createRuntimeHarness({ mountEditorTree });

  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    initialContent: "# Island",
  });
  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    viewMode: "preview",
  });
  runtime.handleRustMessage("tab-a", { type: "destroy" });

  assert.deepEqual(mountCalls, [
    ["mount", "mn-tiptap-runtime", "tab-a", "# Island"],
    ["refresh"],
    ["destroy"],
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

  const messages = [];
  runtime.attachChannel("tab-a", { id: "dioxus-a", send: (message) => messages.push(message) });
  runtime.handleRustMessage("tab-a", { type: "set_view_mode", mode: "source" });
  runtime.handleRustMessage("tab-a", { type: "set_content", content: "## Updated" });
  runtime.handleRustMessage("tab-a", { type: "insert_markdown", markdown: "\n- item" });
  runtime.handleRustMessage("tab-a", {
    type: "set_preferences",
    auto_link_paste: false,
  });
  runtime.handleRustMessage("tab-a", {
    type: "set_block_hints",
    hints: {
      revision: 7,
      fallback: { type: "none" },
      blocks: [{ kind: "heading", from_line: 1, to_line: 1 }],
    },
  });
  runtime.handleRustMessage("tab-a", {
    type: "run_slash_command",
    command_id: "heading-2",
  });
  runtime.handleRustMessage("tab-a", {
    type: "run_format_command",
    command_id: "bold",
  });
  runtime.handleRustMessage("tab-a", { type: "undo" });
  runtime.handleRustMessage("tab-a", { type: "redo" });
  runtime.handleRustMessage("tab-a", { type: "focus" });

  assert.equal(registry.get("tab-a").dioxus.id, "dioxus-a");
  assert.equal(registry.get("tab-a").viewMode, "source");
  assert.deepEqual(registry.get("tab-a").preferences, {
    autoLinkPaste: false,
    language: "english",
  });
  assert.equal(registry.get("tab-a").blockHints.revision, 7);
  assert.equal(registry.get("tab-a").dom.dataset.viewMode, "source");
  assert.deepEqual(calls, [
    ["syncOutline", "tab-a", "hybrid"],
    ["setEditable", false],
    ["syncOutline", "tab-a", "source"],
    ["setContent", "## Updated", "markdown"],
    ["setContent", "\n- item## Updated", "markdown"],
    ["toggleHeading", 2],
    ["focus"],
    ["toggleBold"],
    ["focus"],
    ["undo"],
    ["focus"],
    ["redo"],
    ["focus"],
  ]);
  assert.deepEqual(messages, [
    {
      type: "content_changed",
      tab_id: "tab-a",
      content: "\n- item## Updated",
    },
  ]);
});

test("Tiptap runtime preserves set_view_mode protocol state", () => {
  const { calls, registry, runtime } = createRuntimeHarness();
  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    initialContent: "# Note",
    viewMode: "hybrid",
  });
  calls.length = 0;

  runtime.handleRustMessage("tab-a", { type: "set_view_mode", mode: "preview" });

  const entry = registry.get("tab-a");
  assert.equal(entry.viewMode, "preview");
  assert.equal(entry.dom.dataset.viewMode, "preview");
  assert.deepEqual(calls, [
    ["setEditable", false],
    ["syncOutline", "tab-a", "preview"],
  ]);
});

test("Tiptap runtime mode contract keeps rich editing Hybrid-only", () => {
  const { calls, registry, runtime } = createRuntimeHarness();

  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    initialContent: "# Note",
    viewMode: "preview",
  });

  assert.equal(registry.get("tab-a").viewMode, "preview");
  assert.equal(registry.get("tab-a").dom.dataset.viewMode, "preview");
  assert.deepEqual(calls, [
    ["constructor", "# Note", "markdown", false, false],
    ["mount", "mn-tiptap-runtime", "tab-a"],
    ["setEditable", false],
  ]);
  assert.equal(registry.get("tab-a").sourcePane.textarea.hidden, true);

  calls.length = 0;

  runtime.handleRustMessage("tab-a", { type: "set_view_mode", mode: "source" });
  assert.equal(registry.get("tab-a").sourcePane.textarea.hidden, false);
  runtime.handleRustMessage("tab-a", { type: "set_view_mode", mode: "hybrid" });
  assert.equal(registry.get("tab-a").sourcePane.textarea.hidden, true);

  assert.deepEqual(calls, [
    ["setEditable", false],
    ["syncOutline", "tab-a", "source"],
    ["setEditable", true],
    ["syncOutline", "tab-a", "hybrid"],
  ]);
});

test("Tiptap runtime preserves selection snapshots across Source and Hybrid modes", () => {
  const { calls, registry, runtime } = createRuntimeHarness();
  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    initialContent: "0123456789",
    viewMode: "hybrid",
  });
  const entry = registry.get("tab-a");
  const textarea = entry.sourcePane.textarea;
  calls.length = 0;

  entry.editor.state.selection = { from: 2, to: 5, empty: false };
  entry.editor.emit("selectionUpdate", { editor: entry.editor });

  runtime.handleRustMessage("tab-a", { type: "set_view_mode", mode: "source" });
  textarea.selectionStart = 6;
  textarea.selectionEnd = 9;
  runtime.handleRustMessage("tab-a", { type: "set_view_mode", mode: "hybrid" });
  runtime.handleRustMessage("tab-a", { type: "set_view_mode", mode: "source" });

  assert.deepEqual(
    calls.filter((call) => call[0] === "setTextSelection"),
    [["setTextSelection", { from: 2, to: 5 }]],
  );
  assert.equal(textarea.selectionStart, 6);
  assert.equal(textarea.selectionEnd, 9);
});

test("Tiptap runtime mode switching does not emit dirty content changes", () => {
  const { registry, runtime } = createRuntimeHarness();
  const messages = [];
  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    initialContent: "# Note",
    viewMode: "hybrid",
  });
  runtime.attachChannel("tab-a", { send: (message) => messages.push(message) });

  runtime.handleRustMessage("tab-a", { type: "set_view_mode", mode: "source" });
  runtime.handleRustMessage("tab-a", { type: "set_view_mode", mode: "preview" });
  runtime.handleRustMessage("tab-a", { type: "set_view_mode", mode: "hybrid" });

  assert.equal(registry.get("tab-a").markdownSync.markdown, "# Note");
  assert.deepEqual(messages, []);
});

test("Tiptap runtime preserves insert_markdown protocol updates", () => {
  const { calls, registry, runtime } = createRuntimeHarness();
  const messages = [];
  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    initialContent: "# Note",
    viewMode: "hybrid",
  });
  runtime.attachChannel("tab-a", { send: (message) => messages.push(message) });
  calls.length = 0;

  runtime.handleRustMessage("tab-a", {
    type: "insert_markdown",
    markdown: "\n- item",
  });

  assert.equal(registry.get("tab-a").editor.markdown, "# Note\n- item");
  assert.deepEqual(calls, [
    ["insertContent", "\n- item", "markdown"],
  ]);
  assert.deepEqual(messages, [
    {
      type: "content_changed",
      tab_id: "tab-a",
      content: "# Note\n- item",
    },
  ]);
});

test("Tiptap runtime mounts and updates the source pane", () => {
  const { registry, runtime } = createRuntimeHarness();

  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    initialContent: "# Note",
    viewMode: "source",
  });
  const entry = registry.get("tab-a");
  const textarea = entry.sourcePane.textarea;

  assert.equal(textarea.parentElement, entry.dom);
  assert.equal(textarea.hidden, false);
  assert.equal(textarea.value, "# Note");

  runtime.handleRustMessage("tab-a", { type: "set_view_mode", mode: "hybrid" });
  assert.equal(textarea.hidden, true);

  runtime.handleRustMessage("tab-a", { type: "set_content", content: "## Updated" });
  assert.equal(textarea.value, "## Updated");

  runtime.handleRustMessage("tab-a", { type: "destroy" });
  assert.equal(textarea.parentElement, null);
});

test("Tiptap runtime routes source mode insert and focus through source pane", () => {
  const { calls, registry, runtime } = createRuntimeHarness();
  const messages = [];
  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    initialContent: "# Note",
    viewMode: "source",
  });
  runtime.attachChannel("tab-a", { send: (message) => messages.push(message) });
  const textarea = registry.get("tab-a").sourcePane.textarea;
  textarea.selectionStart = textarea.value.length;
  textarea.selectionEnd = textarea.value.length;
  calls.length = 0;

  runtime.handleRustMessage("tab-a", {
    type: "insert_markdown",
    markdown: "$x$",
    cursor_offset: 2,
  });
  runtime.handleRustMessage("tab-a", { type: "focus" });

  assert.equal(textarea.value, "# Note$x$");
  assert.deepEqual(calls, [
    ["setContent", "# Note$x$", "markdown"],
  ]);
  assert.deepEqual(messages, [
    {
      type: "content_changed",
      tab_id: "tab-a",
      content: "# Note$x$",
    },
  ]);
});

test("Tiptap runtime applies preferences through runtime state", () => {
  const { container, registry, runtime } = createRuntimeHarness();
  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    initialContent: "# Note",
  });

  runtime.handleRustMessage("tab-a", {
    type: "set_preferences",
    auto_link_paste: false,
    language: "Chinese",
  });

  assert.deepEqual(registry.get("tab-a").preferences, {
    autoLinkPaste: false,
    language: "Chinese",
  });
  assert.equal(container.children[0].dataset.language, "Chinese");
});

test("Tiptap runtime reports parse failures without touching the editor", () => {
  const messages = [];
  const { calls, registry, runtime } = createRuntimeHarness();
  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    initialContent: "# Note",
  });
  runtime.attachChannel("tab-a", { send: (message) => messages.push(message) });
  registry.get("tab-a").markdownSync = {
    markdown: "# Note",
    setMarkdown: () => ({
      ok: false,
      error: new Error("parse failed"),
    }),
  };
  calls.length = 0;

  runtime.handleRustMessage("tab-a", { type: "set_content", content: "broken" });

  assert.deepEqual(calls, []);
  assert.deepEqual(messages, [
    {
      type: "runtime_error",
      tab_id: "tab-a",
      message: "parse failed",
    },
  ]);
});

test("Tiptap runtime reports slash command failures through runtime_error", () => {
  const messages = [];
  const { runtime } = createRuntimeHarness();
  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    initialContent: "# Note",
  });
  runtime.attachChannel("tab-a", { send: (message) => messages.push(message) });

  runtime.handleRustMessage("tab-a", {
    type: "run_slash_command",
    command_id: "missing-command",
  });

  assert.deepEqual(messages, [
    {
      type: "runtime_error",
      tab_id: "tab-a",
      message: "unknown_slash_command",
    },
  ]);
});

test("Tiptap runtime reports format command failures through runtime_error", () => {
  const messages = [];
  const { runtime } = createRuntimeHarness();
  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    initialContent: "# Note",
  });
  runtime.attachChannel("tab-a", { send: (message) => messages.push(message) });

  runtime.handleRustMessage("tab-a", {
    type: "run_format_command",
    command_id: "missing-command",
  });

  assert.deepEqual(messages, [
    {
      type: "runtime_error",
      tab_id: "tab-a",
      message: "unknown_format_command",
    },
  ]);
});

test("Tiptap runtime destroys and unregisters editor entries", () => {
  const detached = [];
  const { calls, registry, runtime } = createRuntimeHarness({
    layout: {
      detachEditorScroll: (entry) => detached.push(entry.viewMode),
      detachLayoutObserver: (entry) => detached.push(`layout:${entry.viewMode}`),
    },
  });
  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    initialContent: "# Note",
  });
  calls.length = 0;

  assert.equal(runtime.handleRustMessage("tab-a", { type: "destroy" }), "destroyed");

  assert.equal(registry.has("tab-a"), false);
  assert.deepEqual(calls, [
    ["destroy"],
  ]);
  assert.deepEqual(detached, ["hybrid", "layout:hybrid"]);
});

test("Tiptap runtime ignores stale host destroy messages", () => {
  const { calls, registry, runtime } = createRuntimeHarness();
  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    instanceId: "host-new",
    initialContent: "# Note",
  });
  calls.length = 0;

  assert.equal(
    runtime.handleRustMessage("tab-a", {
      type: "destroy",
      instance_id: "host-old",
    }),
    "destroyed",
  );

  assert.equal(registry.has("tab-a"), true);
  assert.deepEqual(calls, []);

  assert.equal(
    runtime.handleRustMessage("tab-a", {
      type: "destroy",
      instance_id: "host-new",
    }),
    "destroyed",
  );
  assert.equal(registry.has("tab-a"), false);
});

test("Tiptap runtime wires autolink paste handling through editor props", () => {
  const { calls, registry, runtime } = createRuntimeHarness();
  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    initialContent: "# Note",
  });

  const editor = registry.get("tab-a").editor;
  editor.state.selection = {
    from: 2,
    to: 6,
    empty: false,
  };
  editor.state.doc = {
    textBetween: () => "Note",
  };
  const event = {
    clipboardData: {
      getData: () => "https://example.com",
    },
    preventDefault: () => calls.push(["preventDefault"]),
  };
  const handled = editor.options.editorProps.handlePaste(
    { state: editor.state },
    event,
    null,
  );

  assert.equal(handled, true);
  assert.deepEqual(calls.slice(-4), [
    ["setTextSelection", { from: 2, to: 6 }],
    ["setLink", "https://example.com"],
    ["preventDefault"],
    ["focus"],
  ]);
});

test("Tiptap runtime sends save requests from editor shortcuts", () => {
  const { calls, registry, runtime } = createRuntimeHarness();
  const messages = [];
  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    initialContent: "# Note",
  });
  runtime.attachChannel("tab-a", { send: (message) => messages.push(message) });
  calls.length = 0;

  const event = {
    key: "s",
    ctrlKey: true,
    preventDefault: () => calls.push(["preventDefault"]),
  };
  const handled = registry.get("tab-a").editor.options.editorProps.handleKeyDown(null, event);

  assert.equal(handled, true);
  assert.deepEqual(calls, [["preventDefault"]]);
  assert.deepEqual(messages, [{ type: "save_requested", tab_id: "tab-a" }]);
});


test("Tiptap runtime sends image paste requests through the Rust protocol", async () => {
  const image = { file: { type: "image/png" }, mimeType: "image/png" };
  const clipboardCalls = [];
  const { calls, registry, runtime } = createRuntimeHarness({
    clipboard: {
      imageFileFromTransfer: (transfer) => {
        clipboardCalls.push(["imageFileFromTransfer", transfer.kind]);
        return image;
      },
      sendEditorImageRequest: async ({ tabId, image: requestedImage, getEntry }) => {
        clipboardCalls.push([
          "sendEditorImageRequest",
          tabId,
          requestedImage.mimeType,
          Boolean(getEntry()?.dioxus),
        ]);
        getEntry()?.dioxus?.send({
          type: "paste_image_requested",
          tab_id: tabId,
          mime_type: requestedImage.mimeType,
          data: "abc123",
        });
        return true;
      },
    },
  });
  const messages = [];
  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    initialContent: "# Note",
  });
  runtime.attachChannel("tab-a", { send: (message) => messages.push(message) });
  calls.length = 0;

  const event = {
    type: "paste",
    clipboardData: { kind: "clipboard" },
    preventDefault: () => calls.push(["preventDefault"]),
  };
  const handled = registry.get("tab-a").editor.options.editorProps.handlePaste(null, event, null);
  await Promise.resolve();

  assert.equal(handled, true);
  assert.deepEqual(calls, [["preventDefault"], ["focus"]]);
  assert.deepEqual(clipboardCalls, [
    ["imageFileFromTransfer", "clipboard"],
    ["sendEditorImageRequest", "tab-a", "image/png", true],
  ]);
  assert.deepEqual(messages, [
    {
      type: "paste_image_requested",
      tab_id: "tab-a",
      mime_type: "image/png",
      data: "abc123",
    },
  ]);
});

test("Tiptap runtime sends image drop requests and moves the selection", async () => {
  const image = { file: { type: "" }, mimeType: "image/jpeg" };
  const clipboardCalls = [];
  const { calls, registry, runtime } = createRuntimeHarness({
    clipboard: {
      imageFileFromTransfer: (transfer) => {
        clipboardCalls.push(["imageFileFromTransfer", transfer.kind]);
        return image;
      },
      sendEditorImageRequest: async ({ tabId, image: requestedImage, getEntry }) => {
        clipboardCalls.push(["sendEditorImageRequest", tabId, requestedImage.mimeType]);
        getEntry()?.dioxus?.send({
          type: "paste_image_requested",
          tab_id: tabId,
          mime_type: requestedImage.mimeType,
          data: "drop123",
        });
        return true;
      },
    },
  });
  const messages = [];
  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    initialContent: "# Note",
  });
  runtime.attachChannel("tab-a", { send: (message) => messages.push(message) });
  calls.length = 0;

  const view = {
    posAtCoords: (coords) => {
      calls.push(["posAtCoords", coords.left, coords.top]);
      return { pos: 4 };
    },
  };
  const event = {
    dataTransfer: { kind: "drop" },
    clientX: 12,
    clientY: 20,
    preventDefault: () => calls.push(["preventDefault"]),
  };
  const handled = registry.get("tab-a").editor.options.editorProps.handleDrop(view, event, null, false);
  await Promise.resolve();

  assert.equal(handled, true);
  assert.deepEqual(calls, [
    ["preventDefault"],
    ["posAtCoords", 12, 20],
    ["setTextSelection", 4],
    ["focus"],
    ["focus"],
  ]);
  assert.deepEqual(clipboardCalls, [
    ["imageFileFromTransfer", "drop"],
    ["sendEditorImageRequest", "tab-a", "image/jpeg"],
  ]);
  assert.deepEqual(messages, [
    {
      type: "paste_image_requested",
      tab_id: "tab-a",
      mime_type: "image/jpeg",
      data: "drop123",
    },
  ]);
});

test("Tiptap runtime leaves table keyboard shortcuts to official table-node components", () => {
  const { calls, registry, runtime } = createRuntimeHarness();
  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    initialContent: "# Note",
  });
  calls.length = 0;

  const editor = registry.get("tab-a").editor;
  const handled = editor.options.editorProps.handleKeyDown(null, { key: "ArrowDown" });

  assert.equal(handled, false);
  assert.deepEqual(calls, []);
});

test("Tiptap runtime does not consume keys during IME composition", () => {
  const { calls, registry, runtime } = createRuntimeHarness();
  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    initialContent: "# Note",
  });
  calls.length = 0;

  const editor = registry.get("tab-a").editor;
  const handled = editor.options.editorProps.handleKeyDown(null, {
    key: "ArrowDown",
    isComposing: true,
  });

  assert.equal(handled, false);
  assert.deepEqual(calls, []);
});

test("Tiptap runtime keeps facade navigation methods available", () => {
  const { runtime } = createRuntimeHarness();

  assert.equal(runtime.attachPreviewScroll(), "preview-scroll");
  assert.equal(runtime.navigateOutline(), "navigate-outline");
  assert.equal(runtime.scrollEditorToLine(), "editor-line");
  assert.equal(runtime.scrollPreviewToHeading(), "preview-heading");
  assert.equal(runtime.renderPreviewMermaid(), "mermaid");
});
