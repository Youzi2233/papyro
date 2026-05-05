import test from "node:test";
import assert from "node:assert/strict";

import {
  TABLE_COMMANDS,
  createTiptapTableToolbarController,
  selectTableAxis,
} from "../src/tiptap-table-toolbar.js";

function createTableHarness(commandOverrides = {}) {
  const calls = [];
  const cells = [];
  const rows = Array.from({ length: 2 }, (_, rowIndex) => {
    const rowCells = Array.from({ length: 3 }, (_, columnIndex) => {
      const cell = {
        nodeType: 1,
        tagName: "TD",
        rowIndex,
        columnIndex,
        parentElement: null,
        attributes: new Map(),
        classes: new Set(),
        style: {},
        classList: {
          add(name) {
            cell.classes.add(name);
          },
          remove(name) {
            cell.classes.delete(name);
          },
          toggle(name, enabled) {
            if (enabled) {
              cell.classes.add(name);
            } else {
              cell.classes.delete(name);
            }
          },
          contains(name) {
            return cell.classes.has(name);
          },
        },
        closest(selector) {
          return selector.includes("table") ? table : null;
        },
        getAttribute(name) {
          return this.attributes.get(name) ?? null;
        },
        setAttribute(name, value) {
          this.attributes.set(name, value);
        },
        getBoundingClientRect: () => ({
          left: 120 + columnIndex * 80,
          top: 90 + rowIndex * 34,
          width: 80,
          height: 34,
          right: 200 + columnIndex * 80,
          bottom: 124 + rowIndex * 34,
        }),
      };
      cells.push(cell);
      return cell;
    });
    return {
      cells: rowCells,
      getBoundingClientRect: () => ({
        left: 120,
        top: 90 + rowIndex * 34,
        width: 240,
        height: 34,
        right: 360,
        bottom: 124 + rowIndex * 34,
      }),
      querySelectorAll(selector) {
        return selector === "th,td" ? rowCells : [];
      },
    };
  });
  const table = {
    className: "mn-tiptap-table",
    contains: (target) => target === table || cells.includes(target),
    getBoundingClientRect: () => ({ left: 120, top: 90, right: 360, bottom: 158 }),
    querySelectorAll(selector) {
      if (selector === "tr") return rows;
      if (selector === ".mn-tiptap-table-cell-selected") {
        return cells.filter((cell) => cell.classes.has("mn-tiptap-table-cell-selected"));
      }
      return [];
    },
    ownerDocument: {
      documentElement: {
        clientWidth: 1000,
        clientHeight: 800,
      },
    },
  };
  rows.forEach((row) =>
    row.cells.forEach((cell) => {
      cell.parentElement = row;
    }),
  );
  const cell = cells[0];
  const root = {
    contains: (target) => target === table || cells.includes(target),
    listeners: new Map(),
    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (this.listeners.get(type) === listener) {
        this.listeners.delete(type);
      }
    },
  };
  const editor = {
    state: {
      selection: {
        from: 4,
      },
    },
    view: {
      dom: root,
      domAtPos() {
        return { node: cell };
      },
      posAtDOM(target) {
        return cells.indexOf(target) + 10;
      },
    },
    commands: {
      focus: () => calls.push(["focus"]),
      setCellSelection(selection) {
        calls.push(["setCellSelection", selection.anchorCell, selection.headCell]);
        const positionedCells = cells.map((item, index) => ({ cell: item, pos: index + 10 }));
        const anchor = positionedCells.find((item) => item.pos === selection.anchorCell);
        const head = positionedCells.find((item) => item.pos === selection.headCell);
        const minRow = Math.min(anchor?.cell?.rowIndex ?? 0, head?.cell?.rowIndex ?? 0);
        const maxRow = Math.max(anchor?.cell?.rowIndex ?? 0, head?.cell?.rowIndex ?? 0);
        const minColumn = Math.min(anchor?.cell?.columnIndex ?? 0, head?.cell?.columnIndex ?? 0);
        const maxColumn = Math.max(anchor?.cell?.columnIndex ?? 0, head?.cell?.columnIndex ?? 0);
        editor.state.selection = {
          from: 4,
          $anchorCell: { pos: selection.anchorCell },
          $headCell: { pos: selection.headCell },
          forEachCell(callback) {
            positionedCells
              .filter((item) =>
                item.cell.rowIndex >= minRow &&
                item.cell.rowIndex <= maxRow &&
                item.cell.columnIndex >= minColumn &&
                item.cell.columnIndex <= maxColumn,
              )
              .forEach((item) => callback(item.cell, item.pos));
          },
        };
        return true;
      },
      ...commandOverrides,
    },
  };

  return { calls, cells, editor, table };
}

