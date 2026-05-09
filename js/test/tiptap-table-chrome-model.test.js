import test from "node:test";
import assert from "node:assert/strict";

import {
  applyTableCellVisualState,
  clearTableCellVisualState,
  createComplexBlockInsertChromeState,
  createTableAxisHoverChromeState,
  createTableAxisHandleChromeState,
  createTableCellObjectSelectionChromeState,
  createTableCellMenuTriggerChromeState,
  createTableQuickAddChromeState,
  createTableSelectionBackdropChromeState,
  hoveredTableCellIsSelected,
  tableMenuAnchorRect,
} from "../src/tiptap-table-chrome-model.js";

function rect(left, top, width, height) {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
}

function createGrid() {
  const cells = [];
  const cellElements = [];
  const grid = Array.from({ length: 2 }, (_, rowIndex) => ({
    rowIndex,
    rect: rect(120, 90 + rowIndex * 34, 240, 34),
    cells: Array.from({ length: 3 }, (_, columnIndex) => {
      const cell = {
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
        getBoundingClientRect: () =>
          rect(120 + columnIndex * 80, 90 + rowIndex * 34, 80, 34),
      };
      const item = {
        cell,
        rowIndex,
        columnIndex,
        pos: 10 + rowIndex * 3 + columnIndex,
        rect: cell.getBoundingClientRect(),
      };
      cells.push(item);
      cellElements.push(cell);
      return item;
    }),
  }));

  const table = {
    querySelectorAll(selector) {
      if (selector === ".mn-tiptap-table-cell-selected") {
        return cellElements.filter((cell) =>
          cell.classes.has("mn-tiptap-table-cell-selected"),
        );
      }
      if (selector === ".mn-tiptap-table-cell-active") {
        return cellElements.filter((cell) =>
          cell.classes.has("mn-tiptap-table-cell-active"),
        );
      }
      if (selector === ".mn-tiptap-table-cell-hovered-row") {
        return cellElements.filter((cell) =>
          cell.classes.has("mn-tiptap-table-cell-hovered-row"),
        );
      }
      if (selector === ".mn-tiptap-table-cell-hovered-column") {
        return cellElements.filter((cell) =>
          cell.classes.has("mn-tiptap-table-cell-hovered-column"),
        );
      }
      return [];
    },
  };

  return { cells, cellElements, grid, table, tableRect: rect(120, 90, 240, 68) };
}

function baseState(overrides = {}) {
  const fixture = overrides.fixture ?? createGrid();
  const { cells, grid, tableRect } = fixture;
  const { fixture: _fixture, ...rest } = overrides;
  return {
    rect: tableRect,
    grid,
    table: fixture.table ?? { id: "table" },
    cell: cells[0].cell,
    cellRect: cells[0].rect,
    selection: {
      kind: "cell",
      positions: new Set(),
      rows: [],
      columns: [],
    },
    hover: null,
    menuOpen: false,
    mode: "context",
    commands: [
      { id: "add-row-after", disabled: false },
      { id: "add-column-after", disabled: false },
    ],
    ...rest,
  };
}

test("table chrome model chooses menu anchors by selection kind", () => {
  assert.equal(tableMenuAnchorRect(baseState({ menuAnchorRect: rect(1, 2, 3, 4) })).left, 1);
  assert.equal(tableMenuAnchorRect(baseState({ mode: "keyboard" })).left, 120);
  assert.equal(tableMenuAnchorRect(baseState({ selection: { kind: "row" }, menuRect: rect(9, 9, 1, 1) })).left, 9);
});

