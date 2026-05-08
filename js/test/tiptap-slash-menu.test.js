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
      toggleCodeBlock: (attrs = null) => {
        calls.push(["toggleCodeBlock", attrs?.language ?? null]);
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
        state.cleanupRangeOnClose ?? false,
        state.anchorRect
          ? {
              left: state.anchorRect.left,
              top: state.anchorRect.top,
              bottom: state.anchorRect.bottom,
            }
          : null,
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
      style: {
        properties: new Map(),
        setProperty(name, value) {
          this.properties.set(name, value);
        },
      },
      classList: {
        values: new Set(),
        toggle(name, enabled) {
          if (enabled) this.values.add(name);
          else this.values.delete(name);
        },
      },
      append(...children) {
        children.forEach((child) => this.appendChild(child));
      },
      appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
        child.parentElement = this;
        return child;
      },
      addEventListener(name, handler) {
        this[`on${name}`] = handler;
      },
      replaceChildren(...children) {
        this.children = children;
      },
      querySelectorAll(selector) {
        const results = [];
        const source = String(selector);
        if (source.startsWith(".")) {
          const className = source.slice(1);
          walk(this, (child) => {
            if (String(child.className ?? "").split(/\s+/).includes(className)) {
              results.push(child);
            }
          });
          return results;
        }
        const commandIndex = /^\[data-command-index="(\d+)"\]$/u.exec(source)?.[1];
        if (commandIndex) {
          walk(this, (child) => {
            if (child.dataset?.commandIndex === commandIndex) {
              results.push(child);
            }
          });
          return results;
        }
        return results;
      },
      querySelector(selector) {
        return this.querySelectorAll(selector)[0] ?? null;
      },
      getAttribute(name) {
        return this[name];
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

function slashMenuCommandItem(root, commandId = null) {
  const walk = (element) => {
    if (!element) return null;
    if (element.dataset?.commandId && (!commandId || element.dataset.commandId === commandId)) {
      return element;
    }
    for (const child of element.children ?? []) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };
  return walk(root);
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
      false,
      null,
    ],
  ]);
});

test("Tiptap slash menu keyboard selection clamps through command results", () => {
  const { editor } = createEditor("/标题");
  const view = createViewSpy();
  const controller = createTiptapSlashMenuController({ view });
  controller.attach({ editor, root: {} });

  controller.moveSelection(1);
  assert.equal(controller.state.selectedIndex, 1);
  controller.moveSelection(-1);
  assert.equal(controller.state.selectedIndex, 0);
  controller.moveSelection(-1);
  assert.equal(controller.state.selectedIndex, 0);
});

test("Tiptap slash menu keyboard selection can reach table without wrapping", () => {
  const { editor } = createEditor("/");
  const view = createViewSpy();
  const controller = createTiptapSlashMenuController({ view });
  controller.attach({ editor, root: {} });

  while (controller.state.commands[controller.state.selectedIndex]?.id !== "table") {
    controller.moveSelection(1);
  }

  assert.equal(controller.state.commands[controller.state.selectedIndex].id, "table");
  assert.deepEqual(
    controller.state.commands.map((command) => command.id),
    [
      "paragraph",
      "heading-1",
      "heading-2",
      "heading-3",
      "bullet-list",
      "ordered-list",
      "task-list",
      "blockquote",
      "callout",
      "code-block",
      "divider",
      "table",
      "image",
      "math-block",
      "mermaid",
    ],
  );
  while (controller.state.selectedIndex < controller.state.commands.length - 1) {
    controller.moveSelection(1);
  }
  assert.equal(controller.state.commands.at(-1).id, "mermaid");
  controller.moveSelection(1);
  assert.equal(controller.state.commands[controller.state.selectedIndex].id, "mermaid");
});

test("Tiptap slash menu renders command icons for block insertion", () => {
  const { editor } = createEditor("/table");
  const documentRef = createDocument();
  const controller = createTiptapSlashMenuController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {} });

  const menu = documentRef.body.children[0];
  const list = findElementByClass(menu, "mn-tiptap-slash-menu-list");
  const firstSection = list.children[0];
  const firstItem = firstSection.children[1];
  const icon = firstItem.children[0];
  const copy = firstItem.children[1];
  assert.equal(String(firstSection.className).includes("mn-tiptap-slash-menu-section"), true);
  assert.equal(firstSection.children[0].textContent, "Data");
  assert.equal(firstItem.dataset.commandId, "table");
  assert.equal(firstItem.dataset.group, "Data");
  assert.equal(icon.dataset.icon, "table");
  assert.equal(icon.dataset.iconSource, "fallback");
  assert.equal(icon.dataset.commandGroup ?? icon.dataset["command-group"], "data");
  assert.equal(String(icon.className).includes("mn-tiptap-slash-menu-icon table"), true);
  assert.equal(copy.children[0].textContent, "Table");
});

