import test from "node:test";
import assert from "node:assert/strict";

import {
  findPapyroSelectedTableCell,
  PAPYRO_TABLE_SELECTED_CELL_CLASS,
  tableSelectionOverlayMode,
  TABLE_SELECTION_OVERLAY_MODE,
} from "../src/components/tiptap-node/table-selection-overlay-model.js";

class FakeCellSelection {}

function createTableDom(selectedCell = null) {
  return {
    querySelector(selector) {
      assert.equal(selector, `.${PAPYRO_TABLE_SELECTED_CELL_CLASS}`);
      return selectedCell;
    },
  };
}

test("table selection overlay stays hidden for an ordinary text caret in a cell", () => {
  const mode = tableSelectionOverlayMode({
    selection: { from: 12, to: 12 },
    CellSelectionClass: FakeCellSelection,
    tableDom: createTableDom(null),
  });

  assert.equal(mode, TABLE_SELECTION_OVERLAY_MODE.HIDDEN);
});

test("table selection overlay follows Papyro visual cell selection", () => {
  const selectedCell = { tagName: "TD" };
  const tableDom = createTableDom(selectedCell);

  assert.equal(findPapyroSelectedTableCell(tableDom), selectedCell);
  assert.equal(
    tableSelectionOverlayMode({
      selection: { from: 12, to: 12 },
      CellSelectionClass: FakeCellSelection,
      tableDom,
    }),
    TABLE_SELECTION_OVERLAY_MODE.VISUAL_CELL_SELECTION,
  );
});

test("table selection overlay keeps ProseMirror CellSelection as the strongest signal", () => {
  const mode = tableSelectionOverlayMode({
    selection: new FakeCellSelection(),
    CellSelectionClass: FakeCellSelection,
    tableDom: createTableDom({ tagName: "TD" }),
  });

  assert.equal(mode, TABLE_SELECTION_OVERLAY_MODE.CELL_SELECTION);
});