function toolbarCommandIds(created) {
  const root = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-toolbar"),
  );
  const walk = (element) => [
    ...(element?.dataset?.commandId ? [element.dataset.commandId] : []),
    ...(element?.children ?? []).flatMap(walk),
  ];
  return walk(root).filter(Boolean);
}

function toolbarCommandButton(created, commandId) {
  const root = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-toolbar"),
  );
  const find = (element) => {
    if (element?.dataset?.commandId === commandId) return element;
    for (const child of element?.children ?? []) {
      const found = find(child);
      if (found) return found;
    }
    return null;
  };
  return find(root);
}

function commandSpy(calls, name, result = true) {
  return () => {
    calls.push([name]);
    return result;
  };
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
      calls.push(["update", state.commands.map((command) => [command.group, command.id])]);
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

function createDocument() {
  const created = [];
  const documentRef = {
    activeElement: null,
    createElement(tagName) {
      const element = {
        tagName,
        children: [],
        className: "",
        dataset: {},
        hidden: false,
        style: {},
        classList: {
          toggle(name, enabled) {
            element.hidden = enabled && name === "hidden";
          },
        },
        appendChild(child) {
          this.children.push(child);
        },
        append(...children) {
          this.children.push(...children);
        },
        replaceChildren(...children) {
          this.children = children;
        },
        setAttribute(name, value) {
          this[name] = value;
        },
        addEventListener(name, handler) {
          this[`on${name}`] = handler;
        },
        contains(target) {
          return target === this || this.children.some((child) => child.contains?.(target));
        },
        focus() {
          documentRef.activeElement = this;
          this.focused = true;
        },
        remove() {
          this.removed = true;
        },
      };
      created.push(element);
      return element;
    },
    body: {
      children: [],
      appendChild(child) {
        this.children.push(child);
      },
    },
  };

  return { created, documentRef };
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

test("Tiptap table toolbar opens when the selection is inside a table", () => {
  const { calls, editor } = createTableHarness();
  editor.commands.addColumnBefore = commandSpy(calls, "addColumnBefore");
  editor.commands.deleteTable = commandSpy(calls, "deleteTable");
  const view = createViewSpy();
  const controller = createTiptapTableToolbarController({ view });
  controller.attach({ editor, root: { className: "runtime" }, entry: { viewMode: "hybrid" } });

  assert.equal(controller.state.open, true);
  assert.deepEqual(controller.state.commands.map((command) => command.id), [
    "add-column-before",
    "delete-table",
  ]);
  assert.deepEqual(view.calls, [
    ["mount", "runtime"],
    [
      "update",
      [
        ["Columns", "add-column-before"],
        ["Table", "delete-table"],
      ],
    ],
  ]);
});

test("Tiptap table toolbar runs table commands and restores focus", () => {
  const { calls, editor } = createTableHarness();
  editor.commands.deleteTable = commandSpy(calls, "deleteTable");
  const view = createViewSpy();
  const controller = createTiptapTableToolbarController({ view });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  assert.equal(controller.run("delete-table"), true);

  assert.deepEqual(calls, [["deleteTable"], ["focus"]]);
});

test("Tiptap table toolbar command buttons run from pointerdown", () => {
  const { created, documentRef } = createDocument();
  const { calls, editor } = createTableHarness();
  editor.commands.deleteTable = commandSpy(calls, "deleteTable");
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  controller.handleKeyDown({
    key: "F10",
    shiftKey: true,
    preventDefault() {},
    stopPropagation() {},
  });
  const button = created.find((element) => element.dataset.commandId === "delete-table");
  const events = [];

  button.onpointerdown({
    preventDefault() {
      events.push("preventDefault");
    },
    stopPropagation() {
      events.push("stopPropagation");
    },
  });

  assert.deepEqual(events, ["preventDefault", "stopPropagation"]);
  assert.deepEqual(calls, [["deleteTable"], ["focus"]]);
});

test("Tiptap table toolbar disables commands rejected by editor.can", () => {
  const { created, documentRef } = createDocument();
  const { calls, editor } = createTableHarness();
  editor.commands.addRowAfter = commandSpy(calls, "addRowAfter");
  editor.commands.setCellAttribute = commandSpy(calls, "setCellAttribute");
  editor.can = () => ({
    addRowAfter: () => false,
    setCellAttribute: () => false,
  });
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  const trigger = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-cell-menu-trigger"),
  );
  trigger.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.deepEqual(
    controller.state.commands.map((command) => [command.id, command.disabled]),
    [
      ["add-row-after", true],
      ["align-left", true],
      ["align-center", true],
      ["align-right", true],
      ["cell-bg-clear", true],
      ["cell-bg-yellow", true],
      ["cell-bg-blue", true],
      ["cell-bg-green", true],
    ],
  );

  const alignButton = toolbarCommandButton(created, "align-center");
  assert.equal(alignButton.disabled, true);
  assert.equal(alignButton.dataset.disabled, "true");
  assert.equal(alignButton["aria-disabled"], "true");
  alignButton.onpointerdown({ preventDefault() {}, stopPropagation() {} });
  assert.equal(controller.run("align-center"), false);

  const rowButton = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-add-row"),
  );
  assert.equal(rowButton.disabled, true);
  assert.equal(rowButton.dataset.disabled, "true");
  rowButton.onpointerdown({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(calls, []);
});

test("Tiptap table toolbar stays closed outside Hybrid mode", () => {
  const { editor } = createTableHarness();
  const view = createViewSpy();
  const controller = createTiptapTableToolbarController({ view });
  controller.attach({ editor, root: {}, entry: { viewMode: "preview" } });

  assert.equal(controller.state.open, false);
  assert.deepEqual(view.calls, [["mount", ""]]);
});

test("Tiptap table toolbar exposes grouped enterprise table commands", () => {
  assert.deepEqual(
    TABLE_COMMANDS.map((command) => [command.group, command.id, command.command]),
    [
      ["Columns", "add-column-before", "addColumnBefore"],
      ["Columns", "add-column-after", "addColumnAfter"],
      ["Columns", "delete-column", "deleteColumn"],
      ["Rows", "add-row-before", "addRowBefore"],
      ["Rows", "add-row-after", "addRowAfter"],
      ["Rows", "delete-row", "deleteRow"],
      ["Cells", "merge-cells", "mergeCells"],
      ["Cells", "split-cell", "splitCell"],
      ["Cells", "merge-or-split", "mergeOrSplit"],
      ["Headers", "toggle-header-row", "toggleHeaderRow"],
      ["Headers", "toggle-header-column", "toggleHeaderColumn"],
      ["Headers", "toggle-header-cell", "toggleHeaderCell"],
      ["Align", "align-left", "setCellAttribute"],
      ["Align", "align-center", "setCellAttribute"],
      ["Align", "align-right", "setCellAttribute"],
      ["Cell color", "cell-bg-clear", "setCellAttribute"],
      ["Cell color", "cell-bg-yellow", "setCellAttribute"],
      ["Cell color", "cell-bg-blue", "setCellAttribute"],
      ["Cell color", "cell-bg-green", "setCellAttribute"],
      ["Navigate", "previous-cell", "goToPreviousCell"],
      ["Navigate", "next-cell", "goToNextCell"],
      ["Table", "fix-table", "fixTables"],
      ["Table", "delete-table", "deleteTable"],
    ],
  );
  assert.deepEqual(
    TABLE_COMMANDS
      .filter((command) => command.variant)
      .map((command) => [command.id, command.variant, command.icon]),
    [
      ["align-left", "icon", "align-left"],
      ["align-center", "icon", "align-center"],
      ["align-right", "icon", "align-right"],
      ["cell-bg-clear", "swatch", "color-clear"],
      ["cell-bg-yellow", "swatch", "color-yellow"],
      ["cell-bg-blue", "swatch", "color-blue"],
      ["cell-bg-green", "swatch", "color-green"],
    ],
  );
});

test("Tiptap table toolbar sets cell alignment attributes", () => {
  const { calls, editor } = createTableHarness();
  editor.commands.setCellAttribute = (name, value) => {
    calls.push(["setCellAttribute", name, value]);
    return true;
  };
  const view = createViewSpy();
  const controller = createTiptapTableToolbarController({ view });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  assert.deepEqual(controller.state.commands.map((command) => command.id), [
    "align-left",
    "align-center",
    "align-right",
    "cell-bg-clear",
    "cell-bg-yellow",
    "cell-bg-blue",
    "cell-bg-green",
  ]);
  assert.equal(controller.run("align-left"), true);
  assert.equal(controller.run("align-center"), true);
  assert.equal(controller.run("align-right"), true);

  assert.deepEqual(calls, [
    ["setCellAttribute", "align", null],
    ["focus"],
    ["setCellAttribute", "align", "center"],
    ["focus"],
    ["setCellAttribute", "align", "right"],
    ["focus"],
  ]);
});

test("Tiptap table toolbar normalizes active cell alignment states", () => {
  const { editor } = createTableHarness();
  const activeCell = editor.view.domAtPos().node;
  editor.view.domAtPos = () => ({ node: activeCell });
  editor.commands.setCellAttribute = () => true;
  const view = createViewSpy();
  const controller = createTiptapTableToolbarController({ view });

  activeCell.style.textAlign = "left";
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  assert.deepEqual(
    controller.state.commands.map((command) => [command.id, command.active]),
    [
      ["align-left", true],
      ["align-center", false],
      ["align-right", false],
      ["cell-bg-clear", true],
      ["cell-bg-yellow", false],
      ["cell-bg-blue", false],
      ["cell-bg-green", false],
    ],
  );

  activeCell.style.textAlign = "";
  activeCell.setAttribute("align", "right");
  controller.refresh(editor);
  assert.deepEqual(
    controller.state.commands.map((command) => [command.id, command.active]),
    [
      ["align-left", false],
      ["align-center", false],
      ["align-right", true],
      ["cell-bg-clear", true],
      ["cell-bg-yellow", false],
      ["cell-bg-blue", false],
      ["cell-bg-green", false],
    ],
  );
});

test("Tiptap table toolbar sets cell background attributes", () => {
  const { calls, editor } = createTableHarness();
  editor.commands.setCellAttribute = (name, value) => {
    calls.push(["setCellAttribute", name, value]);
    return true;
  };
  const view = createViewSpy();
  const controller = createTiptapTableToolbarController({ view });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  assert.equal(controller.run("cell-bg-yellow"), true);
  assert.equal(controller.run("cell-bg-clear"), true);

  assert.deepEqual(calls, [
    ["setCellAttribute", "backgroundColor", "rgba(245, 158, 11, 0.16)"],
    ["focus"],
    ["setCellAttribute", "backgroundColor", null],
    ["focus"],
  ]);
});

test("Tiptap table toolbar marks active cell background commands", () => {
  const { created, documentRef } = createDocument();
  const { editor } = createTableHarness();
  const activeCell = editor.view.domAtPos().node;
  editor.view.domAtPos = () => ({ node: activeCell });
  activeCell.setAttribute(
    "data-cell-background",
    "rgba(245, 158, 11, 0.16)",
  );
  editor.commands.setCellAttribute = () => true;
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  const trigger = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-cell-menu-trigger"),
  );
  trigger.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  const yellow = created.find((element) => element.dataset.commandId === "cell-bg-yellow");
  const blue = created.find((element) => element.dataset.commandId === "cell-bg-blue");
  assert.equal(yellow.dataset.active, "true");
  assert.equal(blue.dataset.active, "false");
  assert.equal(yellow.dataset.variant, "swatch");
  assert.equal(yellow.children[0]?.dataset?.icon, "color-yellow");
});

test("Tiptap table toolbar renders alignment commands as icon buttons", () => {
  const { created, documentRef } = createDocument();
  const { editor } = createTableHarness();
  editor.commands.setCellAttribute = () => true;
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  const trigger = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-cell-menu-trigger"),
  );
  trigger.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  const alignCenter = created.find((element) => element.dataset.commandId === "align-center");
  assert.equal(alignCenter.dataset.variant, "icon");
  assert.equal(alignCenter.dataset.icon, "align-center");
  assert.equal(alignCenter.children[0]?.dataset?.icon, "align-center");
  assert.equal(alignCenter.children.length, 1);
});