test("table chrome model applies and clears cell visual state", () => {
  const fixture = createGrid();
  const { cellElements, cells, table } = fixture;

  assert.equal(
    applyTableCellVisualState(baseState({ fixture })),
    true,
  );
  assert.equal(cellElements[0].classes.has("mn-tiptap-table-cell-active"), true);
  assert.equal(
    cellElements.some((cell) => cell.classes.has("mn-tiptap-table-cell-selected")),
    false,
  );

  applyTableCellVisualState(baseState({
    fixture,
    cell: cells[0].cell,
    selection: {
      kind: "cell",
      positions: new Set([11]),
      rows: [],
      columns: [],
    },
  }));
  assert.deepEqual(
    cellElements.map((cell) => [
      cell.classes.has("mn-tiptap-table-cell-selected"),
      cell.classes.has("mn-tiptap-table-cell-active"),
    ]),
    [
      [false, false],
      [true, true],
      [false, false],
      [false, false],
      [false, false],
      [false, false],
    ],
  );

  applyTableCellVisualState(baseState({
    fixture,
    cell: cells[0].cell,
    selection: {
      kind: "cells",
      positions: new Set([10, 11]),
      rows: [],
      columns: [],
    },
  }));
  assert.deepEqual(
    cellElements.map((cell) => cell.classes.has("mn-tiptap-table-cell-selected")),
    [true, true, false, false, false, false],
  );
  assert.equal(
    cellElements.some((cell) => cell.classes.has("mn-tiptap-table-cell-active")),
    false,
  );

  clearTableCellVisualState(table);
  assert.equal(
    cellElements.some((cell) =>
      cell.classes.has("mn-tiptap-table-cell-selected") ||
      cell.classes.has("mn-tiptap-table-cell-active"),
    ),
    false,
  );
});

test("table chrome model exposes quick-add rails only on intentional table edges", () => {
  const fixture = createGrid();
  const { cells } = fixture;
  const rowState = baseState({
    fixture,
    hover: {
      rowIndex: 1,
      columnIndex: 1,
      edge: "add-row",
      cell: cells[4].cell,
    },
  });
  const columnState = baseState({
    fixture,
    hover: {
      rowIndex: 0,
      columnIndex: 2,
      edge: "add-column",
      cell: cells[2].cell,
    },
  });
  const idleState = baseState({
    fixture,
    hover: {
      rowIndex: 1,
      columnIndex: 1,
      edge: "cell",
      cell: cells[4].cell,
    },
  });

  assert.equal(createTableQuickAddChromeState(rowState).row.visible, true);
  assert.equal(createTableQuickAddChromeState(rowState).column.visible, false);
  assert.equal(createTableQuickAddChromeState(columnState).row.visible, false);
  assert.equal(createTableQuickAddChromeState(columnState).column.visible, true);
  assert.equal(createTableQuickAddChromeState(idleState).row.visible, false);

  assert.deepEqual(createTableQuickAddChromeState(rowState).row.visual, {
    left: 120,
    top: 158,
    width: 240,
    height: 14,
  });
  assert.equal(createTableQuickAddChromeState(rowState).row.top, 155);
  assert.equal(createTableQuickAddChromeState(rowState).row.height, 20);
  assert.deepEqual(createTableQuickAddChromeState(columnState).column.visual, {
    left: 360,
    top: 90,
    width: 14,
    height: 68,
  });
  assert.equal(createTableQuickAddChromeState(columnState).column.left, 357);
  assert.equal(createTableQuickAddChromeState(columnState).column.width, 20);
});

test("table chrome model keeps the cell action trigger quiet until selected", () => {
  const fixture = createGrid();
  const { cells } = fixture;

  assert.equal(createTableCellMenuTriggerChromeState(baseState({ fixture })).visible, false);

  const edge = createTableCellMenuTriggerChromeState(baseState({
    fixture,
    hover: {
      edge: "cell-menu",
      cell: cells[0].cell,
      cellRect: cells[0].rect,
    },
  }));
  assert.equal(edge.visible, false);
  assert.equal(edge.actionScope, "cell");
  assert.equal(edge.edgeIntent, true);
  assert.equal(edge.trigger, null);

  const selected = createTableCellMenuTriggerChromeState(baseState({
    fixture,
    selection: {
      kind: "cell",
      positions: new Set([10]),
      rows: [],
      columns: [],
    },
  }));
  assert.equal(selected.visible, true);
  assert.equal(selected.trigger.placement, "quiet-edge");

  const selectedFromGrid = createTableCellMenuTriggerChromeState(baseState({
    fixture,
    cell: cells[0].cell,
    cellRect: cells[0].rect,
    selection: {
      kind: "cell",
      positions: new Set([11]),
      rows: [],
      columns: [],
    },
  }));
  assert.equal(selectedFromGrid.visible, true);
  assert.equal(selectedFromGrid.trigger.left, 280);
  assert.equal(selectedFromGrid.trigger.top, 107);

  const range = createTableCellMenuTriggerChromeState(baseState({
    fixture,
    selection: {
      kind: "cells",
      positions: new Set([10, 11]),
      rows: [],
      columns: [],
    },
    menuRect: rect(200, 90, 80, 34),
  }));
  assert.equal(range.visible, true);
  assert.equal(range.actionScope, "cells");
  assert.equal(range.trigger.placement, "center");
  assert.equal(range.trigger.left, 280);
});

