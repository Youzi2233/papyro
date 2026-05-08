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
const formatToolbarSource = readFileSync(
  new URL("../src/tiptap-react/components/format-toolbar.jsx", import.meta.url),
  "utf8",
);
const linkEditorSource = readFileSync(
  new URL("../src/tiptap-react/components/link-editor.jsx", import.meta.url),
  "utf8",
);
const slashMenuViewSource = readFileSync(
  new URL("../src/tiptap-react/slash-menu-view.jsx", import.meta.url),
  "utf8",
);
const formatToolbarViewSource = readFileSync(
  new URL("../src/tiptap-react/format-toolbar-view.jsx", import.meta.url),
  "utf8",
);
const linkEditorViewSource = readFileSync(
  new URL("../src/tiptap-react/link-editor-view.jsx", import.meta.url),
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
  assert.match(indexSource, /createTiptapReactFormatToolbarView/u);
  assert.match(editorEntrySource, /tableMenuRendererFactory:\s*createTiptapReactTableContextMenuRenderer/u);
  assert.match(editorEntrySource, /formatToolbarViewFactory:\s*createTiptapReactFormatToolbarView/u);
  assert.match(tableToolbarViewSource, /menuRendererFactory/u);
  assert.doesNotMatch(tableToolbarViewSource, /tiptap-react\/index\.js/u);
});

test("React format toolbar is injected without changing the runtime command controller", () => {
  assert.match(formatToolbarSource, /export function PapyroFormatToolbar/u);
  assert.match(formatToolbarSource, /usePointerActivation/u);
  assert.match(formatToolbarSource, /commandElementId/u);
  assert.match(formatToolbarSource, /data-keyboard-active/u);
  assert.match(formatToolbarSource, /aria-pressed=\{String\(command\.active\)\}/u);
  assert.match(formatToolbarSource, /FORMAT_TOOLBAR_SUBMENU_OWNER_ID/u);
  assert.match(formatToolbarSource, /role="menu"/u);
  assert.match(formatToolbarSource, /data-submenu-command-index/u);
  assert.match(formatToolbarSource, /aria-controls=\{submenuExpanded \? submenuOwnerId : undefined\}/u);
  assert.match(formatToolbarViewSource, /createRoot/u);
  assert.match(formatToolbarViewSource, /positionReactFloatingElement/u);
  assert.match(formatToolbarViewSource, /syncMenuActiveDescendant/u);
  assert.match(formatToolbarViewSource, /indexDataset:\s*state\.submenuOpen \? "submenuCommandIndex" : "commandIndex"/u);
  assert.equal(
    formatToolbarViewSource.includes("state.submenuOpen ? this.#submenuOwnerId : this.#ownerId"),
    true,
  );
  assert.match(formatToolbarViewSource, /focusCommand/u);
  assert.match(formatToolbarViewSource, /role = "toolbar"/u);
  assert.doesNotMatch(formatToolbarViewSource, /createElement\(/u);
});

test("React link editor popover is injected at the editor entry boundary", () => {
  assert.match(indexSource, /createTiptapReactLinkEditorView/u);
  assert.match(editorEntrySource, /linkEditorViewFactory:\s*createTiptapReactLinkEditorView/u);
  assert.match(linkEditorSource, /export function PapyroLinkEditor/u);
  assert.match(linkEditorSource, /inputMode="url"/u);
  assert.match(linkEditorViewSource, /createRoot/u);
  assert.match(linkEditorViewSource, /positionReactFloatingElement/u);
  assert.match(linkEditorViewSource, /role = "dialog"/u);
  assert.doesNotMatch(linkEditorViewSource, /createElement\(/u);
});
