import test from "node:test";
import assert from "node:assert/strict";

import { createTiptapBlockActionMenuController } from "../src/tiptap-block-action-menu.js";

function createTarget() {
  return {
    kind: "paragraph",
    pos: 4,
    node: { nodeSize: 6 },
    block: {
      contains: (target) => target?.id === "target-block-child",
      getBoundingClientRect: () => ({ left: 120, top: 80, width: 480, height: 30 }),
      ownerDocument: {
        documentElement: {
          clientWidth: 1000,
          clientHeight: 800,
        },
      },
    },
  };
}

function createCalloutTarget() {
  return {
    ...createTarget(),
    kind: "calloutBlock",
    node: {
      type: { name: "calloutBlock" },
      nodeSize: 8,
    },
  };
}

function createCodeBlockTarget() {
  return {
    ...createTarget(),
    kind: "code_block",
    node: {
      type: { name: "codeBlock" },
      attrs: { language: "rust" },
      nodeSize: 8,
    },
  };
}

function createEditor() {
  const calls = [];
  const marks = {
    textStyle: {
      create: (attrs) => ({ type: "textStyle", attrs }),
    },
    highlight: {
      create: (attrs) => ({ type: "highlight", attrs }),
    },
  };
  const editor = {
    commands: {
      focus: (pos) => calls.push(["focus", pos ?? null]),
      insertContent: () => true,
      setParagraph: () => {
        calls.push(["setParagraph"]);
        return true;
      },
    },
    state: {
      schema: { marks },
      doc: {
        nodesBetween() {},
        textBetween(from, to) {
          calls.push(["textBetween", from, to]);
          return "Block text";
        },
      },
    },
  };
  return { calls, editor };
}

function createMoveEditor() {
  const { calls, editor } = createEditor();
  const previous = { nodeSize: 3, type: { name: "paragraph" } };
  const current = { nodeSize: 6, type: { name: "paragraph" } };
  const next = { nodeSize: 7, type: { name: "paragraph" } };
  const children = [previous, current, next];
  const parent = {
    childCount: children.length,
    child: (index) => {
      calls.push(["child", index]);
      return children[index] ?? null;
    },
    canReplaceWith: () => true,
  };
  const tr = {
    doc: {
      resolve(pos) {
        calls.push(["tr.resolve", pos]);
        return { parent, index: () => 1 };
      },
    },
    delete(from, to) {
      calls.push(["delete", from, to]);
      return tr;
    },
    insert(pos, node) {
      calls.push(["insert", pos, node === current ? "current" : "other"]);
      return tr;
    },
    scrollIntoView() {
      calls.push(["scrollIntoView"]);
      return tr;
    },
  };
  editor.commands.setNodeSelection = (pos) => {
    calls.push(["setNodeSelection", pos]);
    return true;
  };
  editor.state.tr = tr;
  editor.state.doc.nodeAt = () => current;
  editor.state.doc.resolve = () => ({ depth: 1, parent, index: () => 1 });
  editor.view = {
    dispatch(transaction) {
      calls.push(["dispatch", transaction === tr]);
    },
  };
  return { calls, editor, current };
}

function createViewSpy() {
  const calls = [];
  let containedTarget = null;
  return {
    calls,
    mount(root) {
      calls.push(["mount", root?.className ?? ""]);
    },
    update(state) {
      calls.push([
        "update",
        state.target.kind,
        state.commands.map((command) => command.id),
        state.selectedIndex,
      ]);
      this.run = state.run;
    },
    hide() {
      calls.push(["hide"]);
    },
    destroy() {
      calls.push(["destroy"]);
    },
    contains(target) {
      return target === containedTarget;
    },
    setContainedTarget(target) {
      containedTarget = target;
    },
  };
}

