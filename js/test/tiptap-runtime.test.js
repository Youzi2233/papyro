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

function createRuntimeHarness({
  container = createContainer(),
  markdownManagerFactory = ({ extensions }) => ({
    extensions,
    parse: (markdown) => ({ type: "doc", markdown }),
  }),
  clipboard,
  formatCommandControllerFactory,
  historyCommandControllerFactory,
  blockHintsControllerFactory,
  blockHandleControllerFactory,
  formatToolbarControllerFactory,
  pasteControllerFactory,
  preferencesControllerFactory,
  sourcePaneControllerFactory,
  slashMenuControllerFactory,
  tableToolbarControllerFactory,
  layout,
} = {}) {
  const calls = [];
  const registry = createEditorRuntimeRegistry();

  const createBlockHandle =
    blockHandleControllerFactory ??
    (() => ({
      attach: ({ root }) => calls.push(["blockHandleAttach", root.className]),
      close: () => calls.push(["blockHandleClose"]),
      destroy: () => calls.push(["blockHandleDestroy"]),
      refresh: () => calls.push(["blockHandleRefresh"]),
    }));

  const createBlockHintsController =
    blockHintsControllerFactory ??
    (() => ({
      hints: null,
      attach: (entry) => {
        calls.push(["blockHintsAttach"]);
        entry.blockHints = null;
        return null;
      },
      apply: (entry, hints) => {
        calls.push(["blockHintsApply", hints?.revision ?? null]);
        entry.blockHints = {
          revision: hints.revision,
          fallback: hints.fallback,
          blocks: hints.blocks,
        };
        return { changed: true, error: null, hints: entry.blockHints };
      },
    }));

  const createFormatToolbar =
    formatToolbarControllerFactory ??
    (() => ({
      attach: ({ root }) => calls.push(["formatToolbarAttach", root.className]),
      close: () => calls.push(["formatToolbarClose"]),
      destroy: () => calls.push(["formatToolbarDestroy"]),
      refresh: () => calls.push(["formatToolbarRefresh"]),
    }));

  const createPasteController =
    pasteControllerFactory ??
    (() => ({
      attach: ({ root }) => calls.push(["pasteControllerAttach", root.className]),
      destroy: () => calls.push(["pasteControllerDestroy"]),
      handlePaste: ({ event }) => {
        calls.push(["pasteControllerPaste", event.type]);
        return event.type === "paste";
      },
    }));

  const createSlashMenu =
    slashMenuControllerFactory ??
    (() => ({
      attach: ({ root }) => calls.push(["slashMenuAttach", root.className]),
      close: () => calls.push(["slashMenuClose"]),
      destroy: () => calls.push(["slashMenuDestroy"]),
      handleKeyDown: (event) => {
        calls.push(["slashMenuKeyDown", event.key]);
        return event.key === "ArrowDown";
      },
      refresh: () => calls.push(["slashMenuRefresh"]),
    }));

  const createTableToolbar =
    tableToolbarControllerFactory ??
    (() => ({
      attach: ({ root }) => calls.push(["tableToolbarAttach", root.className]),
      close: () => calls.push(["tableToolbarClose"]),
      contains: () => false,
      destroy: () => calls.push(["tableToolbarDestroy"]),
      handleKeyDown: (event) => {
        calls.push(["tableToolbarKeyDown", event.key]);
        return event.key === "F10" && event.shiftKey;
      },
      refresh: () => calls.push(["tableToolbarRefresh"]),
    }));

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
      };
      this.state = {
        selection: {
          from: 1,
          to: 1,
          empty: true,
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
    markdownManagerFactory,
    ...(clipboard ? { clipboard } : {}),
    blockHintsControllerFactory: createBlockHintsController,
    blockHandleControllerFactory: createBlockHandle,
    ...(formatCommandControllerFactory ? { formatCommandControllerFactory } : {}),
    formatToolbarControllerFactory: createFormatToolbar,
    ...(historyCommandControllerFactory ? { historyCommandControllerFactory } : {}),
    pasteControllerFactory: createPasteController,
    ...(preferencesControllerFactory ? { preferencesControllerFactory } : {}),
    ...(sourcePaneControllerFactory ? { sourcePaneControllerFactory } : {}),
    slashMenuControllerFactory: createSlashMenu,
    tableToolbarControllerFactory: createTableToolbar,
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
  assert.equal(registry.get("tab-a").instanceId, "host-a");
  assert.equal(registry.get("tab-a").markdownSync.markdown, "# Note");
  assert.deepEqual(calls, [
    ["constructor", "# Note", "markdown", false, true],
    ["mount", "mn-tiptap-runtime", "tab-a"],
    ["setEditable", true],
    ["blockHintsAttach"],
    ["blockHandleAttach", "mn-tiptap-runtime"],
    ["formatToolbarAttach", "mn-tiptap-runtime"],
    ["pasteControllerAttach", "mn-tiptap-runtime"],
    ["slashMenuAttach", "mn-tiptap-runtime"],
    ["tableToolbarAttach", "mn-tiptap-runtime"],
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
    ["blockHintsAttach"],
    ["blockHandleAttach", "mn-tiptap-runtime"],
    ["formatToolbarAttach", "mn-tiptap-runtime"],
    ["pasteControllerAttach", "mn-tiptap-runtime"],
    ["slashMenuAttach", "mn-tiptap-runtime"],
    ["tableToolbarAttach", "mn-tiptap-runtime"],
    ["setEditable", false],
    ["blockHandleRefresh"],
    ["formatToolbarRefresh"],
    ["tableToolbarRefresh"],
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
  assert.deepEqual(registry.get("tab-a").preferences, { autoLinkPaste: false });
  assert.equal(registry.get("tab-a").blockHints.revision, 7);
  assert.equal(registry.get("tab-a").dom.dataset.viewMode, "source");
  assert.deepEqual(calls, [
    ["syncOutline", "tab-a", "hybrid"],
    ["setEditable", false],
    ["blockHandleRefresh"],
    ["formatToolbarRefresh"],
    ["tableToolbarRefresh"],
    ["syncOutline", "tab-a", "source"],
    ["setContent", "## Updated", "markdown"],
    ["insertContent", "\n- item", "markdown"],
    ["blockHandleRefresh"],
    ["slashMenuRefresh"],
    ["formatToolbarRefresh"],
    ["tableToolbarRefresh"],
    ["blockHintsApply", 7],
    ["toggleHeading", 2],
    ["focus"],
    ["toggleBold"],
    ["focus"],
    ["undo"],
    ["focus"],
    ["redo"],
    ["focus"],
    ["focus"],
  ]);
  assert.deepEqual(messages, [
    {
      type: "content_changed",
      tab_id: "tab-a",
      content: "## Updated\n- item",
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
    ["blockHandleRefresh"],
    ["formatToolbarRefresh"],
    ["tableToolbarRefresh"],
    ["syncOutline", "tab-a", "preview"],
  ]);
});

test("Tiptap runtime mode contract keeps rich editing Hybrid-only", () => {
  const sourcePaneCalls = [];
  const sourcePaneControllerFactory = () => ({
    attach: ({ entry }) => sourcePaneCalls.push(["attach", entry.viewMode]),
    applyMode: (entry) => sourcePaneCalls.push(["applyMode", entry.viewMode]),
    setMarkdown: (markdown) => sourcePaneCalls.push(["setMarkdown", markdown]),
    insertMarkdown: () => false,
    focus: () => false,
    destroy: () => sourcePaneCalls.push(["destroy"]),
  });
  const { calls, registry, runtime } = createRuntimeHarness({ sourcePaneControllerFactory });

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
    ["blockHintsAttach"],
    ["blockHandleAttach", "mn-tiptap-runtime"],
    ["formatToolbarAttach", "mn-tiptap-runtime"],
    ["pasteControllerAttach", "mn-tiptap-runtime"],
    ["slashMenuAttach", "mn-tiptap-runtime"],
    ["tableToolbarAttach", "mn-tiptap-runtime"],
  ]);
  assert.deepEqual(sourcePaneCalls, [["attach", "preview"]]);

  calls.length = 0;
  sourcePaneCalls.length = 0;

  runtime.handleRustMessage("tab-a", { type: "set_view_mode", mode: "source" });
  runtime.handleRustMessage("tab-a", { type: "set_view_mode", mode: "hybrid" });

  assert.deepEqual(calls, [
    ["setEditable", false],
    ["blockHandleRefresh"],
    ["formatToolbarRefresh"],
    ["tableToolbarRefresh"],
    ["syncOutline", "tab-a", "source"],
    ["setEditable", true],
    ["blockHandleRefresh"],
    ["formatToolbarRefresh"],
    ["tableToolbarRefresh"],
    ["syncOutline", "tab-a", "hybrid"],
  ]);
  assert.deepEqual(sourcePaneCalls, [
    ["applyMode", "source"],
    ["applyMode", "hybrid"],
  ]);
});

test("Tiptap runtime preserves selection snapshots across Source and Hybrid modes", () => {
  let textarea = null;
  const sourcePaneCalls = [];
  const sourcePaneControllerFactory = () => ({
    get textarea() {
      return textarea;
    },
    attach: ({ entry }) => {
      textarea = {
        value: entry.markdownSync.markdown,
        selectionStart: 0,
        selectionEnd: 0,
        setSelectionRange(start, end) {
          this.selectionStart = start;
          this.selectionEnd = end;
          sourcePaneCalls.push(["setSelectionRange", start, end]);
        },
        focus() {
          sourcePaneCalls.push(["sourceFocus"]);
        },
      };
      sourcePaneCalls.push(["attach", entry.viewMode]);
    },
    applyMode: (entry) => {
      sourcePaneCalls.push(["applyMode", entry.viewMode]);
      if (textarea) {
        textarea.value = entry.markdownSync.markdown;
      }
      return entry.viewMode === "source";
    },
    setMarkdown: (markdown) => {
      sourcePaneCalls.push(["setMarkdown", markdown]);
      if (textarea) textarea.value = markdown;
    },
    insertMarkdown: () => false,
    focus: () => false,
    destroy: () => sourcePaneCalls.push(["destroy"]),
  });
  const { calls, registry, runtime } = createRuntimeHarness({ sourcePaneControllerFactory });
  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    initialContent: "0123456789",
    viewMode: "hybrid",
  });
  const entry = registry.get("tab-a");
  calls.length = 0;
  sourcePaneCalls.length = 0;

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
  assert.deepEqual(
    sourcePaneCalls.filter((call) => call[0] === "setSelectionRange"),
    [
      ["setSelectionRange", 6, 9],
    ],
  );
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
    ["blockHandleRefresh"],
    ["slashMenuRefresh"],
    ["formatToolbarRefresh"],
    ["tableToolbarRefresh"],
  ]);
  assert.deepEqual(messages, [
    {
      type: "content_changed",
      tab_id: "tab-a",
      content: "# Note\n- item",
    },
  ]);
});

