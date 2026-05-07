import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizedRect,
  tableAxisHandleGeometry,
  tableCellMenuTriggerGeometry,
  tableHoverWithIntent,
  tableQuickAddGeometry,
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
  assert.equal(classify(3, 122, 128), "cell");
  assert.equal(classify(3, 108, 128), "row-handle");
  assert.equal(classify(1, 204, 92), "cell");
  assert.equal(classify(1, 204, 76), "column-handle");
  assert.equal(classify(5, 356, 140), "add-column");
  assert.equal(classify(3, 160, 154), "add-row");
  assert.equal(classify(5, 359, 152), "add-column");
  assert.equal(classify(5, 318, 156), "add-row");
  assert.equal(classify(0, 194, 115), "cell");
  assert.equal(classify(0, 195, 107), "cell-menu");
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
  assert.equal(classify(table, 160, 154), "add-row");
  assert.equal(classify(table, 356, 140), "add-column");
});

test("Tiptap table geometry reserves the bottom edge for inserting between complex blocks", () => {
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

  assert.equal(hover.edge, "block-after");
  assert.equal(hover.block, table);
});

test("Tiptap table geometry positions quick add rails on real grid edges", () => {
  const { grid, tableRect } = createTableGeometryHarness();

  assert.deepEqual(tableQuickAddGeometry(grid, tableRect), {
    row: {
      left: 120,
      top: 160,
      width: 240,
      height: 12,
      rail: 240,
    },
    column: {
      left: 362,
      top: 90,
      width: 12,
      height: 68,
      rail: 68,
    },
  });
});

test("Tiptap table geometry positions axis handles and scoped cell menus", () => {
  const { grid, tableRect } = createTableGeometryHarness();
  const axis = tableAxisHandleGeometry(grid, tableRect);

  assert.deepEqual(axis.table, { left: 103, top: 73, width: 12, height: 12 });
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
      edgeHovered: true,
      selectedCount: 0,
    }),
    { left: 200, top: 98, placement: "edge" },
  );
  assert.deepEqual(
    tableCellMenuTriggerGeometry({
      rect: rect(120, 90, 160, 34),
      selectionKind: "cells",
      selectedCount: 2,
    }),
    { left: 280, top: 98, placement: "center" },
  );
});
