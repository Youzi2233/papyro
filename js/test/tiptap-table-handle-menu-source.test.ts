import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const officialCellMenuSource = readFileSync(
  new URL("../src/components/tiptap-node/table-node/ui/table-cell-handle-menu/index.tsx", import.meta.url),
  "utf8",
);
const officialAxisMenuSource = readFileSync(
  new URL("../src/components/tiptap-node/table-node/ui/table-handle-menu/index.tsx", import.meta.url),
  "utf8",
);
const officialLayerSource = readFileSync(
  new URL("../src/tiptap-react/official-table-node-layer.jsx", import.meta.url),
  "utf8",
);
const officialTableHandleIndexSource = readFileSync(
  new URL("../src/components/tiptap-node/table-node/ui/table-handle/index.tsx", import.meta.url),
  "utf8",
);
const officialTableHandleSource = readFileSync(
  new URL("../src/components/tiptap-node/table-node/ui/table-handle/table-handle.tsx", import.meta.url),
  "utf8",
);
const officialSelectionOverlayIndexSource = readFileSync(
  new URL("../src/components/tiptap-node/table-node/ui/table-selection-overlay/index.tsx", import.meta.url),
  "utf8",
);
const officialSelectionOverlaySource = readFileSync(
  new URL("../src/components/tiptap-node/table-node/ui/table-selection-overlay/table-selection-overlay.tsx", import.meta.url),
  "utf8",
);
const officialExtendButtonsIndexSource = readFileSync(
  new URL("../src/components/tiptap-node/table-node/ui/table-extend-row-column-button/index.tsx", import.meta.url),
  "utf8",
);
const officialExtendButtonsSource = readFileSync(
  new URL("../src/components/tiptap-node/table-node/ui/table-extend-row-column-button/table-extend-row-column-button.tsx", import.meta.url),
  "utf8",
);

const cellMenuRenderSource =
  officialLayerSource.match(/<TableCellHandleMenu[\s\S]*?\/>/u)?.[0] ?? "";

test("official paid table-node cell menu remains the visible runtime source", () => {
  assert.match(officialCellMenuSource, /useTableMergeSplitCell/u);
  assert.match(officialCellMenuSource, /useTableClearRowColumnContent/u);
  assert.match(officialCellMenuSource, /ColorMenu/u);
  assert.match(officialCellMenuSource, /TableAlignMenu/u);
  assert.doesNotMatch(officialCellMenuSource, /PapyroTableCommandMenuContent/u);
  assert.doesNotMatch(officialCellMenuSource, /createTableCellHandleCommandMenuModel/u);
  assert.doesNotMatch(officialCellMenuSource, /from "@\/components\/tiptap-node\/table-cell-handle-menu\.jsx"/u);
});

test("official paid table-node row and column menus remain the visible runtime source", () => {
  assert.match(officialAxisMenuSource, /useTableDuplicateRowColumn/u);
  assert.match(officialAxisMenuSource, /useTableMoveRowColumn/u);
  assert.match(officialAxisMenuSource, /useTableClearRowColumnContent/u);
  assert.match(officialAxisMenuSource, /ColorMenu/u);
  assert.match(officialAxisMenuSource, /TableAlignMenu/u);
  assert.doesNotMatch(officialAxisMenuSource, /PapyroTableCommandMenuContent/u);
  assert.doesNotMatch(officialAxisMenuSource, /createPapyroTableCommandMenuModel/u);
  assert.doesNotMatch(officialAxisMenuSource, /from "@\/components\/tiptap-node\/table-handle-menu\.jsx"/u);
});

test("Papyro table layer mounts official table-node menu paths", () => {
  assert.match(
    officialLayerSource,
    /from "\.\.\/components\/tiptap-node\/table-node\/ui\/table-handle\/table-handle"/u,
  );
  assert.match(
    officialLayerSource,
    /from "\.\.\/components\/tiptap-node\/table-node\/ui\/table-selection-overlay"/u,
  );
  assert.match(
    officialLayerSource,
    /from "\.\.\/components\/tiptap-node\/table-node\/ui\/table-extend-row-column-button"/u,
  );
  assert.match(
    officialLayerSource,
    /from "\.\.\/components\/tiptap-node\/table-node\/ui\/table-cell-handle-menu"/u,
  );
  assert.doesNotMatch(
    officialLayerSource,
    /from "\.\.\/components\/tiptap-node\/table-handle\.jsx"/u,
  );
  assert.doesNotMatch(
    officialLayerSource,
    /from "\.\.\/components\/tiptap-node\/table-selection-overlay\.jsx"/u,
  );
  assert.doesNotMatch(
    officialLayerSource,
    /from "\.\.\/components\/tiptap-node\/table-cell-handle-menu\.jsx"/u,
  );
  assert.doesNotMatch(officialLayerSource, /from "\.\.\/components\/tiptap-node\/table-handle\.jsx"/u);
});

test("official table-node chrome paths are real implementations, not legacy re-exports", () => {
  assert.match(officialTableHandleIndexSource, /export \* from "\.\/table-handle"/u);
  assert.match(officialTableHandleSource, /useTableHandlePositioning/u);
  assert.match(officialTableHandleSource, /TableHandleMenu/u);
  assert.doesNotMatch(officialTableHandleSource, /from "\.\.\/\.\.\/\.\.\/table-handle\.jsx"/u);
  assert.doesNotMatch(officialTableHandleSource, /export \{ TableHandle \}/u);

  assert.match(officialSelectionOverlayIndexSource, /export \* from "\.\/table-selection-overlay"/u);
  assert.match(officialSelectionOverlaySource, /cellMenu:\s*CellMenu/u);
  assert.match(officialSelectionOverlaySource, /<CellMenu/u);
  assert.match(officialSelectionOverlaySource, /getSingleCellBoundingRect/u);
  assert.match(officialSelectionOverlaySource, /selection instanceof CellSelection/u);
  assert.doesNotMatch(officialSelectionOverlaySource, /from "\.\.\/\.\.\/\.\.\/table-selection-overlay\.jsx"/u);
  assert.doesNotMatch(officialSelectionOverlaySource, /export \{ TableSelectionOverlay \}/u);

  assert.match(officialExtendButtonsIndexSource, /export \* from "\.\/table-extend-row-column-button"/u);
  assert.match(officialExtendButtonsSource, /useTableExtendRowColumnButtonsPositioning/u);
  assert.doesNotMatch(officialExtendButtonsSource, /from "\.\.\/\.\.\/\.\.\/table-extend-row-column-button\.jsx"/u);
  assert.doesNotMatch(officialExtendButtonsSource, /export \{ TableExtendRowColumnButtons \}/u);
});

test("Papyro keeps local adaptation outside official table-node cell menu props", () => {
  assert.doesNotMatch(cellMenuRenderSource, /selectionKind=\{props\.selectionKind\}/u);
  assert.doesNotMatch(cellMenuRenderSource, /language=\{language\}/u);
  assert.match(officialLayerSource, /<TableHandle editor=\{editor\} language=\{language\}/u);
});
