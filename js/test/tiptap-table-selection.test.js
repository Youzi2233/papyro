import test from "node:test";
import assert from "node:assert/strict";

import { createTiptapTableToolbarController } from "../src/tiptap-table-toolbar.js";

function createHarness() {
  const calls = [];
  const listeners = new Map();
  const documentListeners = new Map();
  const cells = [];
  let table = null;
  const rows = Array.from({ length: 2 }, (_, rowIndex) => {
    const rowCells = Array.from({ length: 2 }, (_, columnIndex) => {
      const cell = {
        nodeType: 1,
        tagName: "TD",
        rowIndex,
        columnIndex,
        classes: new Set(),
        classList: {
          add(name) {
            cell.classes.add(name);
          },
          remove(name) {
            cell.classes.delete(name);
          },
          toggle(name, enabled) {
            enabled ? cell.classes.add(name) : cell.classes.delete(name);
          },
          contains(name) {
            return cell.classes.has(name);
          },
        },
        parentElement: null,
        get parentNode() {
          return cell.parentElement;
        },
        closest(selector) {
          if (selector === "th,td") return cell;
          if (selector.includes("table")) return table;
          return null;
        },
        getBoundingClientRect: () => ({
          left: 100 + columnIndex * 90,
          top: 80 + rowIndex * 36,
          right: 190 + columnIndex * 90,
          bottom: 116 + rowIndex * 36,
          width: 90,
          height: 36,
        }),
      };
      cells.push(cell);
      return cell;
    });
    return {
      cells: rowCells,
      getBoundingClientRect: () => ({
        left: 100,
        top: 80 + rowIndex * 36,
        right: 280,
        bottom: 116 + rowIndex * 36,
        width: 180,
        height: 36,
      }),
      querySelectorAll(selector) {
        return selector === "th,td" ? rowCells : [];
      },
    };
  });
  rows.forEach((row) =>
    row.cells.forEach((cell) => {
      cell.parentElement = row;
    }),
  );
  const documentRef = {
    body: { appendChild() {} },
    documentElement: { clientWidth: 1000, clientHeight: 800 },
    addEventListener(type, listener) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(listener);
    },
    removeEventListener(type, listener) {
      const next = (documentListeners.get(type) ?? []).filter((item) => item !== listener);
      if (next.length > 0) {
        documentListeners.set(type, next);
      } else {
        documentListeners.delete(type);
      }
    },
    get parentNode() {
      return null;
    },
  };
  const root = {
    ownerDocument: documentRef,
    listeners,
    contains: (target) => target === table || cells.includes(target),
    parentElement: null,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
  table = {
    className: "mn-tiptap-table",
    ownerDocument: documentRef,
    parentElement: root,
    classList: {
      contains(name) {
        return name === "mn-tiptap-table";
      },
    },
    closest(selector) {
      return selector.includes("table") ? table : null;
    },
    get parentNode() {
      return table.parentElement;
    },
    contains: (target) => target === table || cells.includes(target),
    getBoundingClientRect: () => ({ left: 100, top: 80, right: 280, bottom: 152 }),
    querySelectorAll(selector) {
      if (selector === "tr") return rows;
      if (selector === ".mn-tiptap-table-cell-selected") {
        return cells.filter((cell) => cell.classes.has("mn-tiptap-table-cell-selected"));
      }
      if (selector === ".mn-tiptap-table-cell-active") {
        return cells.filter((cell) => cell.classes.has("mn-tiptap-table-cell-active"));
      }
      if (selector === "th,td") return cells;
      return [];
    },
  };
  const editor = {
    state: { selection: { from: 4 } },
    view: {
      dom: root,
      domAtPos: () => ({ node: cells[0] }),
      posAtDOM(target) {
        return cells.indexOf(target) + 10;
      },
    },
    commands: {
      addRowAfter: () => true,
      setCellAttribute: () => true,
      focus: () => calls.push(["focus"]),
      setCellSelection(selection) {
        calls.push(["setCellSelection", selection.anchorCell, selection.headCell]);
        const positioned = cells.map((cell, index) => ({ cell, pos: index + 10 }));
        const anchor = positioned.find((item) => item.pos === selection.anchorCell);
        const head = positioned.find((item) => item.pos === selection.headCell);
        const minRow = Math.min(anchor.cell.rowIndex, head.cell.rowIndex);
        const maxRow = Math.max(anchor.cell.rowIndex, head.cell.rowIndex);
        const minColumn = Math.min(anchor.cell.columnIndex, head.cell.columnIndex);
        const maxColumn = Math.max(anchor.cell.columnIndex, head.cell.columnIndex);
        const selectedPositions = positioned
          .filter(
            (item) =>
              item.cell.rowIndex >= minRow &&
              item.cell.rowIndex <= maxRow &&
              item.cell.columnIndex >= minColumn &&
              item.cell.columnIndex <= maxColumn,
          )
          .map((item) => item.pos);
        editor.state.selection = {
          from: 4,
          $anchorCell: { pos: selection.anchorCell },
          $headCell: { pos: selection.headCell },
          forEachCell(callback) {
            selectedPositions.forEach((pos) => callback({}, pos));
          },
        };
        return true;
      },
    },
  };

  return { calls, cells, documentListeners, documentRef, editor, root };
}

test("Tiptap table cell pointerdown selects the clicked cell", () => {
  const { calls, cells, editor, root } = createHarness();
  const controller = createTiptapTableToolbarController({
    dom: { document: root.ownerDocument },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  assert.equal(
    root.listeners.get("pointerdown")({
      target: cells[1],
      button: 0,
      clientX: 220,
      clientY: 96,
      preventDefault() {},
      stopPropagation() {},
    }),
    true,
  );

  assert.deepEqual(calls.slice(0, 2), [
    ["setCellSelection", 11, 11],
    ["focus"],
  ]);
  assert.equal(controller.state.selection.kind, "cell");
  assert.deepEqual([...controller.state.selection.positions], [11]);
  assert.equal(cells[1].classes.has("mn-tiptap-table-cell-selected"), false);
  assert.equal(controller.state.selection.kind, "cell");
  assert.deepEqual([...controller.state.selection.positions], [11]);
});

test("Tiptap table cell drag extends the selected cell range", () => {
  const { calls, cells, documentListeners, editor, root } = createHarness();
  const controller = createTiptapTableToolbarController({
    dom: { document: root.ownerDocument },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  root.listeners.get("pointerdown")({
    target: cells[0],
    button: 0,
    clientX: 120,
    clientY: 94,
    preventDefault() {},
    stopPropagation() {},
  });
  documentListeners.get("pointermove").at(-1)({
    target: cells[3],
    clientX: 230,
    clientY: 134,
    preventDefault() {},
    stopPropagation() {},
  });
  documentListeners.get("pointerup").at(-1)({ preventDefault() {}, stopPropagation() {} });

  assert.deepEqual(calls.filter((call) => call[0] === "setCellSelection"), [
    ["setCellSelection", 10, 10],
    ["setCellSelection", 10, 13],
  ]);
  assert.equal(controller.state.selection.kind, "cell");
  controller.refresh(editor);
  assert.equal(controller.state.selection.kind, "table");
  assert.deepEqual([...controller.state.selection.positions], [10, 11, 12, 13]);
  assert.equal((documentListeners.get("pointermove") ?? []).length, 1);
});
