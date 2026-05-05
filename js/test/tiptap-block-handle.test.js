import test from "node:test";
import assert from "node:assert/strict";

import {
  blockDropPlacement,
  createTiptapBlockMove,
  createTiptapBlockHandleController,
  insertSlashParagraphAfterBlock,
} from "../src/tiptap-block-handle.js";

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
    state: {
      doc: {
        nodeAt(pos) {
          return pos === 7 ? { nodeSize: 6 } : null;
        },
      },
    },
    commands: {
      focus: () => calls.push(["focus"]),
      insertContentAt: (position, value, options) => {
        calls.push(["insertContentAt", position, value, options]);
        return true;
      },
      setNodeSelection: (pos) => {
        calls.push(["setNodeSelection", pos]);
        return true;
      },
      setTextSelection: (pos) => {
        calls.push(["setTextSelection", pos]);
        return true;
      },
    },
  };

  return { block: paragraph, calls, editor, root };
}

function createViewSpy() {
  const calls = [];
  let hovered = false;
  let bridgePointer = false;
  let actionCount = 0;
  let insertCount = 0;
  return {
    calls,
    mount(root) {
      calls.push(["mount", root?.className ?? ""]);
    },
    update(state) {
      calls.push(["update", state.target.kind, state.target.pos]);
      this.openActions = state.openActions;
      this.openInsert = state.openInsert;
      this.startDrag = state.startDrag;
      actionCount += typeof state.openActions === "function" ? 1 : 0;
      insertCount += typeof state.openInsert === "function" ? 1 : 0;
    },
    updateDrag(state) {
      calls.push(["drag", state.open, state.drop?.placement ?? null, state.drop?.pos ?? null]);
    },
    hide() {
      calls.push(["hide"]);
    },
    destroy() {
      calls.push(["destroy"]);
    },
    contains() {
      return hovered;
    },
    containsPointer() {
      return bridgePointer;
    },
    setHovered(value) {
      hovered = value;
    },
    setBridgePointer(value) {
      bridgePointer = value;
    },
    get actionCount() {
      return actionCount;
    },
    get insertCount() {
      return insertCount;
    },
  };
}

function createMenuSpy() {
  const calls = [];
  let open = false;
  return {
    calls,
    get state() {
      return { open };
    },
    attach({ root }) {
      calls.push(["attach", root?.tagName ?? ""]);
    },
    close() {
      const wasOpen = open;
      open = false;
      if (wasOpen) calls.push(["close"]);
    },
    destroy() {
      calls.push(["destroy"]);
    },
    handleKeyDown(event) {
      calls.push(["keydown", event.key]);
      return event.key === "Escape";
    },
    open(target, options = {}) {
      open = true;
      const rect = options.anchorRect ?? null;
      calls.push(["open", target.kind, target.pos, rect ? [rect.left, rect.top] : null]);
    },
  };
}

function createInsertMenuSpy() {
  const calls = [];
  let open = false;
  return {
    calls,
    get state() {
      return { open };
    },
    attach({ root }) {
      calls.push(["attach", root?.tagName ?? ""]);
    },
    close() {
      open = false;
      calls.push(["close"]);
    },
    destroy() {
      calls.push(["destroy"]);
    },
    handleKeyDown(event) {
      calls.push(["keydown", event.key]);
      return event.key === "ArrowDown";
    },
    openAtBlock(target) {
      open = true;
      calls.push(["openAtBlock", target.kind, target.pos, target.node.nodeSize]);
      return true;
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

test("Tiptap block handle stays open while moving through the handle hover bridge", () => {
  const { block, editor } = createEditor();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });

  view.setHovered(true);
  editor.view.dom.listeners.get("mouseleave")({ relatedTarget: {} });

  assert.equal(controller.state.open, true);
  assert.notDeepEqual(view.calls.at(-1), ["hide"]);
});

test("Tiptap block handle stays open when the pointer enters an open floating menu", () => {
  const { block, editor } = createEditor();
  const menu = createMenuSpy();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ menu, view });
  const menuElement = { id: "menu" };
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });
  view.openActions();
  menu.contains = (target) => target === menuElement;

  editor.view.dom.listeners.get("mouseleave")({ relatedTarget: menuElement });

  assert.equal(controller.state.open, true);
  assert.equal(menu.state.open, true);
  assert.notDeepEqual(view.calls.at(-1), ["hide"]);
});

