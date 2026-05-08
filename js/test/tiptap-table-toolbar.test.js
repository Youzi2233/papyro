import test from "node:test";
import assert from "node:assert/strict";

import {
  createTiptapTableToolbarController,
  selectTableAxis,
} from "../src/tiptap-table-toolbar.js";
import { TABLE_COMMANDS } from "../src/tiptap-table-commands.js";

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
          return selector.includes(".mn-tiptap-table") || selector.includes(", table")
            ? table
            : null;
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
        contains(target) {
          let current = target;
          while (current) {
            if (current === cell) return true;
            current = current.parentElement ?? current.parentNode ?? null;
          }
          return false;
        },
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
    contains(target) {
      if (target === table || cells.includes(target)) return true;
      return cells.some((tableCell) => tableCell.contains?.(target));
    },
    getBoundingClientRect: () => ({ left: 120, top: 90, right: 360, bottom: 158 }),
    querySelectorAll(selector) {
      if (selector === "tr") return rows;
      if (selector === ".mn-tiptap-table-cell-selected") {
        return cells.filter((cell) => cell.classes.has("mn-tiptap-table-cell-selected"));
      }
      if (selector === ".mn-tiptap-table-cell-active") {
        return cells.filter((cell) => cell.classes.has("mn-tiptap-table-cell-active"));
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

function toolbarCommandCopy(element) {
  const copy =
    (element?.children ?? []).find((child) =>
      String(child?.className ?? "").includes("mn-tiptap-table-toolbar-button-copy"),
    ) ?? element?.children?.[1] ?? null;
  const title =
    (copy?.children ?? []).find((child) =>
      String(child?.className ?? "").includes("mn-tiptap-table-toolbar-button-label"),
    )?.textContent ?? copy?.textContent ?? "";
  const description =
    (copy?.children ?? []).find((child) =>
      String(child?.className ?? "").includes("mn-tiptap-table-toolbar-button-description"),
    )?.textContent ?? "";
  return { copy, title, description };
}

function latestAxisHandle(created, axis, index = null) {
  return [...created].reverse().find((element) =>
    String(element.className).includes(`mn-tiptap-table-axis-handle ${axis}`) &&
    (index == null || element.dataset.index === String(index)) &&
    !element.removed,
  );
}

function tableToolbarList(created) {
  const root = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-toolbar"),
  );
  const find = (element) => {
    if (String(element?.className ?? "").includes("mn-tiptap-table-toolbar-list")) {
      return element;
    }
    for (const child of element?.children ?? []) {
      const found = find(child);
      if (found) return found;
    }
    return null;
  };
  return find(root);
}

function tableToolbarHeader(created) {
  const root = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-toolbar"),
  );
  const find = (element, className) => {
    if (String(element?.className ?? "").includes(className)) return element;
    for (const child of element?.children ?? []) {
      const found = find(child, className);
      if (found) return found;
    }
    return null;
  };
  return {
    root,
    header: find(root, "mn-tiptap-table-toolbar-header"),
    eyebrow: find(root, "mn-tiptap-table-toolbar-eyebrow"),
    title: find(root, "mn-tiptap-table-toolbar-title"),
    subtitle: find(root, "mn-tiptap-table-toolbar-subtitle"),
  };
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
  const listeners = new Map();
  const documentRef = {
    activeElement: null,
    listeners,
    createElement(tagName) {
      const element = {
        tagName,
        children: [],
        className: "",
        dataset: {},
        hidden: false,
        style: {
          properties: new Map(),
          setProperty(name, value) {
            this.properties.set(name, value);
          },
        },
        classList: {
          add(name) {
            element.className = `${element.className} ${name}`.trim();
          },
          remove(name) {
            element.className = String(element.className)
              .split(/\s+/)
              .filter((item) => item && item !== name)
              .join(" ");
          },
          toggle(name, enabled) {
            element.hidden = enabled && name === "hidden";
            if (enabled) {
              this.add(name);
            } else {
              this.remove(name);
            }
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
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) {
        listeners.delete(type);
      }
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
  editor.commands.copySelectedTableCells = commandSpy(calls, "copySelectedTableCells");
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
      ["copy-cell-content", false],
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
  assert.deepEqual(calls, [
    ["setCellSelection", 10, 10],
    ["focus"],
  ]);
});

test("Tiptap table toolbar stays closed outside Hybrid mode", () => {
  const { editor, table } = createTableHarness();
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
      ["Arrange", "move-column-left", "moveSelectedTableColumn"],
      ["Arrange", "move-column-right", "moveSelectedTableColumn"],
      ["Arrange", "sort-rows-asc", "sortSelectedTableRows"],
      ["Arrange", "sort-rows-desc", "sortSelectedTableRows"],
      ["Columns", "duplicate-column", "duplicateSelectedTableColumn"],
      ["Rows", "add-row-before", "addRowBefore"],
      ["Rows", "add-row-after", "addRowAfter"],
      ["Rows", "delete-row", "deleteRow"],
      ["Arrange", "move-row-up", "moveSelectedTableRow"],
      ["Arrange", "move-row-down", "moveSelectedTableRow"],
      ["Arrange", "sort-columns-asc", "sortSelectedTableColumns"],
      ["Arrange", "sort-columns-desc", "sortSelectedTableColumns"],
      ["Rows", "duplicate-row", "duplicateSelectedTableRow"],
      ["Cells", "merge-cells", "mergeCells"],
      ["Cells", "split-cell", "splitCell"],
      ["Cells", "copy-cell-content", "copySelectedTableCells"],
      ["Cells", "clear-cell-content", "clearSelectedTableCells"],
      ["Cells", "clear-cell-style", "resetSelectedTableCellAttrs"],
      ["Cells", "merge-or-split", "mergeOrSplit"],
      ["Headers", "toggle-header-row", "toggleHeaderRow"],
      ["Headers", "toggle-header-column", "toggleHeaderColumn"],
      ["Headers", "toggle-header-cell", "toggleHeaderCell"],
      ["Align", "align-left", "setCellAttribute"],
      ["Align", "align-center", "setCellAttribute"],
      ["Align", "align-right", "setCellAttribute"],
      ["Text color", "cell-text-clear", "setSelectedTableCellTextColor"],
      ["Text color", "cell-text-muted", "setSelectedTableCellTextColor"],
      ["Text color", "cell-text-accent", "setSelectedTableCellTextColor"],
      ["Text color", "cell-text-danger", "setSelectedTableCellTextColor"],
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
      ["cell-text-clear", "text-swatch", "text-color-clear"],
      ["cell-text-muted", "text-swatch", "text-color-muted"],
      ["cell-text-accent", "text-swatch", "text-color-accent"],
      ["cell-text-danger", "text-swatch", "text-color-danger"],
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
  editor.commands.copySelectedTableCells = () => {
    calls.push(["copySelectedTableCells"]);
    return true;
  };
  editor.commands.setSelectedTableCellTextColor = (value) => {
    calls.push(["setSelectedTableCellTextColor", value]);
    return true;
  };
  const view = createViewSpy();
  const controller = createTiptapTableToolbarController({ view });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  assert.deepEqual(controller.state.commands.map((command) => command.id), [
    "copy-cell-content",
    "align-left",
    "align-center",
    "align-right",
    "cell-text-clear",
    "cell-text-muted",
    "cell-text-accent",
    "cell-text-danger",
    "cell-bg-clear",
    "cell-bg-yellow",
    "cell-bg-blue",
    "cell-bg-green",
  ]);
  assert.equal(controller.run("align-left"), true);
  assert.equal(controller.run("align-center"), true);
  assert.equal(controller.run("align-right"), true);
  assert.equal(controller.run("cell-text-accent"), true);

  assert.deepEqual(calls, [
    ["setCellAttribute", "align", null],
    ["focus"],
    ["setCellAttribute", "align", "center"],
    ["focus"],
    ["setCellAttribute", "align", "right"],
    ["focus"],
    ["setSelectedTableCellTextColor", "var(--mn-accent)"],
    ["focus"],
  ]);
});

test("Tiptap table toolbar normalizes active cell alignment states", () => {
  const { editor, table } = createTableHarness();
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

test("Tiptap table toolbar clears selected cell content through the official table utility command", () => {
  const { calls, editor } = createTableHarness();
  editor.commands.clearSelectedTableCells = () => {
    calls.push(["clearSelectedTableCells"]);
    return true;
  };
  const view = createViewSpy();
  const controller = createTiptapTableToolbarController({ view });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  assert.equal(controller.run("clear-cell-content"), true);

  assert.deepEqual(calls, [["clearSelectedTableCells"], ["focus"]]);
});

test("Tiptap table toolbar copies selected cell content through the table command", () => {
  const { calls, editor } = createTableHarness();
  editor.commands.copySelectedTableCells = () => {
    calls.push(["copySelectedTableCells"]);
    return true;
  };
  const view = createViewSpy();
  const controller = createTiptapTableToolbarController({ view });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  assert.equal(controller.run("copy-cell-content"), true);

  assert.deepEqual(calls, [["copySelectedTableCells"], ["focus"]]);
});

test("Tiptap table toolbar clears selected cell style attributes", () => {
  const { calls, editor } = createTableHarness();
  editor.commands.resetSelectedTableCellAttrs = () => {
    calls.push(["resetSelectedTableCellAttrs"]);
    return true;
  };
  const view = createViewSpy();
  const controller = createTiptapTableToolbarController({ view });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  assert.equal(controller.run("clear-cell-style"), true);

  assert.deepEqual(calls, [["resetSelectedTableCellAttrs"], ["focus"]]);
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
  const colorGroup = created.find((element) => element.dataset.layoutGroup === "cell-color");
  assert.equal(yellow.dataset.active, "true");
  assert.equal(blue.dataset.active, "false");
  assert.equal(yellow.dataset.variant, "swatch");
  assert.equal(yellow.children[0]?.dataset?.icon, "color-yellow");
  assert.equal(colorGroup.dataset.group, "Cell color");
  assert.equal(colorGroup.dataset.groupKey, "Cell color");
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
  const alignGroup = created.find((element) => element.dataset.layoutGroup === "align");
  assert.equal(alignCenter.dataset.variant, "icon");
  assert.equal(alignCenter.dataset.icon, "align-center");
  assert.equal(alignCenter.children[0]?.dataset?.icon, "align-center");
  assert.equal(alignCenter.children.length, 1);
  assert.equal(alignGroup.dataset.group, "Align");
  assert.equal(alignGroup.dataset.groupKey, "Align");
});

test("Tiptap table toolbar keeps icon and swatch layouts stable in Chinese", () => {
  const { created, documentRef } = createDocument();
  const { editor } = createTableHarness();
  editor.commands.setCellAttribute = () => true;
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({
    editor,
    root: {},
    entry: { viewMode: "hybrid", preferences: { language: "Chinese" } },
  });
  const trigger = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-cell-menu-trigger"),
  );
  trigger.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  const alignGroup = created.find((element) => element.dataset.layoutGroup === "align");
  const colorGroup = created.find((element) => element.dataset.layoutGroup === "cell-color");
  assert.notEqual(alignGroup.dataset.group, "Align");
  assert.notEqual(colorGroup.dataset.group, "Cell color");
  assert.equal(alignGroup.dataset.groupKey, "Align");
  assert.equal(colorGroup.dataset.groupKey, "Cell color");
  assert.equal(created.find((element) => element.dataset.commandId === "align-center").dataset.variant, "icon");
  assert.equal(created.find((element) => element.dataset.commandId === "cell-bg-yellow").dataset.variant, "swatch");
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
  assert.equal(rowButton.style.left, "120px");
  assert.equal(rowButton.style.top, "158px");
  assert.equal(rowButton.style.properties.get("--mn-table-quick-add-rail"), "240px");
  assert.equal(columnButton.style.left, "360px");
  assert.equal(columnButton.style.top, "90px");
  assert.equal(columnButton.style.properties.get("--mn-table-quick-add-rail"), "68px");

  rowButton.onpointerdown({ preventDefault() {}, stopPropagation() {} });
  columnButton.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.deepEqual(calls, [
    ["addRowAfter"],
    ["focus"],
    ["addColumnAfter"],
    ["focus"],
  ]);
});

test("Tiptap table toolbar exposes an insert-between rail after complex blocks", () => {
  const { created, documentRef } = createDocument();
  const { calls, editor } = createTableHarness();
  const node = { nodeSize: 9, type: { name: "table" } };
  editor.state.doc = {
    nodeAt(pos) {
      return pos === 2 ? node : null;
    },
    resolve() {
      return {
        depth: 0,
      };
    },
  };
  let controller = null;
  editor.view.posAtDOM = (target) => {
    if (target === controller?.state?.table || String(target.className ?? "").includes("mn-tiptap-table")) return 2;
    return 10;
  };
  editor.commands.insertContentAt = (position, content, options) => {
    calls.push(["insertContentAt", position, content, options]);
    return true;
  };
  editor.commands.setTextSelection = (position) => {
    calls.push(["setTextSelection", position]);
    return true;
  };
  controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  let insertRail = created.find((element) =>
    String(element.className).includes("mn-tiptap-complex-block-insert"),
  );

  assert.equal(insertRail.style.left, "120px");
  assert.equal(insertRail.style.top, "160px");
  assert.equal(insertRail.hidden, true);

  editor.view.dom.listeners.get("pointermove")({
    target: editor.view.domAtPos().node,
    clientX: 160,
    clientY: 162,
  });
  insertRail = created.find((element) =>
    String(element.className).includes("mn-tiptap-complex-block-insert"),
  );

  assert.equal(insertRail.hidden, true);

  assert.equal(controller.insertParagraphAfterTable(), true);

  assert.deepEqual(calls, [
    [
      "insertContentAt",
      11,
      { type: "paragraph" },
      { updateSelection: true },
    ],
    ["setTextSelection", 12],
    ["focus"],
  ]);
});

test("Tiptap table toolbar exposes the insert-between rail after code blocks", () => {
  const { created, documentRef } = createDocument();
  const calls = [];
  const codeBlock = {
    nodeType: 1,
    tagName: "PRE",
    className: "mn-tiptap-code-block",
    ownerDocument: {
      documentElement: {
        clientWidth: 1000,
        clientHeight: 800,
      },
    },
    contains(target) {
      return target === this;
    },
    closest(selector) {
      if (selector.includes(".mn-tiptap-code-block") || selector.includes("pre")) return this;
      return null;
    },
    getBoundingClientRect: () => ({
      left: 160,
      top: 140,
      right: 520,
      bottom: 220,
      width: 360,
      height: 80,
    }),
  };
  const root = {
    listeners: new Map(),
    contains: (target) => target === codeBlock,
    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (this.listeners.get(type) === listener) this.listeners.delete(type);
    },
  };
  codeBlock.parentElement = root;
  const codeNode = { nodeSize: 12, type: { name: "codeBlock" } };
  const editor = {
    state: {
      selection: { from: 4 },
      doc: {
        nodeAt(pos) {
          return pos === 5 ? codeNode : null;
        },
        resolve() {
          return { depth: 0 };
        },
      },
    },
    view: {
      dom: root,
      domAtPos() {
        return { node: codeBlock };
      },
      posAtDOM(target) {
        return target === codeBlock ? 5 : 9;
      },
    },
    commands: {
      insertContentAt(position, content, options) {
        calls.push(["insertContentAt", position, content, options]);
        return true;
      },
      setTextSelection(position) {
        calls.push(["setTextSelection", position]);
        return true;
      },
      focus() {
        calls.push(["focus"]);
      },
    },
  };
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  root.listeners.get("pointermove")({
    target: codeBlock,
    clientX: 240,
    clientY: 216,
  });
  const insertRail = created.find((element) =>
    String(element.className).includes("mn-tiptap-complex-block-insert"),
  );

  assert.equal(controller.state.table, null);
  assert.equal(controller.state.complexBlock, codeBlock);
  assert.equal(insertRail.hidden, false);
  assert.equal(insertRail.style.left, "160px");
  assert.equal(insertRail.style.top, "222px");
  assert.equal(insertRail.style.width, "360px");
  assert.equal(insertRail.dataset.blockKind, "complex");

  insertRail.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.deepEqual(calls, [
    [
      "insertContentAt",
      17,
      { type: "paragraph" },
      { updateSelection: true },
    ],
    ["setTextSelection", 18],
    ["focus"],
  ]);
});

test("Tiptap table toolbar uses the official exitCode path after code blocks", () => {
  const { created, documentRef } = createDocument();
  const calls = [];
  const codeBlock = {
    nodeType: 1,
    tagName: "PRE",
    className: "mn-tiptap-code-block",
    ownerDocument: {
      documentElement: {
        clientWidth: 1000,
        clientHeight: 800,
      },
    },
    contains(target) {
      return target === this;
    },
    closest(selector) {
      if (selector.includes(".mn-tiptap-code-block") || selector.includes("pre")) return this;
      return null;
    },
    getBoundingClientRect: () => ({
      left: 160,
      top: 140,
      right: 520,
      bottom: 220,
      width: 360,
      height: 80,
    }),
  };
  const root = {
    listeners: new Map(),
    contains: (target) => target === codeBlock,
    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (this.listeners.get(type) === listener) this.listeners.delete(type);
    },
  };
  codeBlock.parentElement = root;
  const codeNode = { nodeSize: 12, type: { name: "codeBlock" } };
  const editor = {
    state: {
      selection: { from: 4 },
      doc: {
        nodeAt(pos) {
          return pos === 5 ? codeNode : null;
        },
      },
    },
    view: {
      dom: root,
      domAtPos() {
        return { node: codeBlock };
      },
      posAtDOM(target) {
        return target === codeBlock ? 5 : 9;
      },
    },
    chain() {
      return {
        setTextSelection(position) {
          calls.push(["setTextSelection", position]);
          return this;
        },
        exitCode() {
          calls.push(["exitCode"]);
          return this;
        },
        focus() {
          calls.push(["focus"]);
          return this;
        },
        run() {
          calls.push(["run"]);
          return true;
        },
      };
    },
    commands: {
      insertContentAt(position, content, options) {
        calls.push(["insertContentAt", position, content, options]);
        return true;
      },
      setTextSelection(position) {
        calls.push(["fallbackSetTextSelection", position]);
        return true;
      },
      focus() {
        calls.push(["fallbackFocus"]);
      },
    },
  };
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  root.listeners.get("pointermove")({
    target: codeBlock,
    clientX: 240,
    clientY: 216,
  });
  const insertRail = created.find((element) =>
    String(element.className).includes("mn-tiptap-complex-block-insert"),
  );

  insertRail.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.deepEqual(calls, [
    ["setTextSelection", 6],
    ["exitCode"],
    ["focus"],
    ["run"],
  ]);
});

test("Tiptap table toolbar opens the insert menu after complex blocks when available", () => {
  const { created, documentRef } = createDocument();
  const calls = [];
  const codeBlock = {
    nodeType: 1,
    tagName: "PRE",
    className: "mn-tiptap-code-block",
    ownerDocument: {
      documentElement: {
        clientWidth: 1000,
        clientHeight: 800,
      },
    },
    contains(target) {
      return target === this;
    },
    closest(selector) {
      if (selector.includes(".mn-tiptap-code-block") || selector.includes("pre")) return this;
      return null;
    },
    getBoundingClientRect: () => ({
      left: 160,
      top: 140,
      right: 520,
      bottom: 220,
      width: 360,
      height: 80,
    }),
  };
  const root = {
    listeners: new Map(),
    contains: (target) => target === codeBlock,
    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (this.listeners.get(type) === listener) this.listeners.delete(type);
    },
  };
  codeBlock.parentElement = root;
  const codeNode = { nodeSize: 12, type: { name: "codeBlock" } };
  const editor = {
    state: {
      selection: { from: 4 },
      doc: {
        nodeAt(pos) {
          return pos === 5 ? codeNode : null;
        },
      },
    },
    view: {
      dom: root,
      domAtPos() {
        return { node: codeBlock };
      },
      posAtDOM(target) {
        return target === codeBlock ? 5 : 9;
      },
    },
    commands: {
      insertContentAt(position, content, options) {
        calls.push(["insertContentAt", position, content, options]);
        return true;
      },
      setTextSelection(position) {
        calls.push(["setTextSelection", position]);
        return true;
      },
      focus() {
        calls.push(["focus"]);
      },
    },
  };
  const insertMenu = {
    calls: [],
    contains() {
      return false;
    },
    openAtBlock(target, options = {}) {
      this.calls.push([
        "openAtBlock",
        target.kind,
        target.pos,
        target.node?.nodeSize,
        options.anchorRect?.bottom,
      ]);
      return { open: true };
    },
  };
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
    insertMenu,
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  root.listeners.get("pointermove")({
    target: codeBlock,
    clientX: 240,
    clientY: 216,
  });
  const insertRail = created.find((element) =>
    String(element.className).includes("mn-tiptap-complex-block-insert"),
  );

  insertRail.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.deepEqual(insertMenu.calls, [["openAtBlock", "code_block", 5, 12, 220]]);
  assert.deepEqual(calls, []);
});

test("Tiptap table toolbar supports Alt Enter to insert after adjacent complex blocks", () => {
  const { calls, editor } = createTableHarness();
  const node = { nodeSize: 9, type: { name: "table" } };
  editor.state.doc = {
    nodeAt(pos) {
      return pos === 2 ? node : null;
    },
    resolve() {
      return { depth: 0 };
    },
  };
  let controller = null;
  editor.view.posAtDOM = (target) => {
    if (target === controller?.state?.table || String(target.className ?? "").includes("mn-tiptap-table")) return 2;
    return 10;
  };
  editor.commands.insertContentAt = (position, content, options) => {
    calls.push(["insertContentAt", position, content, options]);
    return true;
  };
  editor.commands.setTextSelection = (position) => {
    calls.push(["setTextSelection", position]);
    return true;
  };
  controller = createTiptapTableToolbarController();
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  const event = {
    key: "Enter",
    altKey: true,
    preventDefault() {
      calls.push(["preventDefault"]);
    },
    stopPropagation() {
      calls.push(["stopPropagation"]);
    },
  };

  assert.equal(controller.handleKeyDown(event), true);
  assert.deepEqual(calls, [
    ["preventDefault"],
    ["stopPropagation"],
    ["insertContentAt", 11, { type: "paragraph" }, { updateSelection: true }],
    ["setTextSelection", 12],
    ["focus"],
  ]);
});

test("Tiptap table toolbar anchors quick add buttons to the table grid edges", () => {
  const { created, documentRef } = createDocument();
  const { editor, table } = createTableHarness();
  editor.commands.addRowAfter = () => true;
  editor.commands.addColumnAfter = () => true;
  table.getBoundingClientRect = () => ({
    left: 100,
    top: 80,
    width: 300,
    height: 130,
    right: 400,
    bottom: 210,
  });
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

  assert.equal(rowButton.style.left, "120px");
  assert.equal(rowButton.style.top, "158px");
  assert.equal(rowButton.dataset.edge, "row");
  assert.equal(rowButton.style.properties.get("--mn-table-quick-add-rail"), "240px");
  assert.equal(columnButton.style.left, "360px");
  assert.equal(columnButton.style.top, "90px");
  assert.equal(columnButton.dataset.edge, "column");
  assert.equal(columnButton.style.properties.get("--mn-table-quick-add-rail"), "68px");
});

test("Tiptap table quick add rails appear only on the hovered table edge", () => {
  const { created, documentRef } = createDocument();
  const { cells, editor } = createTableHarness();
  editor.commands.addRowAfter = () => true;
  editor.commands.addColumnAfter = () => true;
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

  editor.view.dom.listeners.get("pointermove")({ target: cells[4], clientX: 235, clientY: 130 });
  assert.equal(rowButton.hidden, true);
  assert.equal(columnButton.hidden, true);

  editor.view.dom.listeners.get("pointermove")({ target: editor.view.dom, clientX: 160, clientY: 162 });
  assert.equal(rowButton.hidden, false);
  assert.equal(columnButton.hidden, true);

  editor.view.dom.listeners.get("pointermove")({ target: editor.view.dom, clientX: 366, clientY: 118 });
  assert.equal(rowButton.hidden, true);
  assert.equal(columnButton.hidden, false);

  editor.view.dom.listeners.get("pointermove")({ target: editor.view.dom, clientX: 366, clientY: 152 });
  assert.equal(rowButton.hidden, true);
  assert.equal(columnButton.hidden, false);

  editor.view.dom.listeners.get("pointermove")({ target: editor.view.dom, clientX: 318, clientY: 162 });
  assert.equal(rowButton.hidden, false);
  assert.equal(columnButton.hidden, true);
});

test("Tiptap table quick add rails ignore adjacent complex block targets", () => {
  const { created, documentRef } = createDocument();
  const { editor } = createTableHarness();
  const codeBlock = {
    nodeType: 1,
    tagName: "PRE",
    className: "mn-tiptap-code-block",
    parentElement: editor.view.dom,
    contains(target) {
      return target === this;
    },
    closest(selector) {
      if (selector.includes(".mn-tiptap-code-block") || selector.includes("pre")) return this;
      return null;
    },
    getBoundingClientRect: () => ({
      left: 120,
      top: 158,
      right: 360,
      bottom: 230,
      width: 240,
      height: 72,
    }),
  };
  editor.commands.addRowAfter = () => true;
  editor.commands.addColumnAfter = () => true;
  editor.view.dom.contains = (target) =>
    target === editor.view.dom || target === codeBlock;
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
  const insertRail = created.find((element) =>
    String(element.className).includes("mn-tiptap-complex-block-insert"),
  );

  editor.view.dom.listeners.get("pointermove")({
    target: codeBlock,
    clientX: 240,
    clientY: 160,
  });
  assert.equal(rowButton.hidden, true);
  assert.equal(columnButton.hidden, true);
  assert.equal(insertRail.hidden, true);

  editor.view.dom.listeners.get("pointermove")({
    target: codeBlock,
    clientX: 240,
    clientY: 224,
  });
  assert.equal(rowButton.hidden, true);
  assert.equal(columnButton.hidden, true);
  assert.equal(insertRail.hidden, false);
  assert.equal(insertRail.dataset.blockKind, "complex");
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
    ["setCellSelection", 10, 10],
    ["focus"],
    ["setCellAttribute", "align", "center"],
    ["focus"],
  ]);
});

