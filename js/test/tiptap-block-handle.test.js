import test from "node:test";
import assert from "node:assert/strict";

import { createTiptapBlockHandleController } from "../src/tiptap-block-handle.js";

function createElement({ tagName = "P", parent = null, rect = null } = {}) {
  const element = {
    nodeType: 1,
    tagName,
    parentNode: parent,
    listeners: new Map(),
    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (this.listeners.get(type) === listener) {
        this.listeners.delete(type);
      }
    },
    contains(target) {
      let current = target;
      while (current) {
        if (current === this) return true;
        current = current.parentNode;
      }
      return false;
    },
    closest(selector) {
      let current = this;
      while (current) {
        const tag = String(current.tagName ?? "").toLowerCase();
        if (selector.includes(tag)) return current;
        current = current.parentNode;
      }
      return null;
    },
    getBoundingClientRect() {
      return rect ?? { left: 100, top: 40, width: 480, height: 32 };
    },
    ownerDocument: {
      documentElement: {
        clientWidth: 1000,
      },
    },
  };
  return element;
}

function createEditor({ block = null } = {}) {
  const root = createElement({ tagName: "DIV" });
  const paragraph = block ?? createElement({ tagName: "P", parent: root });
  paragraph.parentNode = root;
  const calls = [];
  const editor = {
    view: {
      dom: root,
      posAtDOM(target, offset) {
        calls.push(["posAtDOM", target.tagName, offset]);
        return target === paragraph ? 7 : 0;
      },
    },
  };

  return { block: paragraph, calls, editor, root };
}

function createViewSpy() {
  const calls = [];
  return {
    calls,
    mount(root) {
      calls.push(["mount", root?.className ?? ""]);
    },
    update(state) {
      calls.push(["update", state.target.kind, state.target.pos]);
    },
    hide() {
      calls.push(["hide"]);
    },
    destroy() {
      calls.push(["destroy"]);
    },
  };
}

test("Tiptap block handle opens on hovered editor blocks", () => {
  const { block, calls, editor } = createEditor();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });

  controller.handlePointerMove({ target: block });

  assert.equal(controller.state.open, true);
  assert.equal(controller.state.target.kind, "paragraph");
  assert.equal(controller.state.target.pos, 7);
  assert.deepEqual(calls, [["posAtDOM", "P", 0]]);
  assert.deepEqual(view.calls, [
    ["mount", ""],
    ["update", "paragraph", 7],
  ]);
});

test("Tiptap block handle closes outside Hybrid mode", () => {
  const { block, editor } = createEditor();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "preview" } });

  controller.handlePointerMove({ target: block });

  assert.equal(controller.state.open, false);
  assert.deepEqual(view.calls, [["mount", ""]]);
});

test("Tiptap block handle closes when hover leaves a block", () => {
  const { block, editor } = createEditor();
  const outside = createElement({ tagName: "SECTION" });
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });

  controller.handlePointerMove({ target: outside });

  assert.equal(controller.state.open, false);
  assert.deepEqual(view.calls.at(-1), ["hide"]);
});

test("Tiptap block handle destroys listeners and view state", () => {
  const { block, editor } = createEditor();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });

  controller.destroy();

  assert.equal(controller.state.open, false);
  assert.equal(editor.view.dom.listeners.size, 0);
  assert.deepEqual(view.calls.slice(-2), [["hide"], ["destroy"]]);
});