test("Tiptap block handle localizes handle control labels", () => {
  const { block, editor } = createEditor();
  const view = {
    ...createViewSpy(),
    labels: null,
    update(state) {
      this.labels = state.labels;
      createViewSpy().update?.(state);
    },
  };
  const controller = createTiptapBlockHandleController({ view });
  controller.attach({
    editor,
    root: editor.view.dom,
    entry: { viewMode: "hybrid", preferences: { language: "Chinese" } },
  });

  controller.handlePointerMove({ target: block });

  assert.deepEqual(view.labels, {
    insert: "在下方插入块",
    actions: "块操作",
  });
});

test("Tiptap block handle keeps the bridge alive before the floating handle is the related target", () => {
  const { block, editor } = createEditor();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });

  view.setBridgePointer(true);
  editor.view.dom.listeners.get("mouseleave")({
    clientX: 92,
    clientY: 52,
    relatedTarget: null,
  });

  assert.equal(controller.state.open, true);
  assert.deepEqual(view.calls.at(-1), ["update", "paragraph", 7]);
});

test("Tiptap block handle stays open when pointer events target the floating handle", () => {
  const { block, editor } = createEditor();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });

  view.setHovered(true);
  controller.handlePointerMove({ target: { id: "floating-handle" } });

  assert.equal(controller.state.open, true);
  assert.deepEqual(view.calls.at(-1), ["update", "paragraph", 7]);
});

test("Tiptap block handle keeps callbacks after repeated hover updates", () => {
  const { block, editor } = createEditor();
  const insertMenu = createInsertMenuSpy();
  const menu = createMenuSpy();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ insertMenu, menu, view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });

  controller.handlePointerMove({ target: block });
  controller.handlePointerMove({ target: block });

  assert.equal(view.actionCount, 2);
  assert.equal(view.insertCount, 2);
  assert.equal(view.openInsert(), true);
  assert.equal(view.openActions(), true);
  assert.ok(insertMenu.calls.some((call) => call[0] === "openAtBlock"));
  assert.equal(menu.calls.at(-1)[0], "open");
});

test("Tiptap block handle insert action works from pointerdown", () => {
  const { block, editor } = createEditor();
  const insertMenu = createInsertMenuSpy();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ insertMenu, view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });

  assert.equal(view.openInsert({ preventDefault() {}, stopPropagation() {} }), true);

  assert.deepEqual(insertMenu.calls, [["openAtBlock", "paragraph", 7, 6]]);
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

test("Tiptap block handle opens the action menu from the handle action", () => {
  const { block, editor } = createEditor();
  const menu = createMenuSpy();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ menu, view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });

  assert.equal(view.openActions(), true);
  assert.equal(controller.handleKeyDown({ key: "Escape" }), true);

  assert.deepEqual(menu.calls, [
    ["attach", "DIV"],
    ["open", "paragraph", 7, null],
    ["keydown", "Escape"],
  ]);
});

test("Tiptap block handle opens the insert menu from the plus action", () => {
  const { block, calls, editor } = createEditor();
  const insertMenu = createInsertMenuSpy();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ insertMenu, view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });

  assert.equal(view.openInsert(), true);
  assert.equal(controller.handleKeyDown({ key: "ArrowDown" }), true);

  assert.deepEqual(insertMenu.calls, [
    ["openAtBlock", "paragraph", 7, 6],
    ["keydown", "ArrowDown"],
  ]);
  assert.deepEqual(calls.slice(-2), [
    ["setNodeSelection", 7],
    ["focus"],
  ]);
});