test("Tiptap table toolbar selects the focused cell before opening cell actions", () => {
  const { cells, created, documentRef, editor } = (() => {
    const { created, documentRef } = createDocument();
    const harness = createTableHarness({ setCellAttribute: () => true });
    return { ...harness, created, documentRef };
  })();
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  const trigger = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-cell-menu-trigger"),
  );
  trigger.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.equal(controller.state.selection.kind, "cell");
  assert.deepEqual([...controller.state.selection.positions], [10]);
  assert.deepEqual(
    cells.map((cell) => cell.classes.has("mn-tiptap-table-cell-selected")),
    [true, false, false, false, false, false],
  );
});

test("Tiptap table toolbar preserves multi-cell selection when opening cell actions", () => {
  const { calls, created, documentRef, editor } = (() => {
    const { created, documentRef } = createDocument();
    const harness = createTableHarness({ mergeCells: () => true });
    return { ...harness, created, documentRef };
  })();
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
  trigger.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.equal(controller.state.selection.kind, "cells");
  assert.deepEqual(calls, []);
  assert.deepEqual([...controller.state.selection.positions], [10, 11]);
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
  editor.commands.copySelectedTableCells = () => true;
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
  assert.equal(trigger.hidden, true);
  assert.equal(created.some((element) => element.dataset.commandId === "merge-cells"), false);

  trigger.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.equal(root.hidden, false);
  assert.equal(controller.state.menuOpen, true);
  assert.deepEqual(
    tableToolbarList(created).children
      .flatMap((element) => element.children ?? [])
      .filter((element) => element.dataset.commandId)
      .map((element) => element.dataset.commandId),
    [
      "copy-cell-content",
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
  const root = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-toolbar"),
  );
  const addColumnBefore = toolbarCommandButton(created, "add-column-before");
  assert.equal(
    addColumnBefore.id,
    `mn-tiptap-table-toolbar-item-${addColumnBefore.dataset.commandIndex}`,
  );
  assert.equal(root["aria-activedescendant"], addColumnBefore.id);
  assert.equal(
    tableToolbarHeader(created).title.textContent,
    "Table tools",
  );

  assert.equal(controller.handleKeyDown(keyboardEvent("ArrowRight")), true);
  assert.equal(controller.state.activeCommandId, "delete-table");
  assert.equal(documentRef.activeElement?.dataset?.commandId, "delete-table");
  const deleteTable = toolbarCommandButton(created, "delete-table");
  assert.equal(root["aria-activedescendant"], deleteTable.id);

  assert.equal(controller.handleKeyDown(keyboardEvent("Enter")), true);
  assert.deepEqual(calls, [["deleteTable"], ["focus"]]);
  assert.equal(documentRef.activeElement?.dataset?.commandId, "delete-table");

  const disabled = created.find((element) => element.dataset.commandId === "delete-column");
  assert.equal(disabled.tabIndex, -1);
  assert.equal(disabled.dataset.keyboardActive, "false");
});

test("Tiptap table context menu syncs hover and focus active commands", () => {
  const { created, documentRef } = createDocument();
  const { editor } = createTableHarness({
    mergeCells: () => true,
    setCellAttribute: () => true,
  });
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  const trigger = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-cell-menu-trigger"),
  );
  trigger.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  const root = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-toolbar"),
  );
  const center = toolbarCommandButton(created, "align-center");
  const green = toolbarCommandButton(created, "cell-bg-green");

  center.onpointerenter?.({ preventDefault() {}, stopPropagation() {} });
  assert.equal(controller.state.activeCommandId, "align-center");
  assert.equal(root.dataset.keyboardActive, "false");
  assert.equal(center.dataset.keyboardActive, "true");
  assert.equal(root["aria-activedescendant"], center.id);
  assert.equal(
    toolbarCommandButton(created, "align-left").dataset.keyboardActive,
    "false",
  );
  assert.equal(toolbarCommandButton(created, "align-left").tabIndex, -1);

  green.onfocus?.({ preventDefault() {}, stopPropagation() {} });
  assert.equal(controller.state.activeCommandId, "cell-bg-green");
  assert.equal(root.dataset.keyboardActive, "true");
  assert.equal(green.dataset.keyboardActive, "true");
  assert.equal(root["aria-activedescendant"], green.id);
  assert.equal(green.tabIndex, 0);
  assert.equal(center.dataset.keyboardActive, "false");
  assert.equal(center.tabIndex, -1);
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

test("Tiptap table toolbar yields keyboard handling during IME composition", () => {
  const { calls, editor } = createTableHarness();
  editor.commands.deleteTable = () => {
    calls.push(["deleteTable"]);
    return true;
  };
  const controller = createTiptapTableToolbarController();
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  controller.handleKeyDown({
    key: "F10",
    shiftKey: true,
    preventDefault() {},
    stopPropagation() {},
  });
  const events = [];

  assert.equal(
    controller.handleKeyDown({
      key: "Enter",
      keyCode: 229,
      preventDefault() {
        events.push("preventDefault");
      },
      stopPropagation() {
        events.push("stopPropagation");
      },
    }),
    false,
  );

  assert.equal(controller.state.open, true);
  assert.deepEqual(calls, []);
  assert.deepEqual(events, []);
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

test("Tiptap table toolbar opens from keyboard Context Menu keys", () => {
  const { editor } = createTableHarness();
  editor.commands.deleteTable = () => true;
  const view = createViewSpy();
  const controller = createTiptapTableToolbarController({ view });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  controller.close();
  const events = [];

  assert.equal(
    controller.handleKeyDown({
      key: "ContextMenu",
      preventDefault() {
        events.push("preventDefault");
      },
      stopPropagation() {
        events.push("stopPropagation");
      },
    }),
    true,
  );

  assert.equal(controller.state.open, true);
  assert.equal(controller.state.mode, "keyboard");
  assert.equal(controller.state.menuOpen, true);
  assert.equal(controller.state.activeCommandId, "delete-table");
  assert.deepEqual(events, ["preventDefault", "stopPropagation"]);
});

test("Tiptap table toolbar axis handles select rows and columns", () => {
  const { created, documentRef } = createDocument();
  const { calls, editor } = createTableHarness();
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  editor.view.dom.listeners.get("pointermove")({ target: editor.view.dom, clientX: 108, clientY: 94 });
  const rowHandle = latestAxisHandle(created, "row", 0);
  assert.ok(rowHandle, "expected a row handle for the first row");
  rowHandle.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  editor.state.selection = { from: 4 };
  controller.toggleMenu("context", { open: false });
  controller.refresh(editor);
  editor.view.dom.listeners.get("pointermove")({ target: editor.view.dom, clientX: 124, clientY: 68 });
  const columnHandle = latestAxisHandle(created, "column", 0);
  assert.ok(columnHandle, "expected a column handle for the first column");
  columnHandle.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.deepEqual(calls, [
    ["setCellSelection", 10, 12],
    ["focus"],
    ["setCellSelection", 10, 13],
    ["focus"],
  ]);
});

test("Tiptap table axis handles reveal only for the hovered first row or column cell", () => {
  const { created, documentRef } = createDocument();
  const { cells, editor } = createTableHarness();
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });
  const visibleAxisHandles = (axis) =>
    created.filter((element) =>
      String(element.className).includes(`mn-tiptap-table-axis-handle ${axis}`) &&
      !element.removed &&
      !element.hidden,
    );

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  editor.view.dom.listeners.get("pointermove")({ target: cells[4], clientX: 202, clientY: 128 });
  assert.equal(visibleAxisHandles("row").length, 0);
  assert.equal(visibleAxisHandles("column").length, 0);

  editor.view.dom.listeners.get("pointermove")({ target: cells[3], clientX: 126, clientY: 128 });
  assert.equal(visibleAxisHandles("row").length, 0);
  assert.equal(visibleAxisHandles("column").length, 0);

  editor.view.dom.listeners.get("pointermove")({ target: cells[3], clientX: 124, clientY: 128 });
  assert.equal(visibleAxisHandles("row").length, 1);
  assert.equal(visibleAxisHandles("column").length, 0);

  editor.view.dom.listeners.get("pointermove")({ target: cells[1], clientX: 204, clientY: 97 });
  assert.equal(visibleAxisHandles("row").length, 0);
  assert.equal(visibleAxisHandles("column").length, 0);

  editor.view.dom.listeners.get("pointermove")({ target: cells[1], clientX: 204, clientY: 95 });
  assert.equal(visibleAxisHandles("row").length, 0);
  assert.equal(visibleAxisHandles("column").length, 1);
});

test("Tiptap table row and column handles stay outside editable cells while tracking hovered cells", () => {
  const { created, documentRef } = createDocument();
  const { cells, editor } = createTableHarness();
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  editor.view.dom.listeners.get("pointermove")({ target: cells[3], clientX: 126, clientY: 128 });
  assert.equal(controller.state.hover.edge, "cell");
  const rowHandleFromCell = latestAxisHandle(created, "row", 1);
  assert.equal(rowHandleFromCell, undefined);
  editor.view.dom.listeners.get("pointermove")({ target: cells[1], clientX: 204, clientY: 97 });
  assert.equal(controller.state.hover.edge, "cell");
  const columnHandleFromCell = latestAxisHandle(created, "column", 1);
  assert.equal(columnHandleFromCell, undefined);

  editor.view.dom.listeners.get("pointermove")({ target: cells[3], clientX: 124, clientY: 128 });
  assert.equal(controller.state.hover.edge, "row-handle");
  const rowHandle = latestAxisHandle(created, "row", 1);
  editor.view.dom.listeners.get("pointermove")({ target: cells[1], clientX: 204, clientY: 95 });
  assert.equal(controller.state.hover.edge, "column-handle");
  const columnHandle = latestAxisHandle(created, "column", 1);
  assert.equal(rowHandle.style.left, "98px");
  assert.equal(rowHandle.style.width, "20px");
  assert.equal(columnHandle.style.top, "68px");
  assert.equal(columnHandle.style.height, "20px");
});

test("Tiptap table row and column handles activate from gutter coordinates", () => {
  const { created, documentRef } = createDocument();
  const { editor, table } = createTableHarness();
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  editor.view.dom.listeners.get("pointermove")({ target: table, clientX: 108, clientY: 128 });
  assert.equal(controller.state.hover.edge, "row-handle");
  editor.view.dom.listeners.get("pointermove")({ target: table, clientX: 204, clientY: 76 });
  assert.equal(controller.state.hover.edge, "column-handle");

  assert.equal(
    created.some((element) =>
      String(element.className).includes("mn-tiptap-table-axis-handle row") &&
      element.dataset.index === "1" &&
      !element.hidden,
    ),
    true,
  );
});

test("Tiptap table row and column handles hide after row or column selection", () => {
  const { created, documentRef } = createDocument();
  const { editor, table } = createTableHarness();
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  editor.view.dom.listeners.get("pointermove")({ target: table, clientX: 108, clientY: 128 });
  const rowHandle = [...created].reverse().find((element) =>
    String(element.className).includes("mn-tiptap-table-axis-handle row") &&
    element.dataset.index === "1" &&
    !element.removed,
  );
  assert.equal(rowHandle.hidden, false);

  rowHandle.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.equal(controller.state.selection.kind, "row");
  assert.equal(controller.state.menuOpen, false);
  assert.equal(
    created
      .filter((element) =>
        String(element.className).includes("mn-tiptap-table-axis-handle row") &&
        element.dataset.index === "1" &&
        !element.removed,
      )
      .some((element) => !element.hidden),
    false,
  );
});

test("Tiptap table row and column menus anchor to the slim handle geometry", () => {
  const { created, documentRef } = createDocument();
  const { editor, table } = createTableHarness({
    addRowAfter: () => true,
    addRowBefore: () => true,
    addColumnAfter: () => true,
    addColumnBefore: () => true,
  });
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  editor.view.dom.listeners.get("pointermove")({
    target: table,
    clientX: 108,
    clientY: 128,
  });
  const rowHandle = latestAxisHandle(created, "row", 1);
  assert.ok(rowHandle, "expected a row handle for the second row");
  rowHandle.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.equal(controller.state.selection.kind, "row");
  assert.equal(controller.state.menuOpen, true);
  assert.equal(controller.state.menuAnchorRect.left, 98);
  assert.equal(controller.state.menuAnchorRect.top, 124);
  assert.equal(controller.state.menuAnchorRect.width, 20);
  assert.equal(controller.state.menuAnchorRect.height, 34);

  controller.toggleMenu("context", { open: false });
  editor.state.selection = { from: 4 };
  controller.refresh(editor);
  editor.view.dom.listeners.get("pointermove")({
    target: table,
    clientX: 204,
    clientY: 76,
  });
  const columnHandle = latestAxisHandle(created, "column", 1);
  assert.ok(columnHandle, "expected a column handle for the second column");
  columnHandle.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.equal(controller.state.selection.kind, "column");
  assert.equal(controller.state.menuOpen, true);
  assert.equal(controller.state.menuAnchorRect.left, 200);
  assert.equal(controller.state.menuAnchorRect.top, 68);
  assert.equal(controller.state.menuAnchorRect.width, 80);
  assert.equal(controller.state.menuAnchorRect.height, 20);
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
  assert.equal(rowHandles.length, 0);
  assert.equal(rowHandles.some((handle) => !handle.hidden), false);
  assert.equal(columnHandles.length, 0);
  assert.deepEqual(
    cells.map((cell) => cell.classes.has("mn-tiptap-table-cell-selected")),
    [true, true, true, false, false, false],
  );

  controller.close();
  assert.equal(cells.some((cell) => cell.classes.has("mn-tiptap-table-cell-selected")), false);
});

test("Tiptap table toolbar marks only the focused editable cell as active", () => {
  const { cells, editor } = createTableHarness();
  const { documentRef } = createDocument();
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  assert.equal(cells[0].classes.has("mn-tiptap-table-cell-active"), true);
  assert.equal(cells[1].classes.has("mn-tiptap-table-cell-active"), false);

  editor.view.domAtPos = () => ({ node: cells[4] });
  controller.refresh(editor);

  assert.equal(cells[0].classes.has("mn-tiptap-table-cell-active"), false);
  assert.equal(cells[4].classes.has("mn-tiptap-table-cell-active"), true);

  editor.commands.setCellSelection({ anchorCell: 10, headCell: 11 });
  controller.refresh(editor);

  assert.equal(cells.some((cell) => cell.classes.has("mn-tiptap-table-cell-active")), false);
});

test("Tiptap table toolbar keeps the cell menu trigger hidden until the edge is intentional", () => {
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
  assert.equal(trigger.hidden, true);
  assert.equal(trigger.textContent ?? "", "");
  assert.equal(trigger.dataset.selectionKind, "cell");
  assert.equal(trigger.dataset.selectedCount, "0");
  assert.equal(trigger["aria-expanded"], "false");
});

test("Tiptap table toolbar reveals the cell trigger after selecting a cell", () => {
  const { created, documentRef } = createDocument();
  const { cells, editor } = createTableHarness({ setCellAttribute: () => true });
  editor.commands.addColumnAfter = () => true;
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  const trigger = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-cell-menu-trigger"),
  );

  editor.view.dom.listeners.get("pointermove")({
    target: cells[0],
    clientX: 181,
    clientY: 112,
  });
  assert.equal(trigger.hidden, true);

  editor.view.dom.listeners.get("pointermove")({
    target: cells[0],
    clientX: 195,
    clientY: 107,
  });
  assert.equal(trigger.hidden, true);

  editor.view.dom.listeners.get("pointermove")({
    target: cells[0],
    clientX: 197,
    clientY: 107,
  });
  assert.equal(trigger.hidden, false);
  assert.equal(trigger.style.left, "200px");
  assert.equal(trigger.style.top, "107px");
  assert.equal(trigger.dataset.edgeIntent, "true");
  assert.equal(trigger.dataset.placement, "edge");

  editor.commands.setCellSelection({ anchorCell: 10, headCell: 10 });
  controller.refresh(editor);
  assert.equal(trigger.hidden, false);
  assert.equal(trigger.style.left, "200px");
  assert.equal(trigger.style.top, "107px");
  assert.equal(trigger.dataset.placement, "quiet-edge");
  assert.equal(controller.state.selection.kind, "cell");
});