test("table chrome model exposes per-cell fill boxes with a single object outline", () => {
  const fixture = createGrid();
  const chrome = createTableCellObjectSelectionChromeState(baseState({
    fixture,
    selection: {
      kind: "cells",
      positions: new Set([10, 11]),
      rows: [],
      columns: [],
    },
  }));

  assert.equal(chrome.visible, true);
  assert.equal(chrome.selectedCount, 2);
  assert.deepEqual(chrome.boxes.map((box) => [box.left, box.top, box.width, box.height]), [
    [120, 90, 80, 34],
    [200, 90, 80, 34],
  ]);
  assert.deepEqual(chrome.outline, rect(120, 90, 160, 34));
});

test("table chrome model exposes semantic action scopes for axis selections", () => {
  const fixture = createGrid();
  const row = createTableCellMenuTriggerChromeState(baseState({
    fixture,
    selection: {
      kind: "row",
      positions: new Set([10, 11, 12]),
      rows: [0],
      columns: [],
    },
    selectionRect: rect(120, 90, 240, 34),
    menuRect: rect(120, 90, 240, 34),
  }));
  assert.equal(row.visible, true);
  assert.equal(row.actionScope, "row");
  assert.equal(row.trigger.placement, "quiet-edge");
  assert.equal(row.trigger.left, 360);
  assert.equal(row.trigger.top, 107);

  const column = createTableCellMenuTriggerChromeState(baseState({
    fixture,
    selection: {
      kind: "column",
      positions: new Set([10, 13]),
      rows: [],
      columns: [0],
    },
    selectionRect: rect(120, 90, 80, 68),
    menuRect: rect(120, 90, 80, 68),
  }));
  assert.equal(column.visible, true);
  assert.equal(column.actionScope, "column");
  assert.equal(column.trigger.left, 200);
  assert.equal(column.trigger.top, 124);

  const table = createTableCellMenuTriggerChromeState(baseState({
    fixture,
    selection: {
      kind: "table",
      positions: new Set([10, 11, 12, 13, 14, 15]),
      rows: [0, 1],
      columns: [0, 1, 2],
    },
    selectionRect: rect(120, 90, 240, 68),
    menuRect: rect(120, 90, 240, 68),
  }));
  assert.equal(table.visible, true);
  assert.equal(table.actionScope, "table");
  assert.equal(table.trigger.left, 360);
  assert.equal(table.trigger.top, 124);
});

test("table chrome model reveals row and column handles from the hovered cell", () => {
  const fixture = createGrid();
  const { cells } = fixture;
  const rowIdle = createTableAxisHandleChromeState(baseState({
    fixture,
    hover: {
      edge: "cell",
      rowIndex: 1,
      columnIndex: 0,
      cell: cells[3].cell,
    },
  }));
  assert.deepEqual(rowIdle.rows.map((handle) => handle.index), [1]);
  assert.deepEqual(rowIdle.columns.map((handle) => handle.index), [0]);

  const row = createTableAxisHandleChromeState(baseState({
    fixture,
    hover: {
      edge: "row-handle",
      rowIndex: 1,
      columnIndex: 0,
      cell: cells[3].cell,
    },
  }));
  assert.deepEqual(row.rows.map((handle) => handle.index), [1]);
  assert.deepEqual(row.columns, []);

  const columnIdle = createTableAxisHandleChromeState(baseState({
    fixture,
    hover: {
      edge: "cell",
      rowIndex: 0,
      columnIndex: 2,
      cell: cells[2].cell,
    },
  }));
  assert.deepEqual(columnIdle.rows.map((handle) => handle.index), [0]);
  assert.deepEqual(columnIdle.columns.map((handle) => handle.index), [2]);

  const column = createTableAxisHandleChromeState(baseState({
    fixture,
    hover: {
      edge: "column-handle",
      rowIndex: 0,
      columnIndex: 2,
      cell: cells[2].cell,
    },
  }));
  assert.deepEqual(column.rows, []);
  assert.deepEqual(column.columns.map((handle) => handle.index), [2]);

  const corner = createTableAxisHandleChromeState(baseState({
    fixture,
    hover: {
      edge: "axis-corner",
      rowIndex: 0,
      columnIndex: 0,
      cell: cells[0].cell,
    },
  }));
  assert.deepEqual(corner.rows.map((handle) => handle.index), [0]);
  assert.deepEqual(corner.columns.map((handle) => handle.index), [0]);

  const selectedHoverState = baseState({
    fixture,
    hover: {
      edge: "row-handle",
      rowIndex: 1,
      columnIndex: 0,
      cell: cells[3].cell,
    },
    selection: {
      kind: "cell",
      positions: new Set([13]),
      rows: [],
      columns: [],
    },
  });
  const selectedHover = createTableAxisHandleChromeState(selectedHoverState);
  assert.equal(hoveredTableCellIsSelected(selectedHoverState), true);
  assert.deepEqual(selectedHover.rows.map((handle) => handle.index), [1]);
  assert.deepEqual(selectedHover.columns, []);
});