test("Tiptap slash menu Home and End jump across the full command list", () => {
  const { editor } = createEditor("/");
  const view = createViewSpy();
  const controller = createTiptapSlashMenuController({ view });
  controller.attach({ editor, root: {} });

  assert.equal(controller.handleKeyDown({ key: "End", preventDefault() {} }), true);
  assert.equal(controller.state.commands[controller.state.selectedIndex].id, "mermaid");
  assert.equal(controller.handleKeyDown({ key: "Home", preventDefault() {} }), true);
  assert.equal(controller.state.commands[controller.state.selectedIndex].id, "paragraph");
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

test("Tiptap slash menu anchors side panels beside the active command row", () => {
  const { editor } = createEditor("/");
  const documentRef = createDocument();
  const controller = createTiptapSlashMenuController({
    dom: { document: documentRef },
    maxItems: 12,
  });
  controller.attach({ editor, root: {} });

  const menu = documentRef.body.children[0];
  menu.getBoundingClientRect = () => ({
    left: 100,
    top: 40,
    right: 284,
    bottom: 400,
    width: 184,
    height: 360,
  });
  slashMenuCommandItem(menu, "table").getBoundingClientRect = () => ({
    left: 106,
    top: 252,
    right: 276,
    bottom: 280,
    width: 170,
    height: 28,
  });

  controller.setSelection(
    controller.state.commands.findIndex((command) => command.id === "table"),
  );

  assert.equal(menu.style.properties.get("--mn-slash-side-panel-top") ?? menu.style["--mn-slash-side-panel-top"], "166px");
});

test("Tiptap slash menu activates command details on pointer hover", () => {
  const { editor } = createEditor("/");
  const documentRef = createDocument();
  const controller = createTiptapSlashMenuController({
    dom: { document: documentRef },
  });
  controller.attach({ editor, root: {} });

  const menu = documentRef.body.children[0];
  const paragraphItem = slashMenuCommandItem(menu, "paragraph");
  const tableItem = slashMenuCommandItem(menu, "table");
  const codeBlockItem = slashMenuCommandItem(menu, "code-block");
  const tablePicker = findElementByClass(menu, "mn-tiptap-table-size-picker");
  const tablePickerHeader = findElementByClass(menu, "mn-tiptap-table-size-picker-header");
  const tablePickerTitle = findElementByClass(menu, "mn-tiptap-table-size-picker-title");
  const tablePickerLabel = findElementByClass(menu, "mn-tiptap-table-size-picker-label");
  const tablePickerGridShell = findElementByClass(menu, "mn-tiptap-table-size-picker-grid-shell");
  const codeLanguagePicker = findElementByClass(menu, "mn-tiptap-code-language-picker");
  assert.equal(tablePicker.hidden, true);
  assert.equal(codeLanguagePicker.hidden, true);
  const initialScrollCount = documentRef.scrollCalls.length;

  tableItem.onpointerenter?.({ preventDefault() {}, stopPropagation() {} });
  assert.equal(controller.state.commands[controller.state.selectedIndex].id, "table");
  assert.equal(slashMenuCommandItem(menu, "paragraph"), paragraphItem);
  assert.equal(slashMenuCommandItem(menu, "table"), tableItem);
  assert.equal(documentRef.scrollCalls.length, initialScrollCount);
  assert.equal(tablePicker.hidden, false);
  assert.equal(slashMenuCommandItem(menu, "table")["aria-selected"], "true");
  assert.equal(slashMenuCommandItem(menu, "table")["aria-haspopup"], "menu");
  assert.equal(slashMenuCommandItem(menu, "table")["aria-expanded"], "true");
  assert.equal(slashMenuCommandItem(menu, "table")["aria-controls"], "mn-tiptap-slash-menu-table-panel");
  assert.equal(slashMenuCommandItem(menu, "table").dataset.sidePanel, "table");
  assert.equal(tablePicker.id, "mn-tiptap-slash-menu-table-panel");
  assert.equal(tablePicker.role, "menu");
  assert.equal(String(tablePicker["aria-label"]).includes("3 x 2"), true);
  assert.equal(tablePickerTitle.parentNode, tablePickerHeader);
  assert.equal(tablePickerLabel.parentNode, tablePickerHeader);
  assert.equal(tablePickerLabel.textContent, tablePicker["aria-label"]);
  assert.equal(
    tablePickerGridShell.children[0].className,
    "mn-tiptap-table-size-picker-grid",
  );

  codeBlockItem.onpointerenter?.({ preventDefault() {}, stopPropagation() {} });
  assert.equal(controller.state.commands[controller.state.selectedIndex].id, "code-block");
  assert.equal(codeLanguagePicker.hidden, false);
  assert.equal(slashMenuCommandItem(menu, "code-block")["aria-haspopup"], "menu");
  assert.equal(slashMenuCommandItem(menu, "code-block")["aria-expanded"], "true");
  assert.equal(
    slashMenuCommandItem(menu, "code-block")["aria-controls"],
    "mn-tiptap-slash-menu-code-language-panel",
  );
  assert.equal(slashMenuCommandItem(menu, "code-block").dataset.sidePanel, "code-language");
  assert.equal(codeLanguagePicker.id, "mn-tiptap-slash-menu-code-language-panel");
  assert.equal(codeLanguagePicker.role, "menu");

  assert.equal(slashMenuCommandItem(menu, "paragraph")["aria-selected"], "false");
  assert.equal(slashMenuCommandItem(menu, "paragraph")["aria-haspopup"], undefined);
  assert.equal(slashMenuCommandItem(menu, "paragraph")["aria-controls"], undefined);
  assert.equal(slashMenuCommandItem(menu, "paragraph").dataset.sidePanel, "none");

  slashMenuCommandItem(menu, "paragraph").onfocus?.({ preventDefault() {}, stopPropagation() {} });
  assert.equal(controller.state.selectedIndex, 0);
  assert.equal(documentRef.scrollCalls.length, initialScrollCount + 1);
  assert.equal(tablePicker.hidden, true);
  assert.equal(codeLanguagePicker.hidden, true);
  assert.equal(slashMenuCommandItem(menu, "paragraph")["aria-selected"], "true");
  assert.equal(slashMenuCommandItem(menu, "table")["aria-selected"], "false");
  assert.equal(slashMenuCommandItem(menu, "table")["aria-expanded"], "false");
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

test("Tiptap slash menu renders recently used commands before the full insert list", () => {
  const { editor } = createEditor("/table");
  const documentRef = createDocument();
  const controller = createTiptapSlashMenuController({
    dom: { document: documentRef },
  });
  controller.attach({ editor, root: {} });

  assert.equal(controller.choose("table"), true);
  editor.state.doc = createDoc("/");
  editor.state.selection = {
    empty: true,
    from: 1,
    $from: {
      start: () => 0,
    },
  };

  controller.refresh(editor);

  assert.equal(controller.state.open, true);
  assert.deepEqual(
    controller.state.commands.slice(0, 3).map((command) => ({
      id: command.id,
      index: command.index,
      sourceIndex: command.sourceIndex,
      recent: command.recent,
    })),
    [
      { id: "table", index: 0, sourceIndex: 11, recent: true },
      { id: "paragraph", index: 1, sourceIndex: 0, recent: false },
      { id: "heading-1", index: 2, sourceIndex: 1, recent: false },
    ],
  );

  const menu = documentRef.body.children[0];
  const list = findElementByClass(menu, "mn-tiptap-slash-menu-list");
  const recentSection = list.children[0];
  const recentItem = slashMenuCommandItem(menu, "table");

  assert.equal(recentSection["aria-label"], "Recent");
  assert.equal(recentItem.dataset.recent, "true");
  assert.equal(recentItem.dataset.commandIndex, "0");
  assert.equal(recentItem.id, "mn-tiptap-slash-menu-item-0");

  controller.moveSelection(1);

  assert.equal(slashMenuCommandItem(menu, "paragraph")["aria-selected"], "true");
  assert.deepEqual(documentRef.scrollCalls.at(-1), [
    "mn-tiptap-slash-menu-item-1",
    { block: "nearest", inline: "nearest" },
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

test("Tiptap slash menu falls back to the block edge when inserted caret coords are at the window origin", () => {
  const { editor } = createEditor("plain");
  editor.view.coordsAtPos = () => ({ left: 0, right: 0, top: 0, bottom: 0 });
  const view = createViewSpy();
  const controller = createTiptapSlashMenuController({ view });
  controller.attach({ editor, root: {} });

  controller.openAtBlock({
    block: {
      getBoundingClientRect: () => ({
        left: 96,
        top: 44,
        right: 420,
        bottom: 78,
        width: 324,
        height: 34,
      }),
    },
    pos: 3,
    node: {
      nodeSize: 5,
    },
  });

  assert.equal(controller.state.open, true);
  assert.deepEqual(view.calls.at(-1).at(-1), { left: 96, top: 78, bottom: 78 });
});

test("Tiptap slash insert menu keeps block insertion state across selection refreshes", () => {
  const { editor } = createEditor("plain");
  const view = createViewSpy();
  const controller = createTiptapSlashMenuController({ view });
  controller.attach({ editor, root: {} });

  controller.openAtBlock({
    block: {
      getBoundingClientRect: () => ({
        left: 96,
        top: 44,
        right: 420,
        bottom: 78,
        width: 324,
        height: 34,
      }),
    },
    pos: 3,
    node: {
      nodeSize: 5,
    },
  });
  const anchor = controller.state.anchorRect;
  editor.state.doc = createDoc("plain\n/");
  editor.state.selection = {
    empty: true,
    from: 10,
    $from: {
      start: () => 9,
    },
  };

  controller.refresh(editor);

  assert.equal(controller.state.open, true);
  assert.equal(controller.state.query, "");
  assert.deepEqual(controller.state.range, { from: 9, to: 10 });
  assert.equal(controller.state.cleanupRangeOnClose, true);
  assert.equal(controller.state.anchorRect, anchor);
  assert.deepEqual(view.calls.at(-1).slice(0, 6), [
    "update",
    "",
    controller.state.commands.map((command) => command.id),
    0,
    { from: 9, to: 10 },
    true,
  ]);
});

test("Tiptap slash insert menu keeps hovered command details across refreshes", () => {
  const { editor } = createEditor("plain");
  const documentRef = createDocument();
  const controller = createTiptapSlashMenuController({
    dom: { document: documentRef },
  });
  controller.attach({ editor, root: {} });

  controller.openAtBlock({
    block: {
      getBoundingClientRect: () => ({
        left: 96,
        top: 44,
        right: 420,
        bottom: 78,
        width: 324,
        height: 34,
      }),
    },
    pos: 3,
    node: {
      nodeSize: 5,
    },
  });
  const menu = documentRef.body.children[0];
  slashMenuCommandItem(menu, "table").onpointerenter?.({
    preventDefault() {},
    stopPropagation() {},
  });
  editor.state.doc = createDoc("plain\n/");
  editor.state.selection = {
    empty: true,
    from: 10,
    $from: {
      start: () => 9,
    },
  };

  controller.refresh(editor);

  assert.equal(controller.state.commands[controller.state.selectedIndex].id, "table");
  assert.equal(
    findElementByClass(documentRef.body.children[0], "mn-tiptap-table-size-picker").hidden,
    false,
  );
});

test("Tiptap slash menu removes temporary block insert triggers on cancel", () => {
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
  controller.close();

  assert.equal(controller.state.open, false);
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
  ]);
  assert.equal(view.calls.at(-1)[0], "hide");
});

test("Tiptap slash menu keeps typed slash triggers when cancelled", () => {
  const { calls, editor } = createEditor("/table");
  const view = createViewSpy();
  const controller = createTiptapSlashMenuController({ view });
  controller.attach({ editor, root: {} });

  controller.close();

  assert.equal(controller.state.open, false);
  assert.deepEqual(calls, []);
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

test("Tiptap slash menu command items support click fallback without double-run", () => {
  const { calls, editor } = createEditor("/h2");
  const documentRef = createDocument();
  const controller = createTiptapSlashMenuController({
    dom: { document: documentRef },
  });
  controller.attach({ editor, root: {} });
  const item = slashMenuCommandItem(documentRef.body.children[0]);
  const events = [];
  const event = () => ({
    preventDefault() {
      events.push("preventDefault");
    },
    stopPropagation() {
      events.push("stopPropagation");
    },
  });

  item.onclick(event());

  assert.deepEqual(calls.slice(-3), [
    ["deleteRange", 0, 3],
    ["toggleHeading", 2],
    ["focus"],
  ]);
  assert.equal(controller.state.open, false);

  calls.length = 0;
  const second = createTiptapSlashMenuController({
    dom: { document: documentRef },
  });
  const fresh = createEditor("/h2");
  second.attach({ editor: fresh.editor, root: {} });
  const freshItem = slashMenuCommandItem(documentRef.body.children[1]);
  freshItem.onpointerdown(event());
  freshItem.onclick(event());

  assert.deepEqual(fresh.calls.slice(-3), [
    ["deleteRange", 0, 3],
    ["toggleHeading", 2],
    ["focus"],
  ]);
});

test("Tiptap slash table picker supports click fallback without double-run", () => {
  const { calls, editor } = createEditor("/table");
  const documentRef = createDocument();
  const controller = createTiptapSlashMenuController({
    dom: { document: documentRef },
  });
  controller.attach({ editor, root: {} });
  const cells = documentRef.body.children[0].querySelectorAll(".mn-tiptap-table-size-picker-cell");
  const target = cells.find((cell) => cell.dataset.row === "4" && cell.dataset.col === "3");
  const event = () => ({ preventDefault() {}, stopPropagation() {} });

  target.onpointerenter?.(event());
  assert.equal(
    findElementByClass(documentRef.body.children[0], "mn-tiptap-table-size-picker-label").textContent,
    "Table 4 x 3",
  );
  target.onclick(event());

  assert.deepEqual(calls.slice(-3), [
    ["deleteRange", 0, 6],
    ["insertTable", 4, 3, true],
    ["focus"],
  ]);

  const fresh = createEditor("/table");
  const second = createTiptapSlashMenuController({
    dom: { document: documentRef },
  });
  second.attach({ editor: fresh.editor, root: {} });
  const freshTarget = documentRef.body.children[1]
    .querySelectorAll(".mn-tiptap-table-size-picker-cell")
    .find((cell) => cell.dataset.row === "4" && cell.dataset.col === "3");
  freshTarget.onpointerdown(event());
  freshTarget.onclick(event());

  assert.deepEqual(fresh.calls.slice(-3), [
    ["deleteRange", 0, 6],
    ["insertTable", 4, 3, true],
    ["focus"],
  ]);
});

test("Tiptap slash code language picker supports click fallback without double-run", () => {
  const { calls, editor } = createEditor("/code");
  const documentRef = createDocument();
  const controller = createTiptapSlashMenuController({
    dom: { document: documentRef },
  });
  controller.attach({ editor, root: {} });
  const picker = findElementByClass(documentRef.body.children[0], "mn-tiptap-code-language-picker");
  const rust = picker
    .querySelectorAll(".mn-tiptap-code-language-option")
    .find((option) => option.dataset.languageId === "rust");
  const event = () => ({ preventDefault() {}, stopPropagation() {} });

  rust.onclick(event());

  assert.deepEqual(calls.slice(-3), [
    ["deleteRange", 0, 5],
    ["toggleCodeBlock", "rust"],
    ["focus"],
  ]);

  const fresh = createEditor("/code");
  const second = createTiptapSlashMenuController({
    dom: { document: documentRef },
  });
  second.attach({ editor: fresh.editor, root: {} });
  const freshRust = documentRef.body.children[1]
    .querySelectorAll(".mn-tiptap-code-language-option")
    .find((option) => option.dataset.languageId === "rust");
  freshRust.onpointerdown(event());
  freshRust.onclick(event());

  assert.deepEqual(fresh.calls.slice(-3), [
    ["deleteRange", 0, 5],
    ["toggleCodeBlock", "rust"],
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

test("Tiptap slash menu localizes callout kind picker choices", () => {
  const { editor } = createEditor("/callout");
  const documentRef = createDocument();
  const controller = createTiptapSlashMenuController({
    dom: { document: documentRef },
  });

  controller.attach({
    editor,
    root: {},
    entry: { preferences: { language: "Chinese" } },
  });

  const option = documentRef.body.children[0].querySelector(".mn-tiptap-callout-kind-option");
  assert.equal(option["aria-label"], "插入备注标注");
  assert.equal(option.querySelector(".mn-tiptap-callout-kind-title").textContent, "备注");
  assert.equal(
    option.querySelector(".mn-tiptap-callout-kind-description").textContent,
    "普通补充信息",
  );
});

test("Tiptap slash menu localizes code language picker choices", () => {
  const { editor } = createEditor("/code");
  const documentRef = createDocument();
  const controller = createTiptapSlashMenuController({
    dom: { document: documentRef },
  });

  controller.attach({
    editor,
    root: {},
    entry: { preferences: { language: "Chinese" } },
  });

  const picker = findElementByClass(documentRef.body.children[0], "mn-tiptap-code-language-picker");
  const auto = picker
    .querySelectorAll(".mn-tiptap-code-language-option")
    .find((option) => option.dataset.languageId === "auto");
  const plaintext = picker
    .querySelectorAll(".mn-tiptap-code-language-option")
    .find((option) => option.dataset.languageId === "plaintext");

  assert.equal(auto.querySelector(".mn-tiptap-code-language-option-title").textContent, auto["aria-label"]);
  assert.equal(
    plaintext.querySelector(".mn-tiptap-code-language-option-title").textContent,
    plaintext["aria-label"],
  );
  assert.notEqual(plaintext["aria-label"], "Plain text");
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

  documentRef.emit("pointerup", { target: { id: "outside" } });

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

  documentRef.emit("pointerup", { target: inside });

  assert.equal(controller.state.open, true);
  assert.notDeepEqual(view.calls.at(-1), ["hide"]);
});

test("Tiptap slash menu treats registered external targets as internal", () => {
  const { editor } = createEditor("/table");
  const view = createViewSpy();
  const documentRef = createDismissDocument();
  const safeTarget = { id: "safe-handle" };
  const controller = createTiptapSlashMenuController({
    dom: { document: documentRef },
    view,
  });
  controller.attach({ editor, root: {} });
  controller.setExternalContains((target) => target === safeTarget);

  documentRef.emit("pointerup", { target: safeTarget });

  assert.equal(controller.state.open, true);
  assert.notDeepEqual(view.calls.at(-1), ["hide"]);
});

test("Tiptap slash menu ignores editor focus races but still closes on outside focus", () => {
  const { editor } = createEditor("/table");
  const view = createViewSpy();
  const documentRef = createDismissDocument();
  controllerAttachEditorDocument(editor, documentRef);
  const controller = createTiptapSlashMenuController({
    dom: { document: documentRef },
    view,
  });
  controller.attach({ editor, root: {} });

  documentRef.emit("focusin", { type: "focusin", target: editor.view.dom });
  assert.equal(controller.state.open, true);

  documentRef.emit("focusin", { type: "focusin", target: { id: "outside-focus" } });
  assert.equal(controller.state.open, false);
  assert.deepEqual(view.calls.at(-1), ["hide"]);
});

test("Tiptap block insert slash menu survives editor scroll races", () => {
  const { editor } = createEditor("plain");
  const view = createViewSpy();
  const documentRef = createDismissDocument();
  controllerAttachEditorDocument(editor, documentRef);
  const controller = createTiptapSlashMenuController({
    dom: { document: documentRef },
    view,
  });
  controller.attach({ editor, root: {} });
  controller.openAtBlock({
    block: {
      getBoundingClientRect: () => ({
        left: 96,
        top: 44,
        right: 420,
        bottom: 78,
        width: 324,
        height: 34,
      }),
    },
    pos: 3,
    node: {
      nodeSize: 5,
    },
  });

  documentRef.emit("scroll", { type: "scroll", target: editor.view.dom });

  assert.equal(controller.state.open, true);
  assert.notDeepEqual(view.calls.at(-1), ["hide"]);

  documentRef.emit("scroll", { type: "scroll", target: { id: "outside-scroll" } });
  assert.equal(controller.state.open, false);
  assert.deepEqual(view.calls.at(-1), ["hide"]);
});

function controllerAttachEditorDocument(editor, documentRef) {
  editor.view.dom.contains = (target) => target === editor.view.dom;
  editor.view.dom.ownerDocument = documentRef;
}

test("Tiptap slash menu keeps editor blur stable while a command panel is open", () => {
  const { editor } = createEditor("/table");
  const view = createViewSpy();
  const safeTarget = { id: "safe-handle" };
  const documentRef = { body: { id: "document-body" } };
  const controller = createTiptapSlashMenuController({ dom: { document: documentRef }, view });
  controller.attach({ editor, root: {} });

  assert.equal(controller.shouldKeepOpenOnEditorBlur(null), true);
  assert.equal(controller.shouldKeepOpenOnEditorBlur(documentRef.body), true);
  assert.equal(controller.shouldKeepOpenOnEditorBlur({ id: "outside" }), false);

  view.setContainedTarget(safeTarget);
  assert.equal(controller.shouldKeepOpenOnEditorBlur(safeTarget), true);

  controller.setExternalContains((target) => target === safeTarget);
  view.setContainedTarget(null);
  assert.equal(controller.shouldKeepOpenOnEditorBlur(safeTarget), true);
});