function createDismissDocument() {
  const listeners = new Map();
  return {
    body: {
      appendChild() {},
    },
    documentElement: {
      clientWidth: 1000,
      clientHeight: 800,
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    emit(type, event = {}) {
      listeners.get(type)?.(event);
    },
  };
}

function createDocument() {
  const scrollCalls = [];
  const body = {
    children: [],
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
    },
  };

  function walk(element, visit) {
    (element.children ?? []).forEach((child) => {
      visit(child);
      walk(child, visit);
    });
  }

  function createElement(tagName) {
    return {
      tagName: tagName.toUpperCase(),
      children: [],
      className: "",
      dataset: {},
      style: {},
      attributes: new Map(),
      classList: {
        values: new Set(),
        toggle(name, enabled) {
          if (enabled) this.values.add(name);
          else this.values.delete(name);
        },
      },
      append(...children) {
        this.children.push(...children);
      },
      appendChild(child) {
        this.children.push(child);
      },
      addEventListener(name, handler) {
        this[`on${name}`] = handler;
      },
      replaceChildren(...children) {
        this.children = children;
      },
      querySelector(selector) {
        if (!String(selector).startsWith("#")) return null;
        const id = String(selector).slice(1);
        let found = null;
        walk(this, (child) => {
          if (!found && child.id === id) found = child;
        });
        return found;
      },
      remove() {},
      scrollIntoView(options) {
        scrollCalls.push([this.id, options]);
      },
      setAttribute(name, value) {
        this.attributes.set(name, value);
      },
    };
  }

  return {
    body,
    createElement,
    scrollCalls,
  };
}

function findElementByClass(root, className) {
  if (!root) return null;
  if (String(root.className ?? "").split(/\s+/).includes(className)) return root;
  for (const child of root.children ?? []) {
    const found = findElementByClass(child, className);
    if (found) return found;
  }
  return null;
}

function findCommandItem(root, commandId) {
  if (!root) return null;
  if (root.dataset?.commandId === commandId) return root;
  for (const child of root.children ?? []) {
    const found = findCommandItem(child, commandId);
    if (found) return found;
  }
  return null;
}

test("Tiptap block action menu opens for Hybrid block targets", () => {
  const { editor } = createEditor();
  const view = createViewSpy();
  const controller = createTiptapBlockActionMenuController({ view });
  controller.attach({ editor, root: { className: "root" }, entry: { viewMode: "hybrid" } });

  controller.open(createTarget());

  assert.equal(controller.state.open, true);
  assert.deepEqual(
    controller.state.commands
      .filter((command) => !command.submenu || Array.isArray(command.children))
      .map((command) => command.id),
    [
      "copy-block",
      "duplicate-block",
      "reset-formatting",
      "turn-into",
      "text-color-ink",
      "text-color-muted",
      "text-color-accent",
      "text-color-danger",
      "highlight-clear",
      "highlight-yellow",
      "highlight-blue",
      "highlight-green",
      "delete",
    ],
  );
  assert.ok(controller.state.commands.some((command) => command.id === "heading-2" && command.submenu === "turn-into"));
  assert.deepEqual(view.calls[0], ["mount", "root"]);
  assert.equal(view.calls[1][0], "update");
});

test("Tiptap block action menu stays closed outside Hybrid mode", () => {
  const { editor } = createEditor();
  const view = createViewSpy();
  const controller = createTiptapBlockActionMenuController({ view });
  controller.attach({ editor, root: {}, entry: { viewMode: "preview" } });

  controller.open(createTarget());

  assert.equal(controller.state.open, false);
  assert.deepEqual(view.calls, [["mount", ""]]);
});

test("Tiptap block action menu supports keyboard selection", () => {
  const { editor } = createEditor();
  const view = createViewSpy();
  const controller = createTiptapBlockActionMenuController({ view });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  controller.open(createTarget());

  controller.handleKeyDown({ key: "ArrowDown", preventDefault() {} });

  assert.equal(controller.state.selectedIndex, 1);
  assert.equal(view.calls.at(-1)[3], 1);
});