test("Tiptap table toolbar runs navigation and repair commands when available", () => {
  const { calls, editor } = createTableHarness();
  editor.commands.goToNextCell = commandSpy(calls, "goToNextCell");
  editor.commands.fixTables = commandSpy(calls, "fixTables");
  const view = createViewSpy();
  const controller = createTiptapTableToolbarController({ view });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  assert.deepEqual(controller.state.commands.map((command) => command.id), [
    "next-cell",
    "fix-table",
  ]);
  assert.equal(controller.run("next-cell"), true);
  assert.equal(controller.run("fix-table"), true);

  assert.deepEqual(calls, [
    ["goToNextCell"],
    ["focus"],
    ["fixTables"],
    ["focus"],
  ]);
});

test("Tiptap table toolbar quick add buttons run row and column insertion", () => {
  const { created, documentRef } = createDocument();
  const { calls, editor } = createTableHarness();
  editor.commands.addRowAfter = commandSpy(calls, "addRowAfter");
  editor.commands.addColumnAfter = commandSpy(calls, "addColumnAfter");
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  const rowButton = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-add-row"),
  );
  const columnButton = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-add-column"),
  );

  assert.equal(rowButton.textContent ?? "", "");
  assert.equal(columnButton.textContent ?? "", "");
  assert.equal(rowButton.style.left, "219px");
  assert.equal(rowButton.style.top, "164px");
  assert.equal(columnButton.style.left, "366px");
  assert.equal(columnButton.style.top, "103px");

  rowButton.onpointerdown({ preventDefault() {}, stopPropagation() {} });
  columnButton.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.deepEqual(calls, [
    ["addRowAfter"],
    ["focus"],
    ["addColumnAfter"],
    ["focus"],
  ]);
});

