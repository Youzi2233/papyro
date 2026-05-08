import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const slotsSource = readFileSync(
  new URL("../src/tiptap-react/slots.jsx", import.meta.url),
  "utf8",
);
const indexSource = readFileSync(
  new URL("../src/tiptap-react/index.js", import.meta.url),
  "utf8",
);
const officialDragHandleBridgeSource = readFileSync(
  new URL("../src/tiptap-react/official-drag-handle-bridge.jsx", import.meta.url),
  "utf8",
);
const commandMenuSource = readFileSync(
  new URL("../src/tiptap-react/components/command-menu.jsx", import.meta.url),
  "utf8",
);
const blockActionMenuSource = readFileSync(
  new URL("../src/tiptap-react/components/block-action-menu.jsx", import.meta.url),
  "utf8",
);
const tableContextMenuSource = readFileSync(
  new URL("../src/tiptap-react/components/table-context-menu.jsx", import.meta.url),
  "utf8",
);
const slashMenuViewSource = readFileSync(
  new URL("../src/tiptap-react/slash-menu-view.jsx", import.meta.url),
  "utf8",
);
const blockActionMenuViewSource = readFileSync(
  new URL("../src/tiptap-react/block-action-menu-view.jsx", import.meta.url),
  "utf8",
);
const floatingUtilsSource = readFileSync(
  new URL("../src/tiptap-react/utils/floating.js", import.meta.url),
  "utf8",
);
const tableToolbarViewSource = readFileSync(
  new URL("../src/tiptap-table-toolbar-view.js", import.meta.url),
  "utf8",
);
const editorEntrySource = readFileSync(
  new URL("../src/editor-tiptap-entry.js", import.meta.url),
  "utf8",
);
const primitivesSource = readFileSync(
  new URL("../src/tiptap-react/components/primitives.jsx", import.meta.url),
  "utf8",
);

test("React island slots register the official drag handle bridge by default", () => {
  assert.match(
    slotsSource,
    /import\s+\{\s*PapyroOfficialDragHandleBridge\s*\}\s+from\s+"\.\/official-drag-handle-bridge\.jsx";/u,
  );
  assert.match(slotsSource, /OverlayLayer:\s*PapyroOfficialDragHandleBridge/u);
});

test("React index exports the official drag handle bridge", () => {
  assert.match(indexSource, /PapyroOfficialDragHandleBridge/u);
  assert.match(indexSource, /official-drag-handle-bridge\.jsx/u);
});

test("official drag handle bridge keeps Tiptap callbacks stable across renders", () => {
  assert.match(officialDragHandleBridgeSource, /useCallback/u);
  assert.match(officialDragHandleBridgeSource, /useRef/u);
  assert.match(officialDragHandleBridgeSource, /entryRef\.current\s*=\s*entry/u);
  assert.match(officialDragHandleBridgeSource, /onNodeChange=\{handleNodeChange\}/u);
  assert.match(officialDragHandleBridgeSource, /onElementDragEnd=\{handleElementDragEnd\}/u);
});

test("React command chrome uses shared menu primitives", () => {
  assert.match(primitivesSource, /export function CommandRow/u);
  assert.match(primitivesSource, /export function CommandText/u);
  assert.match(primitivesSource, /export function CommandIconFrame/u);
  assert.match(commandMenuSource, /from "\.\/primitives\.jsx"/u);
  assert.match(commandMenuSource, /<CommandRow/u);
  assert.match(commandMenuSource, /<CommandText/u);
  assert.match(blockActionMenuSource, /from "\.\/primitives\.jsx"/u);
  assert.match(blockActionMenuSource, /<CommandRow/u);
  assert.match(blockActionMenuSource, /<CommandText/u);
  assert.match(tableContextMenuSource, /from "\.\/primitives\.jsx"/u);
  assert.match(tableContextMenuSource, /<CommandRow/u);
});

test("React floating chrome shares positioning utilities", () => {
  assert.match(floatingUtilsSource, /export function positionReactFloatingElement/u);
  assert.match(floatingUtilsSource, /export function shouldFlipFloatingSidePanel/u);
  assert.match(slashMenuViewSource, /from "\.\/utils\/floating\.js"/u);
  assert.match(blockActionMenuViewSource, /from "\.\/utils\/floating\.js"/u);
  assert.doesNotMatch(slashMenuViewSource, /positionFloatingElement/u);
  assert.doesNotMatch(blockActionMenuViewSource, /positionFloatingElement/u);
});

test("React table context menu is injected at the editor entry boundary", () => {
  assert.match(indexSource, /createTiptapReactTableContextMenuRenderer/u);
  assert.match(editorEntrySource, /tableMenuRendererFactory:\s*createTiptapReactTableContextMenuRenderer/u);
  assert.match(tableToolbarViewSource, /menuRendererFactory/u);
  assert.doesNotMatch(tableToolbarViewSource, /tiptap-react\/index\.js/u);
});