test("Tiptap table toolbar keeps the cell trigger quiet outside the vertical center zone", () => {
  const { created, documentRef } = createDocument();
  const { cells, editor } = createTableHarness({ setCellAttribute: () => true });
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  const trigger = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-cell-menu-trigger"),
  );

  editor.view.dom.listeners.get("pointermove")({
    target: cells[0],
    clientX: 195,
    clientY: 123,
  });

  assert.equal(trigger.hidden, true);
  assert.notEqual(controller.state.hover.edge, "cell-menu");
});

test("Tiptap table toolbar does not expose split cell without a can command", () => {
  const { created, documentRef } = createDocument();
  const { editor } = createTableHarness({
    splitCell: () => true,
    setCellAttribute: () => true,
  });
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  const trigger = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-cell-menu-trigger"),
  );
  trigger.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.equal(toolbarCommandIds(created).includes("split-cell"), false);
});

test("Tiptap table toolbar exposes split only when a merged cell can be split", () => {
  const { created, documentRef } = createDocument();
  const { editor } = createTableHarness({
    splitCell: () => true,
    setCellAttribute: () => true,
  });
  editor.can = () => ({
    splitCell: () => true,
    setCellAttribute: () => true,
  });
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  const trigger = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-cell-menu-trigger"),
  );
  trigger.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  const split = toolbarCommandButton(created, "split-cell");
  assert.ok(split, "expected split command for a splittable merged cell");
  assert.equal(split.title, "Split merged cell");
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
      [11, 10].forEach((pos) => callback({}, pos));
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
  assert.equal(trigger.style.left, "280px");
  assert.equal(trigger.style.top, "107px");
  assert.equal(trigger.dataset.selectionKind, "cells");
  assert.equal(trigger.dataset.placement, "center");
  assert.equal(trigger.dataset.selectedCount, "2");
  trigger.getBoundingClientRect = () => ({
    left: 232,
    top: 97,
    right: 248,
    bottom: 113,
    width: 12,
    height: 16,
  });

  trigger.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.equal(root.hidden, false);
  assert.equal(trigger["aria-expanded"], "true");
  assert.equal(root.style.left, "152px");
  assert.equal(root.style.top, "121px");
});