test("Tiptap table toolbar controls fall back to click events", () => {
  const { created, documentRef } = createDocument();
  const { calls, editor } = createTableHarness();
  editor.commands.addRowAfter = commandSpy(calls, "addRowAfter");
  editor.commands.addColumnAfter = commandSpy(calls, "addColumnAfter");
  editor.commands.setCellAttribute = (name, value) => {
    calls.push(["setCellAttribute", name, value]);
    return true;
  };
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  const rowButton = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-add-row"),
  );
  const columnButton = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-add-column"),
  );
  const trigger = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-cell-menu-trigger"),
  );

  rowButton.onclick({ preventDefault() {}, stopPropagation() {} });
  columnButton.onclick({ preventDefault() {}, stopPropagation() {} });
  trigger.onclick({ preventDefault() {}, stopPropagation() {} });
  const alignButton = toolbarCommandButton(created, "align-center");
  alignButton.onclick({ preventDefault() {}, stopPropagation() {} });

  assert.deepEqual(calls, [
    ["addRowAfter"],
    ["focus"],
    ["addColumnAfter"],
    ["focus"],
    ["setCellAttribute", "align", "center"],
    ["focus"],
  ]);
});

test("Tiptap table toolbar pointer and click fallback do not double-run", () => {
  const { created, documentRef } = createDocument();
  const { calls, editor } = createTableHarness();
  editor.commands.addRowAfter = commandSpy(calls, "addRowAfter");
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  const rowButton = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-add-row"),
  );

  rowButton.onpointerdown({ preventDefault() {}, stopPropagation() {} });
  rowButton.onclick({ preventDefault() {}, stopPropagation() {} });

  assert.deepEqual(calls, [["addRowAfter"], ["focus"]]);
});

