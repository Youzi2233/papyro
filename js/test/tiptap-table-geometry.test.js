import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizedRect,
  tableAxisHandleGeometry,
  tableCellMenuTriggerGeometry,
  tableHoverWithIntent,
  tableQuickAddGeometry,
  complexBlockInsertEdge,
  hoverIsNearComplexBlockBottom,
  hoverIsNearComplexBlockTop,
  sameTableHover,
} from "../src/tiptap-table-geometry.js";

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

function createTableGeometryHarness() {
  const cells = [];
  const grid = Array.from({ length: 2 }, (_, rowIndex) => ({
    rowIndex,
    rect: normalizedRect(rect(120, 90 + rowIndex * 34, 240, 34)),
    cells: Array.from({ length: 3 }, (_, columnIndex) => {
      const cell = {
        tagName: "TD",
        closest(selector) {
          if (selector === "th,td") return cell;
          if (selector.includes("table")) return table;
          return null;
        },
        getBoundingClientRect() {
          return rect(120 + columnIndex * 80, 90 + rowIndex * 34, 80, 34);
        },
      };
      cells.push(cell);
      return {
        cell,
        rowIndex,
        columnIndex,
        pos: 10 + rowIndex * 3 + columnIndex,
        rect: normalizedRect(cell.getBoundingClientRect()),
      };
    }),
  }));
  const table = {
    contains(target) {
      return target === table || cells.includes(target);
    },
  };
  return {
    cells,
    grid,
    table,
    tableRect: normalizedRect(rect(120, 90, 240, 68)),
  };
}

test("Tiptap table geometry classifies low-noise hover intent", () => {
  const { cells, grid, table, tableRect } = createTableGeometryHarness();
  const classify = (cellIndex, clientX, clientY) =>
    tableHoverWithIntent({
      target: cells[cellIndex],
      table,
      grid,
      tableRect,
      clientX,
      clientY,
      rowHandleWidth: 20,
      columnHandleHeight: 20,
    })?.edge;

  assert.equal(classify(4, 202, 128), "cell");
  assert.equal(classify(0, 122, 92), "axis-corner");
  assert.equal(classify(3, 122, 128), "row-handle");
  assert.equal(classify(3, 126, 128), "cell");
  assert.equal(classify(3, 124, 128), "row-handle");
  assert.equal(classify(3, 108, 128), "row-handle");
  assert.equal(classify(1, 204, 92), "column-handle");
  assert.equal(classify(1, 204, 97), "cell");
  assert.equal(classify(1, 204, 95), "column-handle");
  assert.equal(classify(1, 204, 76), "column-handle");
  assert.equal(classify(5, 356, 140), "cell");
  assert.equal(classify(3, 160, 154), "cell");
  assert.equal(classify(5, 359, 152), "cell");
  assert.equal(classify(5, 318, 156), "cell");
  assert.equal(classify(0, 194, 115), "cell");
  assert.equal(classify(0, 195, 107), "cell");
  assert.equal(classify(0, 197, 107), "cell-menu");
  assert.equal(classify(0, 195, 123), "cell");
});

test("Tiptap table geometry infers gutter handles from table coordinates", () => {
  const { grid, table, tableRect } = createTableGeometryHarness();
  const classify = (target, clientX, clientY) =>
    tableHoverWithIntent({
      target,
      table,
      grid,
      tableRect,
      clientX,
      clientY,
      rowHandleWidth: 20,
      columnHandleHeight: 20,
    })?.edge;

  assert.equal(classify(table, 108, 128), "row-handle");
  assert.equal(classify(table, 204, 76), "column-handle");
  assert.equal(classify(table, 160, 162), "add-row");
  assert.equal(classify(table, 366, 140), "add-column");
  assert.equal(classify(table, 160, 171), undefined);
  assert.equal(classify(table, 373, 140), undefined);
});