test("Tiptap runtime mounts and updates the source pane controller", () => {
  const sourcePaneCalls = [];
  const sourcePaneControllerFactory = () => ({
    attach: ({ root, entry }) => sourcePaneCalls.push(["attach", root.className, entry.viewMode]),
    applyMode: (entry) => sourcePaneCalls.push(["applyMode", entry.viewMode]),
    setMarkdown: (markdown) => sourcePaneCalls.push(["setMarkdown", markdown]),
    insertMarkdown: () => {
      sourcePaneCalls.push(["insertMarkdown"]);
      return false;
    },
    focus: () => {
      sourcePaneCalls.push(["focus"]);
      return false;
    },
    destroy: () => sourcePaneCalls.push(["destroy"]),
  });
  const { runtime } = createRuntimeHarness({ sourcePaneControllerFactory });

  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    initialContent: "# Note",
    viewMode: "source",
  });
  runtime.handleRustMessage("tab-a", { type: "set_view_mode", mode: "hybrid" });
  runtime.handleRustMessage("tab-a", { type: "set_content", content: "## Updated" });
  runtime.handleRustMessage("tab-a", { type: "destroy" });

  assert.deepEqual(sourcePaneCalls, [
    ["attach", "mn-tiptap-runtime", "source"],
    ["applyMode", "hybrid"],
    ["setMarkdown", "## Updated"],
    ["destroy"],
  ]);
});