test("Tiptap table toolbar keeps complex command chrome hidden until requested", () => {
  const { created, documentRef } = createDocument();
  const { editor } = createTableHarness();
  editor.commands.addRowAfter = () => true;
  editor.commands.mergeCells = () => true;
  editor.commands.setCellAttribute = () => true;
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  const root = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-toolbar"),
  );
  const trigger = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-cell-menu-trigger"),
  );
  assert.equal(root.hidden, true);
  assert.equal(trigger.hidden, false);
  assert.equal(created.some((element) => element.dataset.commandId === "merge-cells"), false);

  trigger.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.equal(root.hidden, false);
  assert.equal(controller.state.menuOpen, true);
  assert.deepEqual(
    root.children[0].children
      .flatMap((element) => element.children ?? [])
      .filter((element) => element.dataset.commandId)
      .map((element) => element.dataset.commandId),
    [
      "align-left",
      "align-center",
      "align-right",
      "cell-bg-clear",
      "cell-bg-yellow",
      "cell-bg-blue",
      "cell-bg-green",
    ],
  );
});

test("Tiptap table toolbar supports keyboard navigation and execution", () => {
  const { created, documentRef } = createDocument();
  const { calls, editor } = createTableHarness();
  editor.commands.addColumnBefore = commandSpy(calls, "addColumnBefore");
  editor.commands.deleteColumn = commandSpy(calls, "deleteColumn");
  editor.commands.deleteTable = commandSpy(calls, "deleteTable");
  editor.can = () => ({
    addColumnBefore: () => true,
    deleteColumn: () => false,
    deleteTable: () => true,
  });
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  const events = [];
  const keyboardEvent = (key, extra = {}) => ({
    key,
    ...extra,
    preventDefault() {
      events.push(["preventDefault", key]);
    },
    stopPropagation() {
      events.push(["stopPropagation", key]);
    },
  });

  assert.equal(
    controller.handleKeyDown(keyboardEvent("F10", { shiftKey: true })),
    true,
  );
  assert.equal(controller.state.activeCommandId, "add-column-before");
  assert.equal(documentRef.activeElement?.dataset?.commandId, "add-column-before");

  assert.equal(controller.handleKeyDown(keyboardEvent("ArrowRight")), true);
  assert.equal(controller.state.activeCommandId, "delete-table");
  assert.equal(documentRef.activeElement?.dataset?.commandId, "delete-table");

  assert.equal(controller.handleKeyDown(keyboardEvent("Enter")), true);
  assert.deepEqual(calls, [["deleteTable"], ["focus"]]);
  assert.equal(documentRef.activeElement?.dataset?.commandId, "delete-table");

  const disabled = created.find((element) => element.dataset.commandId === "delete-column");
  assert.equal(disabled.tabIndex, -1);
  assert.equal(disabled.dataset.keyboardActive, "false");
});