test("Tiptap table toolbar renders localized context headers for table selections", () => {
  const { created, documentRef } = createDocument();
  const { editor } = createTableHarness({
    mergeCells: () => true,
    setCellAttribute: () => true,
  });
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

  controller.attach({
    editor,
    root: {},
    entry: { viewMode: "hybrid", preferences: { language: "Chinese" } },
  });
  const trigger = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-cell-menu-trigger"),
  );
  trigger.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  const { eyebrow, title, subtitle } = tableToolbarHeader(created);
  assert.equal(eyebrow.textContent, "表格");
  assert.equal(title.textContent, "选区操作");
  assert.equal(subtitle.textContent, "已选择 2 个单元格");
});

test("Tiptap table toolbar scopes context commands to row and column selections", () => {
  const { created, documentRef } = createDocument();
  const { editor } = createTableHarness({
    addRowBefore: () => true,
    addRowAfter: () => true,
    moveSelectedTableRow: () => true,
    moveSelectedTableColumn: () => true,
    duplicateSelectedTableRow: () => true,
    duplicateSelectedTableColumn: () => true,
    sortSelectedTableRows: () => true,
    sortSelectedTableColumns: () => true,
    deleteRow: () => true,
    toggleHeaderRow: () => true,
    addColumnBefore: () => true,
    addColumnAfter: () => true,
    moveSelectedTableColumn: () => true,
    deleteColumn: () => true,
    toggleHeaderColumn: () => true,
    copySelectedTableCells: () => true,
    clearSelectedTableCells: () => true,
    resetSelectedTableCellAttrs: () => true,
    mergeCells: () => true,
    splitCell: () => true,
    setCellAttribute: () => true,
  });
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  editor.view.dom.listeners.get("pointermove")({ target: editor.view.dom, clientX: 108, clientY: 128 });
  const rowHandle = latestAxisHandle(created, "row", 1);
  rowHandle.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.equal(controller.state.selection.kind, "row");
  assert.equal(controller.state.menuOpen, true);
  assert.deepEqual(
    controller.state.commands
      .filter((command) => !command.disabled)
      .map((command) => command.id)
      .filter((id) => ["move-row-up", "move-row-down", "sort-columns-asc", "sort-columns-desc", "add-row-before", "add-row-after", "duplicate-row", "copy-cell-content", "clear-cell-content", "clear-cell-style", "delete-row", "toggle-header-row", "merge-cells"].includes(id)),
    ["add-row-before", "add-row-after", "delete-row", "move-row-up", "move-row-down", "sort-columns-asc", "sort-columns-desc", "duplicate-row", "merge-cells", "copy-cell-content", "clear-cell-content", "clear-cell-style", "toggle-header-row"],
  );
  assert.deepEqual(
    toolbarCommandIds(created)
      .filter((id) => ["move-row-up", "move-row-down", "sort-columns-asc", "sort-columns-desc", "add-row-before", "add-row-after", "duplicate-row", "copy-cell-content", "clear-cell-content", "clear-cell-style", "delete-row", "toggle-header-row", "merge-cells"].includes(id)),
    ["move-row-up", "move-row-down", "sort-columns-asc", "sort-columns-desc", "add-row-after", "add-row-before", "duplicate-row", "copy-cell-content", "clear-cell-content", "clear-cell-style", "toggle-header-row", "delete-row"],
  );

  controller.selectAxis("column", 0);
  assert.equal(controller.state.selection.kind, "column");
  assert.equal(controller.toggleMenu("context", { open: true }), true);
  assert.deepEqual(
    toolbarCommandIds(created)
      .filter((id) => ["move-column-left", "move-column-right", "sort-rows-asc", "sort-rows-desc", "add-column-before", "add-column-after", "duplicate-column", "copy-cell-content", "clear-cell-content", "clear-cell-style", "delete-column", "toggle-header-column", "merge-cells"].includes(id)),
    ["move-column-left", "move-column-right", "sort-rows-asc", "sort-rows-desc", "add-column-after", "add-column-before", "duplicate-column", "copy-cell-content", "clear-cell-content", "clear-cell-style", "toggle-header-column", "delete-column"],
  );
});