test("Tiptap table geometry limits gutter handles to their visible rails", () => {
  const { grid, table, tableRect } = createTableGeometryHarness();
  const editorSurface = { tagName: "DIV" };
  const classify = (clientX, clientY) =>
    tableHoverWithIntent({
      target: editorSurface,
      table,
      grid,
      tableRect,
      clientX,
      clientY,
      rowHandleWidth: 20,
      columnHandleHeight: 20,
      allowRailTarget: true,
    })?.edge;

  assert.equal(classify(108, 128), "row-handle");
  assert.equal(classify(119, 128), undefined);
  assert.equal(classify(204, 76), "column-handle");
  assert.equal(classify(204, 89), undefined);
});

test("Tiptap table geometry reserves the outer bottom rail for adding rows", () => {
  const { grid, table, tableRect } = createTableGeometryHarness();

  const hover = tableHoverWithIntent({
    target: table,
    table,
    grid,
    tableRect,
    clientX: 240,
    clientY: 160,
      rowHandleWidth: 20,
      columnHandleHeight: 20,
  });

  assert.equal(hover.edge, "add-row");
  assert.equal(hover.block, table);
});

test("Tiptap table geometry treats flush table edges as quick add rails", () => {
  const { cells, grid, table, tableRect } = createTableGeometryHarness();
  const classify = (target, clientX, clientY) =>
    tableHoverWithIntent({
      target,
      table,
      grid,
      tableRect,
      clientX,
      clientY,
      rowHandleWidth: 20,
      columnHandleHeight: 20,
      allowRailTarget: true,
    })?.edge;

  assert.equal(classify(table, 240, 158), "add-row");
  assert.equal(classify(table, 360, 140), "add-column");
  assert.equal(classify(cells[5], 359, 152), "cell");
  assert.equal(classify(table, 240, 171), undefined);
  assert.equal(classify(table, 373, 140), undefined);
});

test("Tiptap table geometry keeps quick add intent on real grid rails", () => {
  const { grid, table } = createTableGeometryHarness();
  const wrapperRect = normalizedRect(rect(100, 80, 300, 130));
  const classify = (clientX, clientY) =>
    tableHoverWithIntent({
      target: table,
      table,
      grid,
      tableRect: wrapperRect,
      clientX,
      clientY,
      rowHandleWidth: 20,
      columnHandleHeight: 20,
      allowRailTarget: true,
    })?.edge;

  assert.equal(classify(240, 160), "add-row");
  assert.equal(classify(366, 140), "add-column");
  assert.equal(classify(240, 214), undefined);
  assert.equal(classify(406, 140), undefined);
});

test("Tiptap table geometry treats pointer jitter inside one target as the same hover intent", () => {
  const { cells, grid, table, tableRect } = createTableGeometryHarness();
  const base = tableHoverWithIntent({
    target: cells[0],
    table,
    grid,
    tableRect,
    clientX: 150,
    clientY: 108,
    rowHandleWidth: 20,
    columnHandleHeight: 20,
  });
  const moved = tableHoverWithIntent({
    target: cells[0],
    table,
    grid,
    tableRect,
    clientX: 160,
    clientY: 110,
    rowHandleWidth: 20,
    columnHandleHeight: 20,
  });

  assert.equal(base.edge, "cell");
  assert.equal(moved.edge, "cell");
  assert.equal(sameTableHover(base, moved), true);
});

test("Tiptap table geometry does not infer table rails from adjacent complex blocks", () => {
  const { grid, table, tableRect } = createTableGeometryHarness();
  const codeBlock = {
    tagName: "PRE",
    closest() {
      return null;
    },
  };

  assert.equal(
    tableHoverWithIntent({
      target: codeBlock,
      table,
      grid,
      tableRect,
      clientX: 240,
      clientY: 160,
      rowHandleWidth: 20,
      columnHandleHeight: 20,
    }),
    null,
  );
  assert.equal(
    tableHoverWithIntent({
      target: codeBlock,
      table,
      grid,
      tableRect,
      clientX: 366,
      clientY: 140,
      rowHandleWidth: 20,
      columnHandleHeight: 20,
    }),
    null,
  );
});