test("Tiptap table toolbar handles keyboard events after focus enters the toolbar", () => {
  const { created, documentRef } = createDocument();
  const { editor } = createTableHarness();
  editor.commands.addColumnBefore = () => true;
  editor.commands.deleteTable = () => true;
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  controller.handleKeyDown({
    key: "F10",
    shiftKey: true,
    preventDefault() {},
    stopPropagation() {},
  });

  const root = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-toolbar"),
  );
  const prevented = [];
  root.onkeydown({
    key: "End",
    target: root,
    preventDefault() {
      prevented.push("default");
    },
    stopPropagation() {
      prevented.push("propagation");
    },
  });

  assert.equal(controller.state.activeCommandId, "delete-table");
  assert.deepEqual(prevented, ["default", "propagation"]);
});

test("Tiptap table toolbar closes from keyboard Escape", () => {
  const { editor } = createTableHarness();
  editor.commands.deleteTable = () => true;
  const view = createViewSpy();
  const controller = createTiptapTableToolbarController({ view });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  assert.equal(
    controller.handleKeyDown({
      key: "Escape",
      preventDefault() {},
      stopPropagation() {},
    }),
    true,
  );

  assert.equal(controller.state.open, false);
  assert.deepEqual(view.calls.at(-1), ["hide"]);
});

test("Tiptap table toolbar activation refreshes a closed table context", () => {
  const { editor } = createTableHarness();
  editor.commands.deleteTable = () => true;
  const view = createViewSpy();
  const controller = createTiptapTableToolbarController({ view });
  controller.attach({ editor, root: {}, entry: { viewMode: "preview" } });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  controller.close();

  assert.equal(
    controller.handleKeyDown({
      key: "F10",
      shiftKey: true,
      preventDefault() {},
      stopPropagation() {},
    }),
    true,
  );

  assert.equal(controller.state.open, true);
  assert.equal(controller.state.activeCommandId, "delete-table");
});

test("Tiptap table toolbar axis handles select tables rows and columns", () => {
  const { created, documentRef } = createDocument();
  const { calls, editor } = createTableHarness();
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  const tableHandle = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-axis-handle table"),
  );
  const rowHandle = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-axis-handle row"),
  );
  const columnHandle = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-axis-handle column"),
  );

  tableHandle.onpointerdown({ preventDefault() {}, stopPropagation() {} });
  rowHandle.onpointerdown({ preventDefault() {}, stopPropagation() {} });
  columnHandle.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.deepEqual(calls, [
    ["setCellSelection", 10, 15],
    ["focus"],
    ["setCellSelection", 10, 12],
    ["focus"],
    ["setCellSelection", 10, 13],
    ["focus"],
  ]);
});

test("Tiptap table toolbar reflects selected rows columns and cells in chrome", () => {
  const { cells, created, documentRef, editor } = (() => {
    const { created, documentRef } = createDocument();
    const harness = createTableHarness();
    return { ...harness, created, documentRef };
  })();
  editor.commands.mergeCells = () => true;
  editor.state.selection = {
    from: 4,
    $anchorCell: { pos: 10 },
    $headCell: { pos: 12 },
    forEachCell(callback) {
      [10, 11, 12].forEach((pos) => callback({}, pos));
    },
  };
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  const root = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-toolbar"),
  );
  const rowHandles = created.filter((element) =>
    String(element.className).includes("mn-tiptap-table-axis-handle row"),
  );
  const columnHandles = created.filter((element) =>
    String(element.className).includes("mn-tiptap-table-axis-handle column"),
  );
  assert.equal(root.dataset.selectionKind, "row");
  assert.equal(rowHandles[0].dataset.active, "true");
  assert.equal(rowHandles[1].dataset.active, "false");
  assert.deepEqual(columnHandles.map((handle) => handle.dataset.active), [
    "false",
    "false",
    "false",
  ]);
  assert.deepEqual(
    cells.map((cell) => cell.classes.has("mn-tiptap-table-cell-selected")),
    [true, true, true, false, false, false],
  );

  controller.close();
  assert.equal(cells.some((cell) => cell.classes.has("mn-tiptap-table-cell-selected")), false);
});

test("Tiptap table toolbar positions the cell menu trigger inside the selected cell", () => {
  const { created, documentRef } = createDocument();
  const { editor } = createTableHarness();
  editor.commands.mergeCells = () => true;
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  const trigger = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-cell-menu-trigger"),
  );
  assert.equal(trigger.style.left, "149px");
  assert.equal(trigger.style.top, "96px");
  assert.equal(trigger.textContent ?? "", "");
});

