import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const overlaySource = readFileSync(
  new URL("../src/components/tiptap-node/table-selection-overlay.jsx", import.meta.url),
  "utf8",
);

test("official table selection overlay does not treat ordinary cell caret as object selection", () => {
  assert.match(overlaySource, /tableSelectionOverlayMode/u);
  assert.match(
    overlaySource,
    /TABLE_SELECTION_OVERLAY_MODE\.CELL_SELECTION/u,
  );
  assert.match(
    overlaySource,
    /TABLE_SELECTION_OVERLAY_MODE\.VISUAL_CELL_SELECTION/u,
  );
  assert.doesNotMatch(overlaySource, /getSingleCellBoundingRect/u);
  assert.doesNotMatch(overlaySource, /single cell handling/u);
});
