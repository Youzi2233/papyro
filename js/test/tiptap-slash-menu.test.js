import test from "node:test";
import assert from "node:assert/strict";

import {
  createTiptapSlashMenuController,
  findSlashTrigger,
} from "../src/tiptap-slash-menu.js";

function createDoc(text) {
  return {
    textBetween(from, to) {
      return text.slice(from, to);
    },
  };
}

function createEditor(text, cursor = text.length) {
  const calls = [];
  const editor = {
    state: {
      doc: createDoc(text),
      selection: {
        empty: true,
        from: cursor,
        $from: {
          start: () => 0,
        },
      },
    },
    commands: {
      deleteRange: (range) => {
        calls.push(["deleteRange", range.from, range.to]);
        return true;
      },
      focus: () => {
        calls.push(["focus"]);
        return true;
      },
      setTextSelection: (pos) => {
        calls.push(["setTextSelection", pos]);
        return true;
      },
      insertContentAt: (pos, content, options) => {
        calls.push(["insertContentAt", pos, content, options]);
        return true;
      },
      insertContent: (content, options) => {
        calls.push(["insertContent", content, options.contentType]);
        return true;
      },
      insertTable: (attrs) => {
        calls.push(["insertTable", attrs.rows, attrs.cols, attrs.withHeaderRow]);
        return true;
      },
      setCalloutBlock: (attrs) => {
        calls.push(["setCalloutBlock", attrs.kind, attrs.text]);
        return true;
      },
      setParagraph: () => {
        calls.push(["setParagraph"]);
        return true;
      },
      toggleHeading: (attrs) => {
        calls.push(["toggleHeading", attrs.level]);
        return true;
      },
    },
    view: {
      coordsAtPos: (pos) => {
        calls.push(["coordsAtPos", pos]);
        return { left: 120, right: 120, top: 40, bottom: 60 };
      },
      dom: {
        ownerDocument: {
          documentElement: {
            clientWidth: 1000,
            clientHeight: 800,
          },
        },
      },
    },
  };

  return { calls, editor };
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
        state.query,
        state.commands.map((command) => command.id),
        state.selectedIndex,
        state.range,
      ]);
      this.choose = state.choose;
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
    const element = {
      tagName: tagName.toUpperCase(),
      children: [],
      className: "",
      dataset: {},
      style: {},
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
      querySelectorAll(selector) {
        const results = [];
        if (!String(selector).startsWith(".")) return results;
        const className = String(selector).slice(1);
        walk(this, (child) => {
          if (String(child.className ?? "").split(/\s+/).includes(className)) {
            results.push(child);
          }
        });
        return results;
      },
      remove() {},
      scrollIntoView(options) {
        scrollCalls.push([this.id, options]);
      },
      setAttribute(name, value) {
        this[name] = value;
      },
    };
    return element;
  }

  return {
    body,
    createElement,
    scrollCalls,
  };
}

test("findSlashTrigger detects slash queries at text boundaries", () => {
  assert.deepEqual(findSlashTrigger("/h2"), { from: 0, to: 3, query: "h2" });
  assert.deepEqual(findSlashTrigger("hello /table"), {
    from: 6,
    to: 12,
    query: "table",
  });
  assert.equal(findSlashTrigger("hello/not-command"), null);
  assert.equal(findSlashTrigger("/too\nlate"), null);
});

test("Tiptap slash menu opens from editor text and ranks commands", () => {
  const { editor } = createEditor("hello /标题");
  const view = createViewSpy();
  const controller = createTiptapSlashMenuController({ view });

  controller.attach({ editor, root: { className: "root" } });

  assert.equal(controller.state.open, true);
  assert.equal(controller.state.query, "标题");
  assert.deepEqual(
    controller.state.commands.slice(0, 3).map((command) => command.id),
    ["heading-1", "heading-2", "heading-3"],
  );
  assert.deepEqual(view.calls, [
    ["mount", "root"],
    [
      "update",
      "标题",
      ["heading-1", "heading-2", "heading-3"],
      0,
      { from: 6, to: 9 },
    ],
  ]);
});

test("Tiptap slash menu keyboard selection wraps through command results", () => {
  const { editor } = createEditor("/标题");
  const view = createViewSpy();
  const controller = createTiptapSlashMenuController({ view });
  controller.attach({ editor, root: {} });

  controller.moveSelection(1);
  assert.equal(controller.state.selectedIndex, 1);
  controller.moveSelection(-1);
  assert.equal(controller.state.selectedIndex, 0);
  controller.moveSelection(-1);
  assert.equal(controller.state.selectedIndex, 2);
});

test("Tiptap slash menu scrolls keyboard selections into view", () => {
  const { editor } = createEditor("/标题");
  const documentRef = createDocument();
  const controller = createTiptapSlashMenuController({
    dom: { document: documentRef },
  });
  controller.attach({ editor, root: {} });

  controller.moveSelection(1);

  assert.deepEqual(documentRef.scrollCalls.at(-1), [
    "mn-tiptap-slash-menu-item-1",
    { block: "nearest", inline: "nearest" },
  ]);
});

