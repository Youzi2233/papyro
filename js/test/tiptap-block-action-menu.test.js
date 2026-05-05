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
      addEventListener() {},
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

test("Tiptap block action menu opens for Hybrid block targets", () => {
  const { editor } = createEditor();
  const view = createViewSpy();
  const controller = createTiptapBlockActionMenuController({ view });
  controller.attach({ editor, root: { className: "root" }, entry: { viewMode: "hybrid" } });

  controller.open(createTarget());

  assert.equal(controller.state.open, true);
  assert.deepEqual(
    controller.state.commands.map((command) => command.id),
    [
      "insert-before",
      "insert-after",
      "paragraph",
      "heading-1",
      "heading-2",
      "heading-3",
      "bullet-list",
      "ordered-list",
      "task-list",
      "blockquote",
      "callout",
      "text-color-ink",
      "text-color-muted",
      "text-color-accent",
      "text-color-danger",
      "highlight-clear",
      "highlight-yellow",
      "highlight-blue",
      "highlight-green",
      "table",
      "math-block",
      "code-block",
      "mermaid",
      "divider",
      "image",
      "copy-block",
      "duplicate-block",
      "delete",
    ],
  );
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

test("Tiptap block action menu runs the selected command", () => {
  const { calls, editor } = createEditor();
  const view = createViewSpy();
  const controller = createTiptapBlockActionMenuController({ view });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  controller.open(createTarget());
  controller.moveSelection(2);

  assert.equal(controller.handleKeyDown({ key: "Enter", preventDefault() {} }), true);

  assert.equal(controller.state.open, false);
  assert.deepEqual(calls, [
    ["focus", 4],
    ["setParagraph"],
    ["focus", null],
  ]);
  assert.deepEqual(view.calls.at(-1), ["hide"]);
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
  const list = menu.children[0];
  assert.deepEqual(
    list.children.map((section) => section.children[0].textContent),
    [
      "Insert",
      "Text",
      "Lists",
      "Blocks",
      "Color",
      "Highlight",
      "Advanced",
      "Actions",
      "Danger",
    ],
  );
  assert.equal(list.children[0].children[1].dataset.commandId, "insert-before");
  assert.equal(list.children[6].children[1].dataset.commandId, "table");
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
  const list = menu.children[0];
  assert.deepEqual(
    list.children.map((section) => section.children[0].textContent),
    [
      "Insert",
      "Text",
      "Lists",
      "Blocks",
      "Callout",
      "Color",
      "Highlight",
      "Advanced",
      "Actions",
      "Danger",
    ],
  );
  assert.deepEqual(
    list.children[4].children.slice(1).map((item) => item.dataset.commandId),
    [
      "callout-kind-note",
      "callout-kind-tip",
      "callout-kind-warning",
      "callout-kind-danger",
    ],
  );
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

  documentRef.emit("pointerdown", { target: { id: "outside" } });

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

  documentRef.emit("pointerdown", { target: { id: "target-block-child" } });

  assert.equal(controller.state.open, true);
  assert.notDeepEqual(view.calls.at(-1), ["hide"]);
});