test("Tiptap runtime routes source mode insert and focus through source pane", () => {
  const sourcePaneCalls = [];
  const sourcePaneControllerFactory = () => ({
    attach: () => sourcePaneCalls.push(["attach"]),
    applyMode: () => sourcePaneCalls.push(["applyMode"]),
    setMarkdown: () => sourcePaneCalls.push(["setMarkdown"]),
    insertMarkdown: (_entry, markdown, cursorOffset) => {
      sourcePaneCalls.push(["insertMarkdown", markdown, cursorOffset]);
      return true;
    },
    focus: () => {
      sourcePaneCalls.push(["focus"]);
      return true;
    },
    destroy: () => sourcePaneCalls.push(["destroy"]),
  });
  const { calls, runtime } = createRuntimeHarness({ sourcePaneControllerFactory });
  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    initialContent: "# Note",
    viewMode: "source",
  });
  calls.length = 0;
  sourcePaneCalls.length = 0;

  runtime.handleRustMessage("tab-a", {
    type: "insert_markdown",
    markdown: "$x$",
    cursor_offset: 2,
  });
  runtime.handleRustMessage("tab-a", { type: "focus" });

  assert.deepEqual(sourcePaneCalls, [
    ["insertMarkdown", "$x$", 2],
    ["focus"],
  ]);
  assert.deepEqual(calls, []);
});

