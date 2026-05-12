import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const overlaySource = readFileSync(
  new URL("../src/components/tiptap-node/table-node/ui/table-selection-overlay/table-selection-overlay.tsx", import.meta.url),
  "utf8",
);

test("official table selection overlay owns cell selection and resize chrome", () => {
  assert.match(overlaySource, /selection instanceof CellSelection/u);
  assert.match(overlaySource, /getSelectionBoundingRect/u);
  assert.match(overlaySource, /getSingleCellBoundingRect/u);
  assert.match(overlaySource, /useResizeOverlay/u);
  assert.match(overlaySource, /FloatingPortal root=\{containerRef\.current\}/u);
  assert.match(overlaySource, /showResizeHandles/u);
  assert.match(overlaySource, /onResizeStart=\{createResizeHandler\}/u);
  assert.doesNotMatch(overlaySource, /tableSelectionOverlayMode/u);
  assert.doesNotMatch(overlaySource, /PAPYRO_TABLE_SELECTED_CELL_CLASS/u);
});