test("Tiptap table toolbar anchors multi-cell actions to the head cell", () => {
  const { created, documentRef } = createDocument();
  const { editor } = createTableHarness();
  editor.commands.mergeCells = () => true;
  editor.commands.setCellAttribute = () => true;
  editor.state.selection = {
    from: 4,
    $anchorCell: { pos: 10 },
    $headCell: { pos: 11 },
    forEachCell(callback) {
      [10, 11].forEach((pos) => callback({}, pos));
    },
  };
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  const trigger = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-cell-menu-trigger"),
  );
  const root = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-toolbar"),
  );
  assert.equal(controller.state.selection.kind, "cells");
  assert.equal(trigger.style.left, "229px");
  assert.equal(trigger.style.top, "96px");

  trigger.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.equal(root.hidden, false);
  assert.equal(root.style.left, "125px");
  assert.equal(root.style.top, "132px");
});

test("Tiptap table toolbar scopes context commands to row and column selections", () => {
  const { created, documentRef } = createDocument();
  const { editor } = createTableHarness({
    addRowBefore: () => true,
    addRowAfter: () => true,
    deleteRow: () => true,
    toggleHeaderRow: () => true,
    addColumnBefore: () => true,
    addColumnAfter: () => true,
    deleteColumn: () => true,
    toggleHeaderColumn: () => true,
    mergeCells: () => true,
    splitCell: () => true,
    setCellAttribute: () => true,
  });
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  const rowHandle = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-axis-handle row"),
  );
  rowHandle.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.equal(controller.state.selection.kind, "row");
  assert.equal(controller.state.menuOpen, true);
  assert.deepEqual(
    controller.state.commands
      .filter((command) => !command.disabled)
      .map((command) => command.id)
      .filter((id) => ["add-row-before", "add-row-after", "delete-row", "toggle-header-row", "merge-cells"].includes(id)),
    ["add-row-before", "add-row-after", "delete-row", "merge-cells", "toggle-header-row"],
  );
  assert.deepEqual(
    created
      .filter((element) => element.dataset.commandId)
      .map((element) => element.dataset.commandId)
      .filter((id) => ["add-row-before", "add-row-after", "delete-row", "toggle-header-row", "merge-cells"].includes(id)),
    ["add-row-after", "add-row-before", "toggle-header-row", "delete-row"],
  );

  const columnHandle = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-axis-handle column") && !element.removed,
  );
  columnHandle.onpointerdown({ preventDefault() {}, stopPropagation() {} });
  assert.equal(controller.state.selection.kind, "column");
  assert.equal(controller.state.menuOpen, true);
  assert.deepEqual(
    created
      .filter((element) => element.dataset.commandId && !element.removed)
      .map((element) => element.dataset.commandId)
      .filter((id) => ["add-column-before", "add-column-after", "delete-column", "toggle-header-column", "merge-cells"].includes(id)),
    ["add-column-after", "add-column-before", "toggle-header-column", "delete-column"],
  );
});

test("Tiptap table toolbar keeps cell and axis context menus focused", () => {
  const { created, documentRef } = createDocument();
  const { editor } = createTableHarness({
    addRowBefore: () => true,
    addRowAfter: () => true,
    deleteRow: () => true,
    toggleHeaderRow: () => true,
    addColumnBefore: () => true,
    addColumnAfter: () => true,
    deleteColumn: () => true,
    toggleHeaderColumn: () => true,
    mergeCells: () => true,
    splitCell: () => true,
    setCellAttribute: () => true,
    fixTables: () => true,
    deleteTable: () => true,
  });
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  const trigger = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-cell-menu-trigger"),
  );
  trigger.onpointerdown({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(toolbarCommandIds(created), [
    "align-left",
    "align-center",
    "align-right",
    "cell-bg-clear",
    "cell-bg-yellow",
    "cell-bg-blue",
    "cell-bg-green",
  ]);

  const rowHandle = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-axis-handle row") && !element.removed,
  );
  rowHandle.onpointerdown({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(toolbarCommandIds(created).filter((id) => id.includes("row")), [
    "add-row-after",
    "add-row-before",
    "toggle-header-row",
    "delete-row",
  ]);
  assert.equal(toolbarCommandIds(created).includes("cell-bg-yellow"), false);

  const tableHandle = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-axis-handle table") && !element.removed,
  );
  tableHandle.onpointerdown({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(toolbarCommandIds(created), [
    "toggle-header-row",
    "toggle-header-column",
    "delete-table",
  ]);
});

test("Tiptap table toolbar anchors row and column menus to the active selection", () => {
  const { created, documentRef } = createDocument();
  const { editor } = createTableHarness({
    addRowBefore: () => true,
    addRowAfter: () => true,
    deleteRow: () => true,
    addColumnBefore: () => true,
    addColumnAfter: () => true,
    deleteColumn: () => true,
  });
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  const rowHandle = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-axis-handle row"),
  );
  rowHandle.onpointerdown({ preventDefault() {}, stopPropagation() {} });
  const root = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-toolbar"),
  );
  const trigger = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-cell-menu-trigger"),
  );
  const backdrop = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-selection-backdrop"),
  );

  assert.equal(controller.state.selection.kind, "row");
  assert.equal(root.hidden, false);
  assert.equal(root.style.top, "132px");
  assert.equal(trigger.style.left, "349px");
  assert.equal(trigger.style.top, "96px");
  assert.equal(backdrop.hidden, false);
  assert.equal(backdrop.style.left, "120px");
  assert.equal(backdrop.style.width, "240px");
  assert.equal(backdrop.style.height, "34px");

  const columnHandle = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-axis-handle column") && !element.removed,
  );
  columnHandle.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.equal(controller.state.selection.kind, "column");
  assert.equal(root.style.top, "166px");
  assert.equal(trigger.style.left, "189px");
  assert.equal(trigger.style.top, "147px");
  assert.equal(backdrop.style.left, "120px");
  assert.equal(backdrop.style.width, "80px");
  assert.equal(backdrop.style.height, "68px");
});