test("Tiptap runtime applies preferences through the injected controller", () => {
  const preferenceCalls = [];
  const preferencesControllerFactory = () => ({
    preferences: { autoLinkPaste: true },
    attach(entry) {
      preferenceCalls.push(["attach"]);
      entry.preferences = { autoLinkPaste: true };
      return entry.preferences;
    },
    apply(entry, message) {
      preferenceCalls.push(["apply", message.auto_link_paste]);
      entry.preferences = { autoLinkPaste: message.auto_link_paste !== false };
      return { changed: true, preferences: entry.preferences };
    },
  });
  const { registry, runtime } = createRuntimeHarness({ preferencesControllerFactory });
  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    initialContent: "# Note",
  });

  runtime.handleRustMessage("tab-a", {
    type: "set_preferences",
    auto_link_paste: false,
  });

  assert.deepEqual(preferenceCalls, [["attach"], ["apply", false]]);
  assert.deepEqual(registry.get("tab-a").preferences, { autoLinkPaste: false });
});

test("Tiptap runtime reports parse failures without touching the editor", () => {
  const messages = [];
  const { calls, runtime } = createRuntimeHarness({
    markdownManagerFactory: () => ({
      parse() {
        throw new Error("parse failed");
      },
    }),
  });
  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    initialContent: "# Note",
  });
  runtime.attachChannel("tab-a", { send: (message) => messages.push(message) });
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
    ["blockHandleDestroy"],
    ["formatToolbarDestroy"],
    ["pasteControllerDestroy"],
    ["slashMenuDestroy"],
    ["tableToolbarDestroy"],
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

test("Tiptap runtime wires paste handling through editor props", () => {
  const pasteCalls = [];
  const pasteControllerFactory = () => ({
    attach({ root }) {
      pasteCalls.push(["attach", root.className]);
    },
    destroy() {
      pasteCalls.push(["destroy"]);
    },
    handlePaste({ event }) {
      pasteCalls.push(["paste", event.type]);
      return true;
    },
  });
  const { registry, runtime } = createRuntimeHarness({ pasteControllerFactory });
  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    initialContent: "# Note",
  });

  const editor = registry.get("tab-a").editor;
  const handled = editor.options.editorProps.handlePaste(null, { type: "paste" }, null);

  assert.equal(handled, true);
  assert.deepEqual(pasteCalls, [["attach", "mn-tiptap-runtime"], ["paste", "paste"]]);
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

test("Tiptap runtime wires slash menu keyboard handling through editor props", () => {
  const { calls, registry, runtime } = createRuntimeHarness();
  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    initialContent: "# Note",
  });
  calls.length = 0;

  const editor = registry.get("tab-a").editor;
  const handled = editor.options.editorProps.handleKeyDown(null, { key: "ArrowDown" });

  assert.equal(handled, true);
  assert.deepEqual(calls, [
    ["tableToolbarKeyDown", "ArrowDown"],
    ["slashMenuKeyDown", "ArrowDown"],
  ]);
});

test("Tiptap runtime lets table toolbar keyboard handling win before slash menu", () => {
  const { calls, registry, runtime } = createRuntimeHarness();
  runtime.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    initialContent: "# Note",
  });
  calls.length = 0;

  const editor = registry.get("tab-a").editor;
  const handled = editor.options.editorProps.handleKeyDown(null, {
    key: "F10",
    shiftKey: true,
  });

  assert.equal(handled, true);
  assert.deepEqual(calls, [["tableToolbarKeyDown", "F10"]]);
});

test("Tiptap runtime does not consume slash menu keys during IME composition", () => {
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
