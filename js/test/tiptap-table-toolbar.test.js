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
        rowIndex,
        columnIndex,
        parentElement: null,
        closest(selector) {
          return selector.includes("table") ? table : null;
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
      ["Navigate", "previous-cell", "goToPreviousCell"],
      ["Navigate", "next-cell", "goToNextCell"],
      ["Table", "fix-table", "fixTables"],
      ["Table", "delete-table", "deleteTable"],
    ],
  );
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

test("Tiptap table toolbar axis handles select rows and columns", () => {
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
  const { calls, editor } = createTableHarness();
  editor.commands.setCellSelection = (selection) => {
    calls.push(["setCellSelection", selection.anchorCell, selection.headCell]);
    return true;
  };
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  const rowHandle = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-axis-handle row"),
  );
  const columnHandle = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-axis-handle column"),
  );

  rowHandle.onpointerdown({ preventDefault() {}, stopPropagation() {} });
  columnHandle.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.deepEqual(calls, [
    ["setCellSelection", 10, 12],
    ["focus"],
    ["setCellSelection", 10, 13],
    ["focus"],
  ]);
});

test("selectTableAxis rejects missing table selection commands", () => {
  assert.equal(selectTableAxis({ commands: {} }, [], "row", 0), false);
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