test("Tiptap table toolbar separates destructive row actions from ordinary commands", () => {
  const { created, documentRef } = createDocument();
  const { editor } = createTableHarness({
    addRowBefore: () => true,
    addRowAfter: () => true,
    moveSelectedTableRow: () => true,
    sortSelectedTableColumns: () => true,
    duplicateSelectedTableRow: () => true,
    copySelectedTableCells: () => true,
    clearSelectedTableCells: () => true,
    resetSelectedTableCellAttrs: () => true,
    deleteRow: () => true,
    toggleHeaderRow: () => true,
  });
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  editor.view.dom.listeners.get("pointermove")({ target: editor.view.dom, clientX: 108, clientY: 128 });
  const rowHandle = latestAxisHandle(created, "row", 1);
  rowHandle.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  const groups = tableToolbarList(created).children;
  const dangerGroup = groups.find((element) => element.dataset.layoutGroup === "danger");
  const rowGroup = groups.find((element) => element.dataset.group === "Rows");
  const arrangeGroup = groups.find((element) => element.dataset.group === "Arrange");
  const cellGroup = groups.find((element) => element.dataset.group === "Cells");
  const headerGroup = groups.find((element) => element.dataset.group === "Headers");

  assert.equal(dangerGroup.dataset.groupKey, "danger");
  assert.equal(dangerGroup.children.some((child) => String(child.className).includes("group-label")), false);
  assert.deepEqual(
    dangerGroup.children
      .filter((element) => element.dataset.commandId)
      .map((element) => [element.dataset.commandId, element.dataset.tone]),
    [["delete-row", "danger"]],
  );
  assert.deepEqual(
    arrangeGroup.children
      .filter((element) => element.dataset.commandId)
      .map((element) => [element.dataset.commandId, element.textContent]),
    [
      ["move-row-up", "Move row up"],
      ["move-row-down", "Move row down"],
      ["sort-columns-asc", "Sort columns A to Z"],
      ["sort-columns-desc", "Sort columns Z to A"],
    ],
  );
  assert.deepEqual(
    rowGroup.children
      .filter((element) => element.dataset.commandId)
      .map((element) => [element.dataset.commandId, element.textContent]),
    [
      ["add-row-after", "Insert row below"],
      ["add-row-before", "Insert row above"],
      ["duplicate-row", "Duplicate current row"],
    ],
  );
  assert.deepEqual(
    cellGroup.children
      .filter((element) => element.dataset.commandId)
      .map((element) => [element.dataset.commandId, element.textContent]),
    [
      ["copy-cell-content", "Copy cell content"],
      ["clear-cell-content", "Clear cell content"],
      ["clear-cell-style", "Clear cell style"],
    ],
  );
  assert.deepEqual(
    headerGroup.children
      .filter((element) => element.dataset.commandId)
      .map((element) => [element.dataset.commandId, element.textContent]),
    [["toggle-header-row", "Toggle header row"]],
  );
  const { eyebrow, title, subtitle } = tableToolbarHeader(created);
  assert.equal(eyebrow.textContent, "Table");
  assert.equal(title.textContent, "Row actions");
  assert.equal(subtitle.textContent, "Row 2");
});