test("Tiptap complex block insert uses a forgiving independent bottom zone", () => {
  const blockRect = normalizedRect(rect(120, 90, 240, 68));

  assert.equal(hoverIsNearComplexBlockBottom(blockRect, 139), false);
  assert.equal(hoverIsNearComplexBlockBottom(blockRect, 140), true);
  assert.equal(hoverIsNearComplexBlockBottom(blockRect, 158), true);
  assert.equal(hoverIsNearComplexBlockBottom(blockRect, 176), true);
  assert.equal(hoverIsNearComplexBlockBottom(blockRect, 177), false);
});

test("Tiptap complex block insert distinguishes top and bottom edges", () => {
  const blockRect = normalizedRect(rect(120, 90, 240, 68));

  assert.equal(hoverIsNearComplexBlockTop(blockRect, 71), false);
  assert.equal(hoverIsNearComplexBlockTop(blockRect, 72), true);
  assert.equal(hoverIsNearComplexBlockTop(blockRect, 90), true);
  assert.equal(hoverIsNearComplexBlockTop(blockRect, 108), true);
  assert.equal(hoverIsNearComplexBlockTop(blockRect, 109), false);
  assert.equal(complexBlockInsertEdge(blockRect, 92), "before");
  assert.equal(complexBlockInsertEdge(blockRect, 156), "after");
  assert.equal(complexBlockInsertEdge(blockRect, 120), null);
});

test("Tiptap table geometry positions quick add rails on real grid edges", () => {
  const { grid, tableRect } = createTableGeometryHarness();

  assert.deepEqual(tableQuickAddGeometry(grid, tableRect), {
    row: {
      left: 120,
      top: 158,
      width: 240,
      height: 12,
      rail: 240,
    },
    column: {
      left: 360,
      top: 90,
      width: 12,
      height: 68,
      rail: 68,
    },
  });

  assert.deepEqual(tableQuickAddGeometry(grid, tableRect, { hitSlop: 3 }), {
    row: {
      left: 120,
      top: 155,
      width: 240,
      height: 18,
      rail: 240,
      visual: {
        left: 120,
        top: 158,
        width: 240,
        height: 12,
      },
    },
    column: {
      left: 357,
      top: 90,
      width: 18,
      height: 68,
      rail: 68,
      visual: {
        left: 360,
        top: 90,
        width: 12,
        height: 68,
      },
    },
  });
});

test("Tiptap table geometry positions row column handles and scoped cell menus", () => {
  const { grid, tableRect } = createTableGeometryHarness();
  const axis = tableAxisHandleGeometry(grid, tableRect);

  assert.equal(axis.table, null);
  assert.deepEqual(axis.rows.map((handle) => [
    handle.index,
    handle.left,
    handle.top,
    handle.width,
    handle.height,
  ]), [
    [0, 100, 90, 18, 34],
    [1, 100, 124, 18, 34],
  ]);
  assert.deepEqual(axis.columns.map((handle) => [
    handle.index,
    handle.left,
    handle.top,
    handle.width,
    handle.height,
  ]), [
    [0, 120, 70, 80, 18],
    [1, 200, 70, 80, 18],
    [2, 280, 70, 80, 18],
  ]);

  assert.deepEqual(
    tableCellMenuTriggerGeometry({
      rect: grid[0].cells[0].rect,
      selectionKind: "cell",
      selectedCount: 0,
    }),
    { left: 200, top: 107, placement: "quiet-edge" },
  );
  assert.deepEqual(
    tableCellMenuTriggerGeometry({
      rect: grid[0].cells[0].rect,
      selectionKind: "cell",
      edgeHovered: true,
      selectedCount: 0,
    }),
    { left: 200, top: 107, placement: "edge" },
  );
  assert.deepEqual(
    tableCellMenuTriggerGeometry({
      rect: rect(120, 90, 160, 34),
      selectionKind: "cells",
      selectedCount: 2,
    }),
    { left: 280, top: 107, placement: "center" },
  );
});