test("Tiptap block handle treats a non-moving pointer gesture as an action click", () => {
  const { block, editor } = createEditor();
  const menu = createMenuSpy();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ menu, view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });

  assert.equal(view.startDrag({ clientX: 10, clientY: 10, preventDefault() {} }), true);
  assert.equal(controller.finishDrag({ preventDefault() {} }), true);
  assert.equal(view.openActions(), true);

  assert.deepEqual(menu.calls, [
    ["attach", "DIV"],
    ["open", "paragraph", 7, [10, 10]],
    ["open", "paragraph", 7, null],
  ]);
});

test("Tiptap block handle waits for click release before opening actions", () => {
  const { block, editor } = createEditor();
  const menu = createMenuSpy();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ menu, view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });

  assert.equal(view.startDrag({ clientX: 10, clientY: 10, preventDefault() {} }), true);

  assert.equal(menu.state.open, false);
  assert.deepEqual(menu.calls, [
    ["attach", "DIV"],
  ]);
});

test("Tiptap block handle suppresses right-click native menus and opens actions", () => {
  const { block, editor } = createEditor();
  const menu = createMenuSpy();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ menu, view });
  let prevented = 0;
  let stopped = 0;
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });

  assert.equal(
    view.startDrag({
      button: 2,
      clientX: 10,
      clientY: 10,
      preventDefault() {
        prevented += 1;
      },
      stopPropagation() {
        stopped += 1;
      },
    }),
    true,
  );

  assert.equal(menu.state.open, true);
  assert.equal(prevented, 1);
  assert.equal(stopped, 1);
  assert.deepEqual(menu.calls, [
    ["attach", "DIV"],
    ["open", "paragraph", 7, [10, 10]],
  ]);
});

test("Tiptap block handle suppresses editor native context menus", () => {
  const { block, editor } = createEditor();
  const menu = createMenuSpy();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ menu, view });
  let prevented = 0;
  let stopped = 0;
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });

  assert.equal(
    controller.handleContextMenu({
      target: block,
      clientX: 80,
      clientY: 40,
      preventDefault() {
        prevented += 1;
      },
      stopPropagation() {
        stopped += 1;
      },
    }),
    true,
  );

  assert.equal(prevented, 1);
  assert.equal(stopped, 1);
  assert.equal(menu.state.open, true);
  assert.deepEqual(menu.calls, [
    ["attach", "DIV"],
    ["open", "paragraph", 7, [80, 40]],
  ]);
});

test("Tiptap block handle opens actions from a non-moving pointer gesture", () => {
  const { block, editor } = createEditor();
  const menu = createMenuSpy();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ menu, view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });

  view.startDrag({ clientX: 10, clientY: 10, preventDefault() {} });
  assert.equal(controller.finishDrag({ preventDefault() {} }), true);

  assert.equal(menu.state.open, true);
  assert.deepEqual(menu.calls, [
    ["attach", "DIV"],
    ["open", "paragraph", 7, [10, 10]],
  ]);
});

test("Tiptap block handle keeps the action menu stable while the pointer leaves the block", () => {
  const { block, editor } = createEditor();
  const outside = createElement({ tagName: "SECTION" });
  const menu = createMenuSpy();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ menu, view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });
  view.openActions();

  controller.handlePointerMove({ target: outside });

  assert.equal(controller.state.open, true);
  assert.equal(menu.state.open, true);
  assert.notDeepEqual(view.calls.at(-1), ["hide"]);
});

test("Tiptap block handle stays open when the editor mouse leaves with a floating menu open", () => {
  const { block, editor } = createEditor();
  const menu = createMenuSpy();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ menu, view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });
  view.openActions();

  editor.view.dom.listeners.get("mouseleave")({ relatedTarget: null });

  assert.equal(controller.state.open, true);
  assert.equal(menu.state.open, true);
  assert.notDeepEqual(view.calls.at(-1), ["hide"]);
});

