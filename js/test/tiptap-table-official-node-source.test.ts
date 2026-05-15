import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const officialLayerSource = readFileSync(
  new URL("../src/tiptap-react/official-table-node-layer.tsx", import.meta.url),
  "utf8",
);
const tableHandleSource = readFileSync(
  new URL(
    "../src/components/tiptap-node/table-node/ui/table-handle/table-handle.tsx",
    import.meta.url,
  ),
  "utf8",
);
const tableSelectionOverlaySource = readFileSync(
  new URL(
    "../src/components/tiptap-node/table-node/ui/table-selection-overlay/table-selection-overlay.tsx",
    import.meta.url,
  ),
  "utf8",
);
const tableExtendButtonsSource = readFileSync(
  new URL(
    "../src/components/tiptap-node/table-node/ui/table-extend-row-column-button/table-extend-row-column-button.tsx",
    import.meta.url,
  ),
  "utf8",
);
const tableHandleMenuSource = readFileSync(
  new URL(
    "../src/components/tiptap-node/table-node/ui/table-handle-menu/table-handle-menu.tsx",
    import.meta.url,
  ),
  "utf8",
);
const tableCellHandleMenuSource = readFileSync(
  new URL(
    "../src/components/tiptap-node/table-node/ui/table-cell-handle-menu/table-cell-handle-menu.tsx",
    import.meta.url,
  ),
  "utf8",
);
const tableExtensionSource = readFileSync(
  new URL("../src/tiptap-table.ts", import.meta.url),
  "utf8",
);
const tableStylesSource = readFileSync(
  new URL(
    "../src/components/tiptap-node/table-node/styles/table-node.scss",
    import.meta.url,
  ),
  "utf8",
);
const prosemirrorTableStylesSource = readFileSync(
  new URL(
    "../src/components/tiptap-node/table-node/styles/prosemirror-table.scss",
    import.meta.url,
  ),
  "utf8",
);

test("Papyro mounts every official table-node interaction from the documented layer", () => {
  assert.match(officialLayerSource, /<TableHandle editor=\{editor\}/u);
  assert.match(officialLayerSource, /<TableSelectionOverlay\s+editor=\{editor\}/u);
  assert.match(officialLayerSource, /cellMenu=\{renderCellMenu\}/u);
  assert.match(officialLayerSource, /<TableCellHandleMenu[\s\S]*editor=\{props\.editor\}/u);
  assert.doesNotMatch(
    officialLayerSource,
    /onMouseDown=\{\(event\) => props\.onResizeStart\?\.\("br"\)\?\.\(event\)\}/u,
  );
  assert.match(officialLayerSource, /<TableExtendRowColumnButtons editor=\{editor\}/u);

  assert.match(tableHandleSource, /useTableHandleState\(\{ editor \}\)/u);
  assert.match(tableHandleSource, /useTableHandlePositioning\(/u);
  assert.match(tableHandleSource, /const RowButton = CustomRowButton \|\| TableHandleMenu/u);
  assert.match(tableHandleSource, /const ColumnButton = CustomColumnButton \|\| TableHandleMenu/u);
  assert.match(tableHandleSource, /dragStart=\{rowDragStart\}/u);
  assert.match(tableHandleSource, /dragStart=\{colDragStart\}/u);

  assert.match(tableSelectionOverlaySource, /selection instanceof CellSelection/u);
  assert.match(tableSelectionOverlaySource, /useResizeOverlay\(editor, updateSelectionRect\)/u);
  assert.match(tableSelectionOverlaySource, /FloatingPortal root=\{containerRef\.current\}/u);
  assert.match(tableSelectionOverlaySource, /onResizeStart=\{createResizeHandler\}/u);
  assert.match(tableSelectionOverlaySource, /showResizeHandles &&/u);

  assert.match(tableExtendButtonsSource, /useTableExtendRowColumnButtonsPositioning\(/u);
  assert.match(tableExtendButtonsSource, /editor\.commands\.addRowAfter\(\)/u);
  assert.match(tableExtendButtonsSource, /editor\.commands\.addColumnAfter\(\)/u);
  assert.match(tableExtendButtonsSource, /editor\.commands\.deleteRow\(\)/u);
  assert.match(tableExtendButtonsSource, /editor\.commands\.deleteColumn\(\)/u);
  assert.match(tableExtendButtonsSource, /editor\.commands\.freezeHandles\(\)/u);

  assert.match(tableHandleMenuSource, /useTableAddRowColumn/u);
  assert.match(tableHandleMenuSource, /useTableDeleteRowColumn/u);
  assert.match(tableHandleMenuSource, /useTableDuplicateRowColumn/u);
  assert.match(tableHandleMenuSource, /useTableMoveRowColumn/u);
  assert.match(tableCellHandleMenuSource, /useTableMergeSplitCell\(\{ action: "merge" \}\)/u);
  assert.match(tableCellHandleMenuSource, /useTableMergeSplitCell\(\{ action: "split" \}\)/u);

  assert.match(tableExtensionSource, /PapyroTable\.configure\(\{\s*resizable:\s*true,/u);
  assert.match(tableExtensionSource, /PapyroTableResizeEdgeBridge/u);
  assert.match(tableExtensionSource, /papyroTableResizeEdgeBridge/u);
  assert.match(tableExtensionSource, /handleWidth:\s*6/u);
  assert.match(tableExtensionSource, /lastColumnResizable:\s*true/u);
  assert.match(tableStylesSource, /\.ProseMirror \.column-resize-handle/u);
  assert.match(prosemirrorTableStylesSource, /\.ProseMirror \.column-resize-handle/u);
});