test("table chrome model exposes continuous axis hover backdrops", () => {
  const fixture = createGrid();
  const { cells } = fixture;

  const column = createTableAxisHoverChromeState(baseState({
    fixture,
    hover: {
      edge: "column-handle",
      rowIndex: 0,
      columnIndex: 1,
      cell: cells[1].cell,
    },
  }));
  assert.deepEqual(
    column.columns.map((item) => [
      item.index,
      item.rect.left,
      item.rect.top,
      item.rect.width,
      item.rect.height,
    ]),
    [[1, 200, 90, 80, 68]],
  );
  assert.deepEqual(column.rows, []);

  const row = createTableAxisHoverChromeState(baseState({
    fixture,
    hover: {
      edge: "row-handle",
      rowIndex: 1,
      columnIndex: 0,
      cell: cells[3].cell,
    },
  }));
  assert.deepEqual(
    row.rows.map((item) => [
      item.index,
      item.rect.left,
      item.rect.top,
      item.rect.width,
      item.rect.height,
    ]),
    [[1, 120, 124, 240, 34]],
  );
  assert.deepEqual(row.columns, []);
});

test("table chrome model positions selection backdrop and complex block insert rail", () => {
  const backdrop = createTableSelectionBackdropChromeState(baseState({
    selection: {
      kind: "row",
      positions: new Set([10, 11, 12]),
      rows: [0],
      columns: [],
    },
    selectionRect: rect(120, 90, 240, 34),
  }));
  assert.equal(backdrop.visible, true);
  assert.equal(backdrop.rect.width, 240);
  assert.equal(backdrop.selectionKind, "row");
  assert.equal(backdrop.selectedCount, 3);

  const singleCellBackdrop = createTableSelectionBackdropChromeState(baseState({
    selection: {
      kind: "cell",
      positions: new Set([11]),
      rows: [],
      columns: [],
    },
    selectionRect: rect(200, 90, 80, 34),
  }));
  assert.equal(singleCellBackdrop.visible, true);
  assert.equal(singleCellBackdrop.selectionKind, "cell");
  assert.equal(singleCellBackdrop.selectedCount, 1);
  assert.equal(singleCellBackdrop.rect.left, 200);

  const block = { id: "code" };
  const insert = createComplexBlockInsertChromeState(baseState({
    table: null,
    complexBlock: block,
    complexRect: rect(160, 140, 360, 80),
    hover: {
      edge: "block-after",
      block,
    },
  }));
  assert.deepEqual(insert.rect, { left: 160, top: 222, width: 360 });
  assert.equal(insert.visible, true);
  assert.equal(insert.blockKind, "complex");
  assert.equal(insert.edge, "after");

  const beforeInsert = createComplexBlockInsertChromeState(baseState({
    table: null,
    complexBlock: block,
    complexRect: rect(160, 140, 360, 80),
    hover: {
      edge: "block-before",
      block,
    },
  }));
  assert.deepEqual(beforeInsert.rect, { left: 160, top: 120, width: 360 });
  assert.equal(beforeInsert.visible, true);
  assert.equal(beforeInsert.edge, "before");
});
