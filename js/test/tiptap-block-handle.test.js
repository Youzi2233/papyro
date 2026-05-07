import test from "node:test";
import assert from "node:assert/strict";

import {
  blockDropPlacement,
  createTiptapBlockMove,
  createTiptapBlockHandleController,
  insertSlashParagraphAfterBlock,
} from "../src/tiptap-block-handle.js";

function elementMatchesSelector(element, selector) {
  const alternatives = String(selector ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const tag = String(element?.tagName ?? "").toLowerCase();
  const classes = element?.classList?.values ?? new Set();

  return alternatives.some((alternative) => {
    if (alternative.startsWith(".")) {
      return classes.has(alternative.slice(1));
    }
    const dataMath = /^\[data-mn-math=['"]block['"]\]$/u.test(alternative);
    if (dataMath) return element?.attributes?.get?.("data-mn-math") === "block";
    const dataMermaid = /^\[data-mn-mermaid=['"]block['"]\]$/u.test(alternative);
    if (dataMermaid) return element?.attributes?.get?.("data-mn-mermaid") === "block";
    const dataType = alternative === "[data-type]";
    if (dataType) return element?.attributes?.has?.("data-type") === true;
    return alternative === tag;
  });
}

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
        current = current.parentNode ?? current.parentElement;
      }
      return false;
    },
    closest(selector) {
      let current = this;
      while (current) {
        if (elementMatchesSelector(current, selector)) return current;
        current = current.parentNode ?? current.parentElement;
      }
      return null;
    },
    matches(selector) {
      return elementMatchesSelector(this, selector);
    },
    attributes: new Map(),
    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    },
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
    getBoundingClientRect() {
      return rect ?? { left: 100, top: 40, width: 480, height: 32 };
    },
    classList: {
      values: new Set(),
      add(value) {
        this.values.add(value);
      },
      remove(value) {
        this.values.delete(value);
      },
      contains(value) {
        return this.values.has(value);
      },
    },
    ownerDocument: {
      documentElement: {
        clientWidth: 1000,
      },
      createRange() {
        return {
          selectedNode: null,
          selectNodeContents(node) {
            this.selectedNode = node;
          },
        };
      },
      getSelection() {
        return {
          ranges: [],
          removeAllRanges() {
            this.ranges = [];
          },
          addRange(range) {
            this.ranges.push(range);
          },
        };
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
  const states = [];
  let actionCount = 0;
  let insertCount = 0;
  return {
    calls,
    states,
    mount(root) {
      calls.push(["mount", root?.className ?? ""]);
    },
    update(state) {
      calls.push(["update", state.target.kind, state.target.pos]);
      states.push(state);
      this.openActions = state.openActions;
      this.openInsert = state.openInsert;
      this.startDrag = state.startDrag;
      this.releaseAction = state.releaseAction;
      this.clickAction = state.clickAction;
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
  let containedTarget = null;
  let externalContains = () => false;
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
    contains(target) {
      return target === containedTarget;
    },
    setExternalContains(contains) {
      externalContains = contains;
    },
    externalContains(target) {
      return externalContains(target);
    },
    setContainedTarget(target) {
      containedTarget = target;
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
  let containedTarget = null;
  let externalContains = () => false;
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
    contains(target) {
      return target === containedTarget;
    },
    setExternalContains(contains) {
      externalContains = contains;
    },
    externalContains(target) {
      return externalContains(target);
    },
    setContainedTarget(target) {
      containedTarget = target;
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

test("Tiptap block handle targets the outer table from inside table cells", () => {
  const { editor, root } = createEditor();
  const table = createElement({ tagName: "TABLE", parent: root });
  table.classList.add("mn-tiptap-table");
  const row = createElement({ tagName: "TR", parent: table });
  const cell = createElement({ tagName: "TD", parent: row });
  const paragraph = createElement({ tagName: "P", parent: cell });
  editor.view.posAtDOM = (target) => (target === table ? 21 : 7);
  editor.state.doc.nodeAt = (pos) =>
    pos === 21 ? { nodeSize: 42, type: { name: "table" } } : null;
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });

  controller.handlePointerMove({ target: paragraph });

  assert.equal(controller.state.open, true);
  assert.equal(controller.state.target.kind, "table");
  assert.equal(controller.state.target.block, table);
  assert.equal(controller.state.target.pos, 21);
});

test("Tiptap block handle targets complex block chrome instead of child controls", () => {
  const scenarios = [
    {
      className: "mn-tiptap-code-block",
      tagName: "PRE",
      childTagName: "BUTTON",
      kind: "code_block",
      pos: 31,
      type: "codeBlock",
    },
    {
      className: "mn-tiptap-math-block",
      tagName: "DIV",
      childTagName: "SPAN",
      kind: "math_block",
      pos: 41,
      type: "mathBlock",
    },
    {
      className: "mn-tiptap-mermaid-block",
      tagName: "DIV",
      childTagName: "TEXTAREA",
      kind: "mermaid_block",
      pos: 51,
      type: "mermaidBlock",
    },
  ];

  for (const scenario of scenarios) {
    const { editor, root } = createEditor();
    const block = createElement({ tagName: scenario.tagName, parent: root });
    block.classList.add(scenario.className);
    const child = createElement({ tagName: scenario.childTagName, parent: block });
    editor.view.posAtDOM = (target) => (target === block ? scenario.pos : 7);
    editor.state.doc.nodeAt = (pos) =>
      pos === scenario.pos
        ? { nodeSize: 12, type: { name: scenario.type } }
        : null;
    const view = createViewSpy();
    const controller = createTiptapBlockHandleController({ view });
    controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });

    controller.handlePointerMove({ target: child });

    assert.equal(controller.state.open, true);
    assert.equal(controller.state.target.kind, scenario.kind);
    assert.equal(controller.state.target.block, block);
    assert.equal(controller.state.target.pos, scenario.pos);
  }
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

test("Tiptap block handle registers itself as a safe menu boundary", () => {
  const { editor } = createEditor();
  const handleTarget = { id: "handle-target" };
  const insertMenu = createInsertMenuSpy();
  const menu = createMenuSpy();
  const view = {
    ...createViewSpy(),
    contains(target) {
      return target === handleTarget;
    },
  };
  const controller = createTiptapBlockHandleController({ insertMenu, menu, view });

  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });

  assert.equal(menu.externalContains(handleTarget), true);
  assert.equal(insertMenu.externalContains(handleTarget), true);
  assert.equal(menu.externalContains({ id: "outside" }), false);
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

test("Tiptap block handle clears stale selected block highlights", () => {
  const first = createElement({ tagName: "P" });
  const second = createElement({ tagName: "P" });
  const { editor } = createEditor({ block: first });
  const menu = createMenuSpy();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ menu, view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });

  controller.handlePointerMove({ target: first });
  view.openActions();
  assert.equal(first.classList.contains("mn-tiptap-block-selected"), true);

  menu.close();
  second.parentNode = editor.view.dom;
  editor.view.posAtDOM = (target) => (target === second ? 17 : 7);
  editor.state.doc.nodeAt = (pos) => (pos === 17 ? { nodeSize: 5 } : { nodeSize: 6 });
  controller.handlePointerMove({ target: second });
  view.openActions();

  assert.equal(first.classList.contains("mn-tiptap-block-selected"), false);
  assert.equal(second.classList.contains("mn-tiptap-block-selected"), true);

  controller.close();
  assert.equal(second.classList.contains("mn-tiptap-block-selected"), false);
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
    ["setTextSelection", { from: 7, to: 13 }],
    ["focus"],
  ]);
});

test("Tiptap block handle selects the full textblock range before painting the DOM block", () => {
  const block = createElement({ tagName: "P" });
  const { calls, editor } = createEditor({ block });
  editor.state.doc.nodeAt = () => ({
    isTextblock: true,
    nodeSize: 9,
    content: { size: 7 },
  });
  editor.commands.setNodeSelection = (pos) => {
    calls.push(["setNodeSelection", pos]);
    return false;
  };
  editor.commands.setTextSelection = (range) => {
    calls.push(["setTextSelection", range]);
    return true;
  };
  const menu = createMenuSpy();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ menu, view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });

  view.openActions();

  assert.deepEqual(calls.slice(-3), [
    ["posAtDOM", "P", 0],
    ["setTextSelection", { from: 8, to: 15 }],
    ["focus"],
  ]);
});