test("Tiptap block handle closes menus when dragging really starts", () => {
  const { block, editor } = createEditor();
  const menu = createMenuSpy();
  const insertMenu = createInsertMenuSpy();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ insertMenu, menu, view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });

  view.startDrag({ clientX: 10, clientY: 10, preventDefault() {} });
  controller.handleDragMove({ clientX: 40, clientY: 10, preventDefault() {}, target: block });

  assert.equal(menu.state.open, false);
  assert.equal(insertMenu.state.open, false);
  assert.equal(view.calls.some((call) => call[0] === "drag"), true);
});

test("Tiptap block drop placement targets before and after positions", () => {
  const block = createElement({
    tagName: "P",
    rect: { left: 80, top: 20, width: 360, height: 40, bottom: 60 },
  });
  const target = {
    block,
    pos: 12,
    node: { nodeSize: 8 },
  };

  assert.deepEqual(blockDropPlacement(target, 24), {
    target,
    placement: "before",
    pos: 12,
    rect: { left: 80, top: 20, width: 360, height: 40, bottom: 60 },
  });
  assert.deepEqual(blockDropPlacement(target, 58), {
    target,
    placement: "after",
    pos: 20,
    rect: { left: 80, top: 20, width: 360, height: 40, bottom: 60 },
  });
});

test("Tiptap block move creates an adjusted ProseMirror transaction", () => {
  const calls = [];
  const node = { nodeSize: 6, type: "paragraph" };
  const tr = {
    doc: {
      resolve(pos) {
        calls.push(["resolve", pos]);
        return {
          index: () => 0,
          parent: {
            canReplaceWith(index, end, type) {
              calls.push(["canReplaceWith", index, end, type]);
              return true;
            },
          },
        };
      },
    },
    delete(from, to) {
      calls.push(["delete", from, to]);
      return this;
    },
    insert(pos, insertedNode) {
      calls.push(["insert", pos, insertedNode]);
      return this;
    },
    scrollIntoView() {
      calls.push(["scrollIntoView"]);
      return this;
    },
  };
  const editor = {
    state: {
      tr,
      doc: {
        nodeAt() {
          return node;
        },
      },
    },
  };

  const result = createTiptapBlockMove(
    editor,
    { pos: 4, node },
    { pos: 22 },
  );

  assert.equal(result.pos, 16);
  assert.equal(result.tr, tr);
  assert.deepEqual(calls, [
    ["delete", 4, 10],
    ["resolve", 16],
    ["canReplaceWith", 0, 0, "paragraph"],
    ["insert", 16, node],
    ["scrollIntoView"],
  ]);
});

test("Tiptap block handle inserts a slash paragraph after the current block", () => {
  const { block, calls, editor } = createEditor();
  const target = {
    block,
    kind: "paragraph",
    pos: 7,
    node: { nodeSize: 6 },
  };

  const range = insertSlashParagraphAfterBlock(editor, target);

  assert.deepEqual(range, { from: 14, to: 15 });
  assert.deepEqual(calls, [
    [
      "insertContentAt",
      13,
      { type: "paragraph", content: [{ type: "text", text: "/" }] },
      { updateSelection: true },
    ],
    ["setTextSelection", 15],
  ]);
});

test("Tiptap block move rejects self drops and invalid parents", () => {
  const node = { nodeSize: 6, type: "paragraph" };
  const editor = {
    state: {
      tr: {
        doc: {
          resolve() {
            return {
              index: () => 0,
              parent: {
                canReplaceWith: () => false,
              },
            };
          },
        },
        delete() {
          return this;
        },
      },
      doc: {
        nodeAt() {
          return node;
        },
      },
    },
  };

  assert.equal(createTiptapBlockMove(editor, { pos: 4, node }, { pos: 7 }), null);
  assert.equal(createTiptapBlockMove(editor, { pos: 4, node }, { pos: 20 }), null);
});
