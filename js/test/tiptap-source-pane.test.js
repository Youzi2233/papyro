import test from "node:test";
import assert from "node:assert/strict";

import { createTiptapSourcePaneController } from "../src/tiptap-source-pane.js";

function createElement(tagName) {
  const listeners = new Map();
  return {
    tagName,
    className: "",
    hidden: false,
    value: "",
    selectionStart: 0,
    selectionEnd: 0,
    parentElement: null,
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    addEventListener(name, handler) {
      listeners.set(name, handler);
    },
    removeEventListener(name, handler) {
      if (listeners.get(name) === handler) listeners.delete(name);
    },
    dispatch(name, event = {}) {
      listeners.get(name)?.(event);
    },
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
    focus() {
      this.focused = true;
    },
    remove() {
      this.removed = true;
      this.parentElement = null;
    },
  };
}

function createRoot() {
  return {
    children: [],
    appendChild(child) {
      this.children.push(child);
      child.parentElement = this;
    },
  };
}

function createEntry({
  markdown = "# Note",
  tabId = "tab-a",
  viewMode = "source",
  parseOk = true,
} = {}) {
  const messages = [];
  const setContentCalls = [];
  const entry = {
    tabId,
    viewMode,
    suppressChange: false,
    dom: { dataset: { tabId } },
    dioxus: { send: (message) => messages.push(message) },
    markdownSync: {
      markdown,
      setMarkdown(nextMarkdown) {
        if (!parseOk) {
          return {
            ok: false,
            error: { message: "parse failed" },
            markdown: nextMarkdown,
          };
        }
        this.markdown = nextMarkdown;
        return { ok: true, markdown: nextMarkdown };
      },
    },
    editor: {
      commands: {
        setContent(content, options) {
          setContentCalls.push([content, options.contentType, entry.suppressChange]);
        },
      },
    },
  };
  return { entry, messages, setContentCalls };
}

function createControllerHarness(entryOptions = {}) {
  const root = createRoot();
  const created = [];
  const controller = createTiptapSourcePaneController({
    document: {
      createElement(tagName) {
        const element = createElement(tagName);
        created.push(element);
        return element;
      },
    },
  });
  const entry = createEntry(entryOptions);
  const textarea = controller.attach({ root, entry: entry.entry });
  return { controller, root, textarea, created, ...entry };
}

test("Tiptap source pane mounts a hidden Markdown textarea by default", () => {
  const { root, textarea } = createControllerHarness({ viewMode: "hybrid" });

  assert.equal(root.children[0], textarea);
  assert.equal(textarea.className, "mn-tiptap-source-pane");
  assert.equal(textarea.hidden, true);
  assert.equal(textarea.value, "# Note");
  assert.equal(textarea.attributes["aria-label"], "Markdown source");
});

test("Tiptap source pane shows only in source mode", () => {
  const { controller, textarea, entry } = createControllerHarness({ viewMode: "hybrid" });

  entry.viewMode = "source";
  assert.equal(controller.applyMode(entry), true);
  assert.equal(textarea.hidden, false);

  entry.viewMode = "preview";
  assert.equal(controller.applyMode(entry), false);
  assert.equal(textarea.hidden, true);
});

test("Tiptap source pane input syncs Markdown and emits content_changed", () => {
  const { textarea, messages, setContentCalls, entry } = createControllerHarness();
  textarea.value = "# Updated";

  textarea.dispatch("input");

  assert.equal(entry.markdownSync.markdown, "# Updated");
  assert.deepEqual(setContentCalls, [["# Updated", "markdown", true]]);
  assert.deepEqual(messages, [
    {
      type: "content_changed",
      tab_id: "tab-a",
      content: "# Updated",
    },
  ]);
  assert.equal(entry.suppressChange, false);
});

test("Tiptap source pane reports parse failures without replacing the editor", () => {
  const { textarea, messages, setContentCalls, entry } = createControllerHarness({
    parseOk: false,
  });
  textarea.value = "# Broken";

  textarea.dispatch("input");

  assert.equal(entry.markdownSync.markdown, "# Note");
  assert.deepEqual(setContentCalls, []);
  assert.deepEqual(messages, [
    {
      type: "runtime_error",
      tab_id: "tab-a",
      message: "parse failed",
    },
  ]);
});

test("Tiptap source pane inserts Markdown at the textarea selection", () => {
  const { controller, textarea, messages, setContentCalls, entry } = createControllerHarness({
    markdown: "Hello world",
  });
  textarea.selectionStart = 6;
  textarea.selectionEnd = 11;

  assert.equal(controller.insertMarkdown(entry, "**text**", 2), true);

  assert.equal(textarea.value, "Hello **text**");
  assert.deepEqual([textarea.selectionStart, textarea.selectionEnd], [8, 8]);
  assert.deepEqual(setContentCalls, [["Hello **text**", "markdown", true]]);
  assert.deepEqual(messages.at(-1), {
    type: "content_changed",
    tab_id: "tab-a",
    content: "Hello **text**",
  });
});

test("Tiptap source pane sends save requests and supports focus", () => {
  const { controller, textarea, messages, entry } = createControllerHarness();
  const event = {
    key: "s",
    metaKey: true,
    preventDefaultCalled: false,
    preventDefault() {
      this.preventDefaultCalled = true;
    },
  };

  textarea.dispatch("keydown", event);
  assert.equal(event.preventDefaultCalled, true);
  assert.deepEqual(messages, [{ type: "save_requested", tab_id: "tab-a" }]);

  assert.equal(controller.focus(entry), true);
  assert.equal(textarea.focused, true);
});