test("Tiptap table context menu renders text commands as command rows", () => {
  const { created, documentRef } = createDocument();
  const { editor } = createTableHarness({
    addRowBefore: () => true,
    addRowAfter: () => true,
    moveSelectedTableRow: () => true,
    sortSelectedTableColumns: () => true,
    duplicateSelectedTableRow: () => true,
    copySelectedTableCells: () => true,
    clearSelectedTableCells: () => true,
    resetSelectedTableCellAttrs: () => true,
    deleteRow: () => true,
    toggleHeaderRow: () => true,
  });
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  editor.view.dom.listeners.get("pointermove")({ target: editor.view.dom, clientX: 108, clientY: 128 });
  const rowHandle = latestAxisHandle(created, "row", 1);
  rowHandle.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  const insertBelow = toolbarCommandButton(created, "add-row-after");
  const duplicateRow = toolbarCommandButton(created, "duplicate-row");
  const moveUp = toolbarCommandButton(created, "move-row-up");
  const sortAsc = toolbarCommandButton(created, "sort-columns-asc");
  const copyContent = toolbarCommandButton(created, "copy-cell-content");
  const clearContent = toolbarCommandButton(created, "clear-cell-content");
  const clearStyle = toolbarCommandButton(created, "clear-cell-style");
  const headerRow = toolbarCommandButton(created, "toggle-header-row");
  const deleteRow = toolbarCommandButton(created, "delete-row");

  assert.equal(moveUp.children[0].dataset.icon, "move-row-up");
  assert.equal(toolbarCommandCopy(moveUp).title, "Move row up");
  assert.equal(toolbarCommandCopy(moveUp).description, "Move the selected row one position up.");
  assert.equal(sortAsc.children[0].dataset.icon, "sort-asc");
  assert.equal(toolbarCommandCopy(sortAsc).title, "Sort columns A to Z");
  assert.equal(
    toolbarCommandCopy(sortAsc).description,
    "Sort columns by this row; header columns stay fixed.",
  );
  assert.equal(insertBelow.dataset.variant, "text");
  assert.equal(insertBelow.children.length, 2);
  assert.equal(
    String(insertBelow.children[0].className).includes("mn-tiptap-table-toolbar-button-visual"),
    true,
  );
  assert.equal(insertBelow.children[0].dataset.icon, "row-below");
  assert.equal(
    String(insertBelow.children[1].className).includes("mn-tiptap-table-toolbar-button-copy"),
    true,
  );
  assert.equal(toolbarCommandCopy(insertBelow).title, "Insert row below");
  assert.equal(toolbarCommandCopy(insertBelow).description, "Add a row below the selected row.");
  assert.equal(duplicateRow.children[0].dataset.icon, "duplicate-row");
  assert.equal(toolbarCommandCopy(duplicateRow).title, "Duplicate current row");
  assert.equal(toolbarCommandCopy(duplicateRow).description, "Copy the selected row below itself.");
  assert.equal(copyContent.children[0].dataset.icon, "copy-cell");
  assert.equal(toolbarCommandCopy(copyContent).title, "Copy cell content");
  assert.equal(toolbarCommandCopy(copyContent).description, "Copy selected cells as tab-separated text.");
  assert.equal(clearContent.children[0].dataset.icon, "clear-content");
  assert.equal(toolbarCommandCopy(clearContent).title, "Clear cell content");
  assert.equal(toolbarCommandCopy(clearContent).description, "Clear text while keeping the table structure.");
  assert.equal(clearStyle.children[0].dataset.icon, "clear-style");
  assert.equal(toolbarCommandCopy(clearStyle).title, "Clear cell style");
  assert.equal(toolbarCommandCopy(clearStyle).description, "Remove alignment, colors, and text styling.");
  assert.equal(headerRow.children[0].dataset.icon, "header-row");
  assert.equal(toolbarCommandCopy(headerRow).title, "Toggle header row");
  assert.equal(toolbarCommandCopy(headerRow).description, "Turn the current row into a header row.");
  assert.equal(deleteRow.children[0].dataset.icon, "delete-row");
  assert.equal(toolbarCommandCopy(deleteRow).title, "Delete current row");
  assert.equal(toolbarCommandCopy(deleteRow).description, "Remove the selected row and its content.");
  assert.equal(deleteRow["aria-label"], "Delete current row. Remove the selected row and its content.");
});