test("Tiptap slash menu runs selected command and removes trigger text", () => {
  const { calls, editor } = createEditor("/h2");
  const view = createViewSpy();
  const controller = createTiptapSlashMenuController({ view });
  controller.attach({ editor, root: {} });

  assert.equal(controller.handleKeyDown({ key: "Enter", preventDefault() {} }), true);

  assert.equal(controller.state.open, false);
  assert.deepEqual(calls, [
    ["deleteRange", 0, 3],
    ["toggleHeading", 2],
    ["focus"],
  ]);
});

test("Tiptap slash menu yields keyboard handling during IME composition", () => {
  const { calls, editor } = createEditor("/h2");
  const view = createViewSpy();
  const controller = createTiptapSlashMenuController({ view });
  let prevented = false;
  controller.attach({ editor, root: {} });

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

test("Tiptap slash menu treats keyCode 229 as IME composition", () => {
  const { calls, editor } = createEditor("/table");
  const view = createViewSpy();
  const controller = createTiptapSlashMenuController({ view });
  let prevented = false;
  controller.attach({ editor, root: {} });

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

test("Tiptap slash menu closes on Escape", () => {
  const { editor } = createEditor("/table");
  const view = createViewSpy();
  const controller = createTiptapSlashMenuController({ view });
  let prevented = false;
  controller.attach({ editor, root: {} });

  assert.equal(
    controller.handleKeyDown({
      key: "Escape",
      preventDefault() {
        prevented = true;
      },
    }),
    true,
  );

  assert.equal(prevented, true);
  assert.equal(controller.state.open, false);
  assert.deepEqual(view.calls.at(-1), ["hide"]);
});

test("Tiptap slash menu stays closed without a slash trigger", () => {
  const { editor } = createEditor("plain text");
  const view = createViewSpy();
  const controller = createTiptapSlashMenuController({ view });

  controller.attach({ editor, root: {} });

  assert.equal(controller.state.open, false);
  assert.deepEqual(view.calls, [["mount", ""]]);
});

test("Tiptap slash menu opens as a block insert menu without deleting a trigger", () => {
  const { calls, editor } = createEditor("plain");
  const view = createViewSpy();
  const controller = createTiptapSlashMenuController({ view });
  controller.attach({ editor, root: {} });

  controller.openAtBlock({
    pos: 3,
    node: {
      nodeSize: 5,
    },
  });
  assert.equal(controller.handleKeyDown({ key: "Enter", preventDefault() {} }), true);

  assert.deepEqual(calls, [
    [
      "insertContentAt",
      8,
      { type: "paragraph", content: [{ type: "text", text: "/" }] },
      { updateSelection: true },
    ],
    ["setTextSelection", 10],
    ["focus"],
    ["coordsAtPos", 10],
    ["deleteRange", 9, 10],
    ["setParagraph"],
    ["focus"],
  ]);
});

test("Tiptap slash menu forwards table picker dimensions to the command", () => {
  const { calls, editor } = createEditor("/table");
  const view = createViewSpy();
  const controller = createTiptapSlashMenuController({ view });
  controller.attach({ editor, root: {} });

  assert.equal(controller.choose("table", { tableSize: { rows: 5, cols: 4 } }), true);

  assert.deepEqual(calls, [
    ["deleteRange", 0, 6],
    ["insertTable", 5, 4, true],
    ["focus"],
  ]);
});

test("Tiptap slash menu forwards callout kind choices to the command", () => {
  const { calls, editor } = createEditor("/callout");
  const view = createViewSpy();
  const controller = createTiptapSlashMenuController({ view });
  controller.attach({ editor, root: {} });

  assert.equal(controller.choose("callout", { calloutKind: "warning" }), true);

  assert.deepEqual(calls, [
    ["deleteRange", 0, 8],
    ["setCalloutBlock", "WARNING", "Callout text"],
    ["focus"],
  ]);
});

test("Tiptap slash menu closes on outside pointer events", () => {
  const { editor } = createEditor("/table");
  const view = createViewSpy();
  const documentRef = createDismissDocument();
  const controller = createTiptapSlashMenuController({
    dom: { document: documentRef },
    view,
  });
  controller.attach({ editor, root: {} });

  documentRef.emit("pointerdown", { target: { id: "outside" } });

  assert.equal(controller.state.open, false);
  assert.deepEqual(view.calls.at(-1), ["hide"]);
});

test("Tiptap slash menu stays open for pointer events inside the menu", () => {
  const { editor } = createEditor("/table");
  const view = createViewSpy();
  const inside = { id: "inside" };
  view.setContainedTarget(inside);
  const documentRef = createDismissDocument();
  const controller = createTiptapSlashMenuController({
    dom: { document: documentRef },
    view,
  });
  controller.attach({ editor, root: {} });

  documentRef.emit("pointerdown", { target: inside });

  assert.equal(controller.state.open, true);
  assert.notDeepEqual(view.calls.at(-1), ["hide"]);
});