test("Tiptap block handle falls back to the full textblock range without DOM selection", () => {
  const block = createElement({ tagName: "P" });
  block.ownerDocument = {
    documentElement: {
      clientWidth: 1000,
    },
  };
  const { calls, editor } = createEditor({ block });
  editor.state.doc.nodeAt = () => ({
    isTextblock: true,
    nodeSize: 9,
    content: { size: 7 },
  });
  editor.commands.setNodeSelection = (pos) => {
    calls.push(["setNodeSelection", pos]);
    return false;
  };
  editor.commands.setTextSelection = (range) => {
    calls.push(["setTextSelection", range]);
    return true;
  };
  const menu = createMenuSpy();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ menu, view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });

  view.openActions();

  assert.deepEqual(calls.slice(-3), [
    ["posAtDOM", "P", 0],
    ["setTextSelection", { from: 8, to: 15 }],
    ["focus"],
  ]);
});

test("Tiptap block handle exposes active menu state to the handle view", () => {
  const { block, editor } = createEditor();
  const insertMenu = createInsertMenuSpy();
  const menu = createMenuSpy();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ insertMenu, menu, view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });

  view.openActions();
  controller.refresh();
  assert.equal(view.states.at(-1).menuOpen, true);
  assert.equal(view.states.at(-1).insertOpen, false);

  menu.close();
  view.openInsert();
  controller.refresh();
  assert.equal(view.states.at(-1).menuOpen, false);
  assert.equal(view.states.at(-1).insertOpen, true);
});

