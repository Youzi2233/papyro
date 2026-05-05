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
        style: {},
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
      return selector === "tr" ? rows : [];
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
      ...commandOverrides,
    },
  };

  return { calls, editor, table };
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
          return target === this;
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

  const yellow = created.find((element) => element.dataset.commandId === "cell-bg-yellow");
  const blue = created.find((element) => element.dataset.commandId === "cell-bg-blue");
  assert.equal(yellow.dataset.active, "true");
  assert.equal(blue.dataset.active, "false");
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

  rowButton.onpointerdown({ preventDefault() {}, stopPropagation() {} });
  columnButton.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.deepEqual(calls, [
    ["addRowAfter"],
    ["focus"],
    ["addColumnAfter"],
    ["focus"],
  ]);
});

test("Tiptap table toolbar axis handles select tables rows and columns", () => {
  const { created, documentRef } = createDocument();
  const { calls, editor } = createTableHarness();
  editor.commands.setCellSelection = (selection) => {
    calls.push(["setCellSelection", selection.anchorCell, selection.headCell]);
    return true;
  };
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