test("Tiptap table toolbar opens table selection menus from the centered trigger", () => {
  const { created, documentRef } = createDocument();
  const { editor } = createTableHarness({
    toggleHeaderRow: () => true,
    toggleHeaderColumn: () => true,
    deleteTable: () => true,
  });
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  const tableHandle = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-axis-handle table"),
  );
  tableHandle.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.equal(controller.state.selection.kind, "table");
  assert.equal(controller.state.menuOpen, true);
  assert.deepEqual(
    created
      .filter((element) => element.dataset.commandId && !element.removed)
      .map((element) => element.dataset.commandId),
    [
      "toggle-header-row",
      "toggle-header-column",
      "delete-table",
    ],
  );
});

test("Tiptap table toolbar replaces native context menus inside table cells", () => {
  const { created, documentRef } = createDocument();
  const { calls, cells, editor } = createTableHarness({
    mergeCells: () => true,
    setCellAttribute: () => true,
  });
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });
  const events = [];
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  assert.equal(
    editor.view.dom.listeners.get("contextmenu")({
      target: cells[1],
      preventDefault() {
        events.push("preventDefault");
      },
      stopPropagation() {
        events.push("stopPropagation");
      },
    }),
    true,
  );

  const root = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-toolbar"),
  );
  assert.deepEqual(events, ["preventDefault", "stopPropagation"]);
  assert.deepEqual(calls.slice(0, 2), [
    ["setCellSelection", 11, 11],
    ["focus"],
  ]);
  assert.equal(controller.state.menuOpen, true);
  assert.equal(root.hidden, false);
  assert.equal(root.dataset.selectionKind, "cell");

  controller.destroy();
  assert.equal(editor.view.dom.listeners.size, 0);
});

test("selectTableAxis rejects missing table selection commands", () => {
  assert.equal(selectTableAxis({ commands: {} }, [], "row", 0), false);
  const selected = [];
  assert.equal(
    selectTableAxis(
      {
        commands: {
          setCellSelection(selection) {
            selected.push(selection);
            return true;
          },
          focus() {},
        },
      },
      [
        { cells: [{ pos: 3 }, { pos: 4 }] },
        { cells: [{ pos: 8 }, { pos: 9 }] },
      ],
      "table",
      0,
    ),
    true,
  );
  assert.deepEqual(selected, [{ anchorCell: 3, headCell: 9 }]);
  assert.equal(
    selectTableAxis(
      {
        commands: {
          setCellSelection: () => false,
        },
      },
      [{ cells: [{ pos: 1 }] }],
      "row",
      0,
    ),
    false,
  );
});

test("Tiptap table toolbar closes on outside pointer events", () => {
  const { editor } = createTableHarness();
  editor.commands.deleteTable = () => true;
  const view = createViewSpy();
  const documentRef = createDismissDocument();
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
    view,
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  documentRef.emit("pointerdown", { target: { id: "outside" } });

  assert.equal(controller.state.open, false);
  assert.deepEqual(view.calls.at(-1), ["hide"]);
});

test("Tiptap table toolbar stays open for pointer events inside the active table", () => {
  const { editor, table } = createTableHarness();
  editor.commands.deleteTable = () => true;
  const view = createViewSpy();
  const documentRef = createDismissDocument();
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
    view,
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  documentRef.emit("pointerdown", { target: table });

  assert.equal(controller.state.open, true);
  assert.notDeepEqual(view.calls.at(-1), ["hide"]);
});