test("Tiptap block handle prepares drag without opening actions on pointerdown", () => {
  const { block, editor } = createEditor();
  const menu = createMenuSpy();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ menu, view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });

  assert.equal(view.startDrag({ clientX: 10, clientY: 10, preventDefault() {} }), true);
  assert.equal(menu.state.open, false);

  assert.deepEqual(menu.calls, [["attach", "DIV"]]);
});

test("Tiptap block handle primary pointer opens actions immediately", () => {
  const { block, editor } = createEditor();
  const menu = createMenuSpy();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ menu, view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });

  assert.equal(view.states.at(-1).clickAction({ clientX: 18, clientY: 24, preventDefault() {} }), true);

  assert.equal(menu.state.open, true);
  assert.deepEqual(menu.calls, [
    ["attach", "DIV"],
    ["open", "paragraph", 7, [18, 24]],
  ]);
});

test("Tiptap block handle opens actions from a release callback", () => {
  const { block, editor } = createEditor();
  const menu = createMenuSpy();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ menu, view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });

  assert.equal(view.startDrag({ clientX: 24, clientY: 36, preventDefault() {} }), true);
  assert.equal(view.releaseAction({ clientX: 24, clientY: 36, preventDefault() {} }), true);

  assert.equal(menu.state.open, true);
  assert.deepEqual(menu.calls, [
    ["attach", "DIV"],
    ["open", "paragraph", 7, [24, 36]],
  ]);
});

test("Tiptap block handle click fallback opens actions without pointer capture", () => {
  const { block, editor } = createEditor();
  const menu = createMenuSpy();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ menu, view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });

  assert.equal(view.clickAction({ clientX: 30, clientY: 48, preventDefault() {} }), true);

  assert.equal(menu.state.open, true);
  assert.deepEqual(menu.calls, [
    ["attach", "DIV"],
    ["open", "paragraph", 7, [30, 48]],
  ]);
});

test("Tiptap block handle keeps a release-opened action menu stable", () => {
  const { block, editor } = createEditor();
  const menu = createMenuSpy();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ menu, view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });

  assert.equal(view.startDrag({ clientX: 10, clientY: 10, preventDefault() {} }), true);
  assert.equal(view.releaseAction({ clientX: 10, clientY: 10, preventDefault() {} }), true);

  assert.equal(menu.state.open, true);
  assert.deepEqual(menu.calls.at(-1), ["open", "paragraph", 7, [10, 10]]);
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

