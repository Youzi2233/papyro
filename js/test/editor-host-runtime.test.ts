import test from "node:test";
import assert from "node:assert/strict";

import { createEditorRuntimeRegistry } from "../src/editor-registry.js";
import { createEditorHostRuntime } from "../src/editor-host-runtime.js";

function createClassList() {
  const values = new Set();
  return {
    contains: (value) => values.has(value),
    toggle: (value, active) => {
      if (active) {
        values.add(value);
      } else {
        values.delete(value);
      }
    },
  };
}

function createOutlineItem(tabId, lineNumber) {
  const attributes = new Map();
  return {
    dataset: { tabId, lineNumber: String(lineNumber) },
    classList: createClassList(),
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
    attribute: (name) => attributes.get(name),
  };
}

function createPreviewHeading(top) {
  return {
    getBoundingClientRect: () => ({ top }),
  };
}

function createPreviewScroller(tabId, headings = []) {
  const listeners = new Map();
  return {
    dataset: { tabId },
    scrollTop: 0,
    scrollLeft: 0,
    scrollHeight: 1000,
    clientHeight: 400,
    scrollWidth: 800,
    clientWidth: 800,
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: (name) => listeners.delete(name),
    emit: (name) => listeners.get(name)?.(),
    getBoundingClientRect: () => ({ top: 0 }),
    querySelectorAll: () => headings,
    scrollTo({ top }) {
      this.scrollTop = top;
    },
  };
}

function createDocument({ outlineItems = [], previewScrollers = [], outlineToggle = null } = {}) {
  return {
    querySelectorAll(selector) {
      if (selector === ".mn-outline-item[data-tab-id]") return outlineItems;
      if (selector === ".mn-preview-scroll[data-tab-id]") return previewScrollers;
      return [];
    },
    querySelector(selector) {
      if (selector === ".mn-editor-outline-toggle") return outlineToggle;
      return null;
    },
  };
}

test("editor host runtime syncs Tiptap outline from the active markdown line", () => {
  const registry = createEditorRuntimeRegistry();
  const first = createOutlineItem("tab-a", 1);
  const second = createOutlineItem("tab-a", 5);
  const host = createEditorHostRuntime({
    registry,
    document: createDocument({ outlineItems: [first, second] }),
    isElement: () => true,
  });
  registry.set("tab-a", {
    dom: { dataset: { tabId: "tab-a" } },
    editor: {
      state: {
        selection: { from: 6 },
        doc: {
          descendants(callback) {
            callback({ type: { name: "heading" }, isTextblock: true }, 0);
            callback({ type: { name: "heading" }, isTextblock: true }, 5);
          },
        },
      },
    },
    viewMode: "hybrid",
  });

  assert.equal(host.navigation.syncOutline("tab-a", "hybrid"), true);
  assert.equal(first.classList.contains("active"), false);
  assert.equal(second.classList.contains("active"), true);
  assert.equal(second.attribute("aria-current"), "location");
});

test("editor host runtime navigates preview headings with auto scroll", () => {
  const registry = createEditorRuntimeRegistry();
  const scroller = createPreviewScroller("tab-a", [
    createPreviewHeading(16),
    createPreviewHeading(240),
  ]);
  const host = createEditorHostRuntime({
    registry,
    document: createDocument({ previewScrollers: [scroller] }),
    isElement: () => true,
  });

  assert.equal(host.navigation.scrollPreviewToHeading("tab-a", 1), true);
  assert.equal(scroller.scrollTop, 228);
});

test("editor host runtime saves preview scroll and activates the nearest heading", () => {
  const registry = createEditorRuntimeRegistry();
  const first = createOutlineItem("tab-a", 1);
  const second = createOutlineItem("tab-a", 5);
  const scroller = createPreviewScroller("tab-a", [
    createPreviewHeading(-130),
    createPreviewHeading(-10),
  ]);
  scroller.scrollTop = 130;
  const host = createEditorHostRuntime({
    registry,
    document: createDocument({
      outlineItems: [first, second],
      previewScrollers: [scroller],
    }),
    isElement: () => true,
  });

  assert.equal(host.navigation.attachPreviewScroll("tab-a", scroller), true);
  scroller.emit("scroll");

  assert.equal(first.classList.contains("active"), false);
  assert.equal(second.classList.contains("active"), true);
});

test("editor host runtime exposes preview render helpers", () => {
  const registry = createEditorRuntimeRegistry();
  const host = createEditorHostRuntime({
    registry,
    document: createDocument(),
    isElement: () => true,
  });

  assert.equal(typeof host.navigation.renderPreviewMermaid, "function");
  assert.equal(typeof host.navigation.renderPreviewMath, "function");
});