test("Tiptap block action menu scrolls keyboard selections into view", () => {
  const { editor } = createEditor();
  const documentRef = createDocument();
  const controller = createTiptapBlockActionMenuController({
    dom: { document: documentRef },
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  controller.open(createTarget());

  controller.handleKeyDown({ key: "ArrowDown", preventDefault() {} });

  assert.deepEqual(documentRef.scrollCalls.at(-1), [
    "mn-tiptap-block-action-menu-item-1",
    { block: "nearest", inline: "nearest" },
  ]);
});

test("Tiptap block action menu activates hovered and focused commands", () => {
  const { editor } = createEditor();
  const documentRef = createDocument();
  const controller = createTiptapBlockActionMenuController({
    dom: { document: documentRef },
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  controller.open(createTarget());

  const menu = documentRef.body.children[0];
  const copy = findCommandItem(menu, "copy-block");
  const duplicate = findCommandItem(menu, "duplicate-block");
  const initialScrollCount = documentRef.scrollCalls.length;

  duplicate.onpointerenter?.({ preventDefault() {}, stopPropagation() {} });
  assert.equal(controller.state.selectedIndex, 1);
  assert.equal(findCommandItem(menu, "copy-block"), copy);
  assert.equal(findCommandItem(menu, "duplicate-block"), duplicate);
  assert.equal(documentRef.scrollCalls.length, initialScrollCount);
  assert.equal(findCommandItem(menu, "duplicate-block").classList.values.has("active"), true);
  assert.equal(findCommandItem(menu, "copy-block").classList.values.has("active"), false);
  assert.equal(menu.attributes.get("aria-activedescendant"), "mn-tiptap-block-action-menu-item-1");

  const deleteBlock = findCommandItem(menu, "delete");
  deleteBlock.onfocus?.({ preventDefault() {}, stopPropagation() {} });
  assert.equal(controller.state.commands[controller.state.selectedIndex].id, "delete");
  assert.equal(documentRef.scrollCalls.length, initialScrollCount + 1);
  assert.equal(findCommandItem(menu, "delete").classList.values.has("active"), true);
  assert.equal(findCommandItem(menu, "duplicate-block").classList.values.has("active"), false);
});

test("Tiptap block action menu refresh preserves the active command", () => {
  const { editor } = createEditor();
  const documentRef = createDocument();
  const controller = createTiptapBlockActionMenuController({
    dom: { document: documentRef },
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  controller.open(createTarget());

  const menu = documentRef.body.children[0];
  findCommandItem(menu, "highlight-blue").onpointerenter?.({
    preventDefault() {},
    stopPropagation() {},
  });

  controller.refresh();

  assert.equal(
    controller.state.commands[controller.state.selectedIndex].id,
    "highlight-blue",
  );
  assert.equal(
    documentRef.body.children[0].attributes.get("aria-activedescendant"),
    `mn-tiptap-block-action-menu-item-${controller.state.selectedIndex}`,
  );
});

test("Tiptap block action menu runs the selected command", () => {
  const { calls, editor } = createEditor();
  const view = createViewSpy();
  const controller = createTiptapBlockActionMenuController({ view });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  controller.open(createTarget());

  controller.setSelection(1);
  assert.equal(controller.handleKeyDown({ key: "Enter", preventDefault() {} }), true);

  assert.equal(controller.state.open, false);
  assert.deepEqual(calls, [
    ["focus", 4],
    ["textBetween", 4, 10],
    ["focus", null],
  ]);
  assert.deepEqual(view.calls.at(-1), ["hide"]);
});

test("Tiptap block action menu items support click fallback without double-run", () => {
  const { calls, editor } = createEditor();
  const documentRef = createDocument();
  const controller = createTiptapBlockActionMenuController({
    dom: { document: documentRef },
  });
  const event = () => ({ preventDefault() {}, stopPropagation() {} });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  controller.open(createTarget());
  const item = findCommandItem(documentRef.body.children[0], "copy-block");

  item.onclick(event());

  assert.deepEqual(calls, [
    ["focus", 4],
    ["textBetween", 4, 10],
    ["focus", null],
  ]);
  assert.equal(controller.state.open, false);

  calls.length = 0;
  controller.open(createTarget());
  const freshItem = findCommandItem(documentRef.body.children[0], "copy-block");
  freshItem.onpointerdown(event());
  freshItem.onclick(event());

  assert.deepEqual(calls, [
    ["focus", 4],
    ["textBetween", 4, 10],
    ["focus", null],
  ]);
});

test("Tiptap block action menu runs advertised keyboard shortcuts", () => {
  const { calls, editor } = createEditor();
  const view = createViewSpy();
  const controller = createTiptapBlockActionMenuController({ view });
  let prevented = 0;
  editor.commands.insertContentAt = (pos, markdown, options) => {
    calls.push(["insertContentAt", pos, markdown, options.contentType]);
    return true;
  };
  editor.commands.deleteRange = (range) => {
    calls.push(["deleteRange", range.from, range.to]);
    return true;
  };
  editor.state.doc.textBetween = (from, to) => {
    calls.push(["textBetween", from, to]);
    return "Block text";
  };
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  controller.open(createTarget());

  assert.equal(
    controller.handleKeyDown({
      key: "d",
      ctrlKey: true,
      preventDefault() {
        prevented += 1;
      },
    }),
    true,
  );
  assert.equal(prevented, 1);
  assert.deepEqual(calls, [
    ["focus", 4],
    ["textBetween", 4, 10],
    ["insertContentAt", 10, "\nBlock text\n", "markdown"],
    ["focus", null],
  ]);

  calls.length = 0;
  controller.open(createTarget());
  assert.equal(
    controller.handleKeyDown({
      key: "Delete",
      preventDefault() {
        prevented += 1;
      },
    }),
    true,
  );
  assert.equal(prevented, 2);
  assert.deepEqual(calls, [
    ["focus", 4],
    ["deleteRange", 4, 10],
    ["focus", null],
  ]);
});

test("Tiptap block action menu runs move keyboard shortcuts", () => {
  const { calls, editor, current } = createMoveEditor();
  const view = createViewSpy();
  const controller = createTiptapBlockActionMenuController({ view });
  let prevented = 0;
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  controller.open({ ...createTarget(), pos: 10, node: current });
  calls.length = 0;

  assert.equal(
    controller.handleKeyDown({
      key: "ArrowUp",
      altKey: true,
      preventDefault() {
        prevented += 1;
      },
    }),
    true,
  );
  assert.equal(prevented, 1);
  assert.deepEqual(calls, [
    ["focus", 10],
    ["child", 0],
    ["delete", 10, 16],
    ["tr.resolve", 7],
    ["insert", 7, "current"],
    ["scrollIntoView"],
    ["dispatch", true],
    ["setNodeSelection", 7],
    ["focus", null],
    ["focus", null],
  ]);
});

test("Tiptap block action menu yields keyboard handling during IME composition", () => {
  const { calls, editor } = createEditor();
  const view = createViewSpy();
  const controller = createTiptapBlockActionMenuController({ view });
  let prevented = false;
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  controller.open(createTarget());

  assert.equal(
    controller.handleKeyDown({
      key: "Enter",
      isComposing: true,
      preventDefault() {
        prevented = true;
      },
    }),
    false,
  );

  assert.equal(prevented, false);
  assert.equal(controller.state.open, true);
  assert.deepEqual(calls, []);
});

test("Tiptap block action menu treats keyCode 229 as IME composition", () => {
  const { calls, editor } = createEditor();
  const view = createViewSpy();
  const controller = createTiptapBlockActionMenuController({ view });
  let prevented = false;
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  controller.open(createTarget());

  assert.equal(
    controller.handleKeyDown({
      key: "ArrowDown",
      keyCode: 229,
      preventDefault() {
        prevented = true;
      },
    }),
    false,
  );

  assert.equal(prevented, false);
  assert.equal(controller.state.selectedIndex, 0);
  assert.deepEqual(calls, []);
});

test("Tiptap block action menu renders grouped command sections", () => {
  const { editor } = createEditor();
  const documentRef = createDocument();
  const controller = createTiptapBlockActionMenuController({
    dom: { document: documentRef },
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  controller.open(createTarget());

  const menu = documentRef.body.children[0];
  const list = findElementByClass(menu, "mn-tiptap-block-action-menu-list");
  assert.deepEqual(
    list.children.map((section) => section.children[0].textContent),
    [
      "Actions",
      "Color",
      "Highlight",
      "Danger",
    ],
  );
  assert.equal(list.children[0].children[1].dataset.commandId, "copy-block");
  assert.equal(list.children[0].children[3].dataset.commandId, "reset-formatting");
  assert.equal(list.children[1].children[1].dataset.commandId, "text-color-ink");
  assert.equal(list.children[0].dataset.group, "Actions");
  assert.equal(list.children[0].dataset.layout, "list");
  assert.equal(list.children[1].dataset.group, "Color");
  assert.equal(list.children[1].dataset.layout, "swatch");
  assert.equal(list.children[3].dataset.tone, "danger");
});

test("Tiptap block action menu localizes its accessible label", () => {
  const { editor } = createEditor();
  const documentRef = createDocument();
  const controller = createTiptapBlockActionMenuController({
    dom: { document: documentRef },
  });
  controller.attach({
    editor,
    root: {},
    entry: { viewMode: "hybrid", preferences: { language: "Chinese" } },
  });

  controller.open(createTarget());

  const menu = documentRef.body.children[0];
  assert.equal(menu.attributes.get("aria-label"), "块操作");
});

test("Tiptap block action menu renders callout kind sections for callout blocks", () => {
  const { editor } = createEditor();
  const documentRef = createDocument();
  const controller = createTiptapBlockActionMenuController({
    dom: { document: documentRef },
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  controller.open(createCalloutTarget());

  const menu = documentRef.body.children[0];
  const list = findElementByClass(menu, "mn-tiptap-block-action-menu-list");
  assert.deepEqual(
    list.children.map((section) => section.children[0].textContent),
    [
      "Actions",
      "Callout",
      "Color",
      "Highlight",
      "Danger",
    ],
  );
  assert.deepEqual(
    list.children[1].children.slice(1).map((item) => item.dataset.commandId),
    [
      "callout-kind-note",
      "callout-kind-tip",
      "callout-kind-warning",
      "callout-kind-danger",
    ],
  );
});

test("Tiptap block action menu renders nested turn-into commands", () => {
  const { editor } = createEditor();
  const documentRef = createDocument();
  const controller = createTiptapBlockActionMenuController({
    dom: { document: documentRef },
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  controller.open(createTarget());

  const menu = documentRef.body.children[0];
  const trigger = findCommandItem(menu, "turn-into");
  assert.equal(trigger.dataset.submenuTrigger, "turn-into");
  assert.equal(trigger.classList.values.has("active"), false);
  assert.equal(findCommandItem(menu, "heading-2").dataset.submenu, "turn-into");

  trigger.onpointerenter?.({ preventDefault() {}, stopPropagation() {} });
  assert.equal(controller.state.commands[controller.state.selectedIndex].id, "turn-into");
  assert.equal(trigger.classList.values.has("active"), true);
});

test("Tiptap block action menu supports keyboard submenu entry and return", () => {
  const { editor } = createEditor();
  const documentRef = createDocument();
  const controller = createTiptapBlockActionMenuController({
    dom: { document: documentRef },
  });
  const prevented = [];
  const event = (key) => ({
    key,
    preventDefault() {
      prevented.push(key);
    },
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  controller.open(createTarget());

  controller.setSelection(controller.state.commands.findIndex((command) => command.id === "turn-into"));
  assert.equal(controller.handleKeyDown(event("ArrowRight")), true);
  assert.equal(controller.state.commands[controller.state.selectedIndex].id, "paragraph");
  assert.equal(findCommandItem(documentRef.body.children[0], "paragraph").classList.values.has("active"), true);

  assert.equal(controller.handleKeyDown(event("ArrowRight")), true);
  assert.equal(controller.state.commands[controller.state.selectedIndex].id, "heading-1");

  assert.equal(controller.handleKeyDown(event("ArrowLeft")), true);
  assert.equal(controller.state.commands[controller.state.selectedIndex].id, "turn-into");

  assert.equal(controller.handleKeyDown(event("End")), true);
  assert.equal(controller.state.commands[controller.state.selectedIndex].id, "delete");

  assert.equal(controller.handleKeyDown(event("ArrowLeft")), false);
  assert.equal(controller.state.commands[controller.state.selectedIndex].id, "delete");
  assert.equal(controller.handleKeyDown(event("Home")), true);
  assert.equal(controller.state.commands[controller.state.selectedIndex].id, "copy-block");
  assert.equal(controller.handleKeyDown(event("End")), true);
  assert.equal(controller.state.commands[controller.state.selectedIndex].id, "delete");

  controller.setSelection(controller.state.commands.findIndex((command) => command.id === "heading-1"));
  assert.equal(controller.handleKeyDown(event("End")), true);
  assert.equal(controller.state.commands[controller.state.selectedIndex].id, "code-block");
  assert.equal(controller.handleKeyDown(event("ArrowLeft")), true);
  assert.equal(controller.state.commands[controller.state.selectedIndex].id, "turn-into");

  assert.deepEqual(prevented, ["ArrowRight", "ArrowRight", "ArrowLeft", "End", "Home", "End", "End", "ArrowLeft"]);
});

test("Tiptap block action menu keyboard path reaches code language submenu items", () => {
  const { editor } = createEditor();
  const documentRef = createDocument();
  const controller = createTiptapBlockActionMenuController({
    dom: { document: documentRef },
  });
  const prevented = [];
  const event = (key) => ({
    key,
    preventDefault() {
      prevented.push(key);
    },
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  controller.open(createCodeBlockTarget());

  controller.setSelection(controller.state.commands.findIndex((command) => command.id === "code-language"));

  assert.equal(controller.handleKeyDown(event("ArrowRight")), true);
  assert.equal(controller.state.commands[controller.state.selectedIndex].id, "code-language-auto");
  assert.equal(
    findCommandItem(documentRef.body.children[0], "code-language-auto").classList.values.has("active"),
    true,
  );

  assert.equal(controller.handleKeyDown(event("End")), true);
  assert.equal(controller.state.commands[controller.state.selectedIndex].id, "code-language-toml");
  assert.equal(controller.handleKeyDown(event("ArrowLeft")), true);
  assert.equal(controller.state.commands[controller.state.selectedIndex].id, "code-language");
  assert.deepEqual(prevented, ["ArrowRight", "End", "ArrowLeft"]);
});

test("Tiptap block action menu closes on Escape", () => {
  const { editor } = createEditor();
  const view = createViewSpy();
  const controller = createTiptapBlockActionMenuController({ view });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  controller.open(createTarget());

  assert.equal(controller.handleKeyDown({ key: "Escape", preventDefault() {} }), true);

  assert.equal(controller.state.open, false);
  assert.deepEqual(view.calls.at(-1), ["hide"]);
});

test("Tiptap block action menu closes on outside pointer events", () => {
  const { editor } = createEditor();
  const view = createViewSpy();
  const documentRef = createDismissDocument();
  const controller = createTiptapBlockActionMenuController({
    dom: { document: documentRef },
    view,
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  controller.open(createTarget());

  documentRef.emit("pointerup", { target: { id: "outside" } });

  assert.equal(controller.state.open, false);
  assert.deepEqual(view.calls.at(-1), ["hide"]);
});

test("Tiptap block action menu stays open for the selected block bridge", () => {
  const { editor } = createEditor();
  const view = createViewSpy();
  const documentRef = createDismissDocument();
  const controller = createTiptapBlockActionMenuController({
    dom: { document: documentRef },
    view,
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  controller.open(createTarget());

  documentRef.emit("pointerup", { target: { id: "target-block-child" } });

  assert.equal(controller.state.open, true);
  assert.notDeepEqual(view.calls.at(-1), ["hide"]);
});

test("Tiptap block action menu treats registered external targets as internal", () => {
  const { editor } = createEditor();
  const view = createViewSpy();
  const documentRef = createDismissDocument();
  const safeTarget = { id: "safe-handle" };
  const controller = createTiptapBlockActionMenuController({
    dom: { document: documentRef },
    view,
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  controller.setExternalContains((target) => target === safeTarget);
  controller.open(createTarget());

  documentRef.emit("pointerup", { target: safeTarget });

  assert.equal(controller.state.open, true);
  assert.notDeepEqual(view.calls.at(-1), ["hide"]);
});

test("Tiptap block action menu survives editor focus races until focus leaves the surface", () => {
  const { editor } = createEditor();
  const view = createViewSpy();
  const documentRef = createDismissDocument();
  const editorDom = {
    contains: (target) => target === editorDom,
  };
  editor.view = { dom: editorDom };
  const controller = createTiptapBlockActionMenuController({
    dom: { document: documentRef },
    view,
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  controller.open(createTarget());

  documentRef.emit("focusin", { type: "focusin", target: editorDom });
  assert.equal(controller.state.open, true);

  documentRef.emit("focusin", { type: "focusin", target: { id: "outside-focus" } });
  assert.equal(controller.state.open, false);
  assert.deepEqual(view.calls.at(-1), ["hide"]);
});

test("Tiptap block action menu survives editor scroll races", () => {
  const { editor } = createEditor();
  const view = createViewSpy();
  const documentRef = createDismissDocument();
  const editorDom = {
    contains: (target) => target === editorDom,
  };
  editor.view = { dom: editorDom };
  const controller = createTiptapBlockActionMenuController({
    dom: { document: documentRef },
    view,
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  controller.open(createTarget());

  documentRef.emit("scroll", { type: "scroll", target: editorDom });

  assert.equal(controller.state.open, true);
  assert.notDeepEqual(view.calls.at(-1), ["hide"]);

  documentRef.emit("scroll", { type: "scroll", target: { id: "outside-scroll" } });
  assert.equal(controller.state.open, false);
  assert.deepEqual(view.calls.at(-1), ["hide"]);
});
