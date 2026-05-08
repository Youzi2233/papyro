import test from "node:test";
import assert from "node:assert/strict";

import {
  createComplexBlockInsertChromeState,
  createTableAxisHandleChromeState,
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
  const grid = Array.from({ length: 2 }, (_, rowIndex) => ({
    rowIndex,
    rect: rect(120, 90 + rowIndex * 34, 240, 34),
    cells: Array.from({ length: 3 }, (_, columnIndex) => {
      const cell = {
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
      return item;
    }),
  }));

  return { cells, grid, tableRect: rect(120, 90, 240, 68) };
}

function baseState(overrides = {}) {
  const fixture = overrides.fixture ?? createGrid();
  const { cells, grid, tableRect } = fixture;
  const { fixture: _fixture, ...rest } = overrides;
  return {
    rect: tableRect,
    grid,
    table: { id: "table" },
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
});

test("table chrome model keeps the cell action trigger quiet until selected or edge-hovered", () => {
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
  assert.equal(edge.visible, true);
  assert.equal(edge.edgeIntent, true);
  assert.equal(edge.trigger.left, 200);
  assert.equal(edge.trigger.placement, "edge");

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
  assert.equal(range.trigger.placement, "center");
  assert.equal(range.trigger.left, 280);
});

test("table chrome model limits axis handles to the hovered first row or column cell", () => {
  const fixture = createGrid();
  const { cells } = fixture;
  const row = createTableAxisHandleChromeState(baseState({
    fixture,
    hover: {
      edge: "cell",
      rowIndex: 1,
      columnIndex: 0,
      cell: cells[3].cell,
    },
  }));
  assert.deepEqual(row.rows.map((handle) => handle.index), [1]);
  assert.deepEqual(row.columns, []);

  const column = createTableAxisHandleChromeState(baseState({
    fixture,
    hover: {
      edge: "cell",
      rowIndex: 0,
      columnIndex: 2,
      cell: cells[2].cell,
    },
  }));
  assert.deepEqual(column.rows, []);
  assert.deepEqual(column.columns.map((handle) => handle.index), [2]);

  const selectedHoverState = baseState({
    fixture,
    hover: {
      edge: "cell",
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
  assert.deepEqual(selectedHover.rows, []);
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
});