test("Tiptap block handle keeps an open action menu anchored to its original block", () => {
  const { block, editor, root } = createEditor();
  const nextBlock = createElement({ tagName: "H2", parent: root });
  const menu = createMenuSpy();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ menu, view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });
  view.openActions();

  controller.handlePointerMove({ target: nextBlock });

  assert.equal(controller.state.open, true);
  assert.equal(controller.state.target.block, block);
  assert.equal(menu.state.open, true);
  assert.deepEqual(view.calls.at(-1), ["update", "paragraph", 7]);
});

test("Tiptap block handle keeps open floating menus during editor scroll", () => {
  const { block, editor } = createEditor();
  const menu = createMenuSpy();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ menu, view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });
  view.openActions();

  editor.view.dom.listeners.get("scroll")({ target: editor.view.dom });

  assert.equal(controller.state.open, true);
  assert.equal(menu.state.open, true);
  assert.deepEqual(view.calls.at(-1), ["update", "paragraph", 7]);
});

test("Tiptap block handle retargets open menus after ProseMirror remounts block DOM", () => {
  const { block, editor, root } = createEditor();
  const remountedBlock = createElement({ tagName: "P", parent: root });
  const menu = createMenuSpy();
  const view = createViewSpy();
  editor.view.nodeDOM = (pos) => (pos === 7 ? remountedBlock : null);
  const controller = createTiptapBlockHandleController({ menu, view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });
  view.openActions();
  block.parentNode = null;

  controller.handlePointerMove({ target: { id: "outside" } });

  assert.equal(controller.state.open, true);
  assert.equal(controller.state.target.block, remountedBlock);
  assert.equal(menu.state.open, true);
  assert.deepEqual(view.calls.at(-1), ["update", "paragraph", 7]);
});

test("Tiptap block handle keeps the action menu open while a block DOM is temporarily missing", () => {
  const { block, editor } = createEditor();
  const menu = createMenuSpy();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ menu, view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });
  view.openActions();
  block.parentNode = null;

  controller.handlePointerMove({ target: { id: "outside" } });

  assert.equal(controller.state.open, true);
  assert.equal(menu.state.open, true);
  assert.deepEqual(view.calls.at(-1), ["hide"]);
});

test("Tiptap block handle keeps the insert menu open while a block DOM is temporarily missing", () => {
  const { block, editor } = createEditor();
  const insertMenu = createInsertMenuSpy();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ insertMenu, view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });
  view.openInsert();
  block.parentNode = null;

  controller.handlePointerMove({ target: { id: "outside" } });

  assert.equal(controller.state.open, true);
  assert.equal(insertMenu.state.open, true);
  assert.deepEqual(view.calls.at(-1), ["hide"]);
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

test("Tiptap block handle keeps floating menus open across editor blur", () => {
  const { block, editor } = createEditor();
  const insertMenu = createInsertMenuSpy();
  const menu = createMenuSpy();
  const view = createViewSpy();
  const controller = createTiptapBlockHandleController({ insertMenu, menu, view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });

  view.openActions();
  assert.equal(controller.shouldKeepOpenOnEditorBlur({ id: "outside" }), true);
  menu.close();
  view.openInsert();
  assert.equal(controller.shouldKeepOpenOnEditorBlur({ id: "outside" }), true);
  insertMenu.close();
  assert.equal(controller.shouldKeepOpenOnEditorBlur({ id: "outside" }), false);
});

test("Tiptap block handle treats focus inside action and insert menus as internal", () => {
  const { block, editor } = createEditor();
  const insertMenu = createInsertMenuSpy();
  const menu = createMenuSpy();
  const view = createViewSpy();
  const actionTarget = { id: "action-target" };
  const insertTarget = { id: "insert-target" };
  const controller = createTiptapBlockHandleController({ insertMenu, menu, view });
  controller.attach({ editor, root: editor.view.dom, entry: { viewMode: "hybrid" } });
  controller.handlePointerMove({ target: block });
  menu.setContainedTarget(actionTarget);
  insertMenu.setContainedTarget(insertTarget);

  assert.equal(controller.shouldKeepOpenOnEditorBlur(actionTarget), true);
  assert.equal(controller.shouldKeepOpenOnEditorBlur(insertTarget), true);
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