test("Tiptap table range context menu keeps merge commands visually explicit", () => {
  const { created, documentRef } = createDocument();
  const { editor } = createTableHarness({
    mergeCells: () => true,
    splitCell: () => true,
    setCellAttribute: () => true,
  });
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
  trigger.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  const mergeCells = toolbarCommandButton(created, "merge-cells");
  assert.equal(mergeCells.dataset.variant, "text");
  assert.equal(mergeCells.children[0].dataset.icon, "merge");
  assert.equal(
    String(mergeCells.children[0].className).includes("mn-tiptap-table-toolbar-button-visual"),
    true,
  );
  assert.equal(toolbarCommandCopy(mergeCells).title, "Merge selected cells");
  assert.equal(toolbarCommandCopy(mergeCells).description, "Combine the selected cells into one cell.");
});

test("Tiptap table toolbar keeps cell and axis context menus focused", () => {
  const { created, documentRef } = createDocument();
  const { editor } = createTableHarness({
    addRowBefore: () => true,
    addRowAfter: () => true,
    moveSelectedTableRow: () => true,
    sortSelectedTableColumns: () => true,
    duplicateSelectedTableRow: () => true,
    deleteRow: () => true,
    toggleHeaderRow: () => true,
    addColumnBefore: () => true,
    addColumnAfter: () => true,
    moveSelectedTableColumn: () => true,
    sortSelectedTableRows: () => true,
    duplicateSelectedTableColumn: () => true,
    deleteColumn: () => true,
    toggleHeaderColumn: () => true,
    mergeCells: () => true,
    copySelectedTableCells: () => true,
    splitCell: () => false,
    setCellAttribute: () => true,
    setSelectedTableCellTextColor: () => true,
    fixTables: () => true,
    deleteTable: () => true,
  });
  editor.can = () => ({
    splitCell: () => false,
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
    "copy-cell-content",
    "align-left",
    "align-center",
    "align-right",
    "cell-text-clear",
    "cell-text-muted",
    "cell-text-accent",
    "cell-text-danger",
    "cell-bg-clear",
    "cell-bg-yellow",
    "cell-bg-blue",
    "cell-bg-green",
  ]);

  controller.selectAxis("row", 0);
  controller.toggleMenu("context", { open: true });
  const rowCommandIds = toolbarCommandIds(created);
  assert.deepEqual(rowCommandIds.filter((id) => id.includes("row") || id.startsWith("sort-columns")), [
    "move-row-up",
    "move-row-down",
    "sort-columns-asc",
    "sort-columns-desc",
    "add-row-after",
    "add-row-before",
    "duplicate-row",
    "toggle-header-row",
    "delete-row",
  ]);
  assert.deepEqual(
    rowCommandIds.filter((id) =>
      id.startsWith("align-") ||
      id.startsWith("cell-text-") ||
      id.startsWith("cell-bg-")
    ),
    [
      "align-left",
      "align-center",
      "align-right",
      "cell-text-clear",
      "cell-text-muted",
      "cell-text-accent",
      "cell-text-danger",
      "cell-bg-clear",
      "cell-bg-yellow",
      "cell-bg-blue",
      "cell-bg-green",
    ],
  );

  controller.selectAxis("column", 0);
  controller.toggleMenu("context", { open: true });
  const columnCommandIds = toolbarCommandIds(created);
  assert.deepEqual(columnCommandIds.filter((id) => id.includes("column") || id.startsWith("sort-rows")), [
    "move-column-left",
    "move-column-right",
    "sort-rows-asc",
    "sort-rows-desc",
    "add-column-after",
    "add-column-before",
    "duplicate-column",
    "toggle-header-column",
    "delete-column",
  ]);
  assert.deepEqual(
    columnCommandIds.filter((id) =>
      id.startsWith("align-") ||
      id.startsWith("cell-text-") ||
      id.startsWith("cell-bg-")
    ),
    [
      "align-left",
      "align-center",
      "align-right",
      "cell-text-clear",
      "cell-text-muted",
      "cell-text-accent",
      "cell-text-danger",
      "cell-bg-clear",
      "cell-bg-yellow",
      "cell-bg-blue",
      "cell-bg-green",
    ],
  );

  controller.selectAxis("table", 0);
  controller.toggleMenu("context", { open: true });
  assert.deepEqual(toolbarCommandIds(created), [
    "toggle-header-row",
    "toggle-header-column",
    "fix-table",
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
  editor.view.dom.listeners.get("pointermove")({ target: editor.view.dom, clientX: 108, clientY: 128 });
  const rowHandle = latestAxisHandle(created, "row", 1);
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
  assert.equal(root.style.top, "166px");
  assert.equal(trigger.style.left, "360px");
  assert.equal(trigger.style.top, "141px");
  assert.equal(backdrop.hidden, false);
  assert.equal(backdrop.style.left, "120px");
  assert.equal(backdrop.style.width, "240px");
  assert.equal(backdrop.style.height, "34px");

  controller.selectAxis("column", 0);
  controller.toggleMenu("context", { open: true });

  assert.equal(controller.state.selection.kind, "column");
  assert.equal(root.style.top, "166px");
  assert.equal(trigger.style.left, "200px");
  assert.equal(trigger.style.top, "124px");
  assert.equal(backdrop.style.left, "120px");
  assert.equal(backdrop.style.width, "80px");
  assert.equal(backdrop.style.height, "68px");
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
  assert.equal(root.style.left, "152px");
  assert.equal(root.style.top, "132px");

  controller.destroy();
  assert.equal(editor.view.dom.listeners.size, 0);
});

test("Tiptap table toolbar anchors right-click menus to the pointer", () => {
  const { created, documentRef } = createDocument();
  const { cells, editor } = createTableHarness({
    mergeCells: () => true,
    setCellAttribute: () => true,
  });
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  editor.view.dom.listeners.get("contextmenu")({
    target: cells[1],
    clientX: 310,
    clientY: 240,
    preventDefault() {},
    stopPropagation() {},
  });

  const root = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-toolbar"),
  );
  assert.equal(controller.state.menuAnchorRect.left, 310);
  assert.equal(controller.state.menuAnchorRect.top, 240);
  assert.equal(root.style.left, "222px");
  assert.equal(root.style.top, "248px");
});

test("Tiptap table toolbar previews inline text cell surfaces without stealing text selection", () => {
  const { created, documentRef } = createDocument();
  const { calls, cells, editor } = createTableHarness({
    mergeCells: () => true,
    setCellAttribute: () => true,
  });
  editor.view.posAtCoords = ({ left, top }) => {
    calls.push(["posAtCoords", left, top]);
    return { pos: 12 };
  };
  editor.commands.setTextSelection = (position) => {
    calls.push(["setTextSelection", position]);
    return true;
  };
  const paragraph = {
    nodeType: 1,
    tagName: "P",
    parentElement: cells[0],
    parentNode: cells[0],
    textContent: "Alpha",
    closest(selector) {
      if (selector === "th,td") return cells[0];
      if (selector.includes(".mn-tiptap-table") || selector.includes(", table")) {
        return cells[0].closest(selector);
      }
      return null;
    },
    contains(target) {
      return target === this;
    },
  };
  const textNode = {
    nodeType: 3,
    parentElement: paragraph,
    parentNode: paragraph,
  };
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  assert.equal(
    editor.view.dom.listeners.get("pointerdown")({
      target: textNode,
      button: 0,
      clientX: 146,
      clientY: 104,
    }),
    false,
  );

  assert.equal(controller.state.selection.kind, "cell");
  assert.deepEqual([...controller.state.selection.positions], [10]);
  assert.equal(cells[0].classes.has("mn-tiptap-table-cell-selected"), true);
  const trigger = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-cell-menu-trigger"),
  );
  assert.equal(trigger.hidden, false);
  assert.equal(trigger.style.left, "200px");
  assert.equal(trigger.style.top, "107px");

  assert.equal(documentRef.listeners.has("pointermove"), true);
  assert.equal(documentRef.listeners.get("pointerup")?.length, 1);
  assert.deepEqual(calls, []);
  controller.refresh(editor);
  assert.equal(cells[0].classes.has("mn-tiptap-table-cell-selected"), true);
  assert.equal(trigger.hidden, false);
  assert.equal(controller.state.selection.positions.size, 1);
});

test("Tiptap table toolbar focuses filled cell surfaces on short clicks", () => {
  const { documentRef } = createDocument();
  const { calls, cells, editor } = createTableHarness();
  editor.view.posAtCoords = ({ left, top }) => {
    calls.push(["posAtCoords", left, top]);
    return { pos: 12 };
  };
  editor.commands.setTextSelection = (position) => {
    calls.push(["setTextSelection", position]);
    return true;
  };
  const paragraph = {
    nodeType: 1,
    tagName: "P",
    parentElement: cells[0],
    parentNode: cells[0],
    textContent: "Alpha",
    closest(selector) {
      if (selector === "th,td") return cells[0];
      if (selector.includes(".mn-tiptap-table") || selector.includes(", table")) {
        return cells[0].closest(selector);
      }
      return null;
    },
    contains(target) {
      return target === this;
    },
  };
  const textNode = {
    nodeType: 3,
    parentElement: paragraph,
    parentNode: paragraph,
  };
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  editor.view.dom.listeners.get("pointerdown")({
    target: textNode,
    button: 0,
    clientX: 146,
    clientY: 104,
  });

  documentRef.listeners.get("pointerup")?.({
    target: textNode,
    clientX: 146,
    clientY: 104,
  });

  assert.deepEqual(calls, [
    ["posAtCoords", 146, 104],
    ["setTextSelection", 12],
    ["focus"],
  ]);
});

test("Tiptap table toolbar leaves filled cell drag text selection native", () => {
  const { documentRef } = createDocument();
  const { calls, cells, editor } = createTableHarness();
  editor.view.posAtCoords = ({ left, top }) => {
    calls.push(["posAtCoords", left, top]);
    return { pos: 12 };
  };
  editor.commands.setTextSelection = (position) => {
    calls.push(["setTextSelection", position]);
    return true;
  };
  const paragraph = {
    nodeType: 1,
    tagName: "P",
    parentElement: cells[0],
    parentNode: cells[0],
    textContent: "Alpha",
    closest(selector) {
      if (selector === "th,td") return cells[0];
      if (selector.includes(".mn-tiptap-table") || selector.includes(", table")) {
        return cells[0].closest(selector);
      }
      return null;
    },
  };
  const textNode = {
    nodeType: 3,
    parentElement: paragraph,
    parentNode: paragraph,
  };
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  editor.view.dom.listeners.get("pointerdown")({
    target: textNode,
    button: 0,
    clientX: 146,
    clientY: 104,
  });
  documentRef.listeners.get("pointermove")?.({
    target: textNode,
    clientX: 168,
    clientY: 104,
    preventDefault() {
      calls.push(["preventDefault"]);
    },
    stopPropagation() {
      calls.push(["stopPropagation"]);
    },
  });
  documentRef.listeners.get("pointerup")?.({
    target: textNode,
    clientX: 168,
    clientY: 104,
  });

  assert.deepEqual(calls, []);
  assert.equal(controller.state.selection.positions.size, 1);
});

test("Tiptap table toolbar keeps native controls inside cells interactive", () => {
  const { documentRef } = createDocument();
  const { calls, cells, editor } = createTableHarness();
  const link = {
    nodeType: 1,
    tagName: "A",
    parentElement: cells[0],
    parentNode: cells[0],
    closest(selector) {
      if (selector.includes("a")) return link;
      if (selector === "th,td") return cells[0];
      if (selector.includes(".mn-tiptap-table") || selector.includes(", table")) {
        return cells[0].closest(selector);
      }
      return null;
    },
  };
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  assert.equal(
    editor.view.dom.listeners.get("pointerdown")({
      target: link,
      button: 0,
      clientX: 146,
      clientY: 104,
    }),
    false,
  );
  assert.deepEqual(calls, []);
  assert.equal(controller.state.selection.positions.size, 0);
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

  documentRef.emit("pointerup", { target: { id: "outside" } });

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

  documentRef.emit("pointerup", { target: table });

  assert.equal(controller.state.open, true);
  assert.notDeepEqual(view.calls.at(-1), ["hide"]);
});

test("Tiptap table toolbar keeps editor blur stable for table chrome and WebView focus races", () => {
  const { editor, table } = createTableHarness({
    mergeCells: () => true,
    setCellAttribute: () => true,
  });
  const view = createViewSpy();
  const documentRef = {
    body: { id: "body" },
  };
  const toolbarTarget = { id: "table-toolbar" };
  view.setContainedTarget(toolbarTarget);
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
    view,
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  assert.equal(controller.shouldKeepOpenOnEditorBlur(toolbarTarget), true);
  assert.equal(controller.shouldKeepOpenOnEditorBlur(table), true);
  assert.equal(controller.shouldKeepOpenOnEditorBlur(null), true);
  assert.equal(controller.shouldKeepOpenOnEditorBlur(documentRef.body), true);
  assert.equal(controller.shouldKeepOpenOnEditorBlur({ id: "outside" }), false);

  controller.close();
  assert.equal(controller.shouldKeepOpenOnEditorBlur(toolbarTarget), false);
});

test("Tiptap table toolbar keeps focus races inside the editor from dismissing menus", () => {
  const { editor } = createTableHarness({
    mergeCells: () => true,
    setCellAttribute: () => true,
  });
  const view = createViewSpy();
  const documentRef = createDismissDocument();
  const editorDom = editor.view.dom;
  const containsTableTarget = editorDom.contains.bind(editorDom);
  editorDom.contains = (target) => target === editorDom || containsTableTarget(target);
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
    view,
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  documentRef.emit("focusin", { type: "focusin", target: editorDom });
  assert.equal(controller.state.open, true);

  documentRef.emit("focusin", { type: "focusin", target: { id: "outside-focus" } });
  assert.equal(controller.state.open, false);
  assert.deepEqual(view.calls.at(-1), ["hide"]);
});

test("Tiptap table context menu survives editor scroll races", () => {
  const { editor } = createTableHarness({
    mergeCells: () => true,
    setCellAttribute: () => true,
  });
  const view = createViewSpy();
  const documentRef = createDismissDocument();
  const editorDom = editor.view.dom;
  const containsTableTarget = editorDom.contains.bind(editorDom);
  editorDom.contains = (target) => target === editorDom || containsTableTarget(target);
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
    view,
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  controller.openCellMenu("context");

  documentRef.emit("scroll", { type: "scroll", target: editorDom });

  assert.equal(controller.state.open, true);
  assert.equal(controller.state.menuOpen, true);
  assert.notDeepEqual(view.calls.at(-1), ["hide"]);

  documentRef.emit("scroll", { type: "scroll", target: { id: "outside-scroll" } });
  assert.equal(controller.state.open, false);
  assert.deepEqual(view.calls.at(-1), ["hide"]);
});
