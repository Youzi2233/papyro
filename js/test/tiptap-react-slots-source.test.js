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
const runtimeContextSource = readFileSync(
  new URL("../src/tiptap-react/runtime-context.jsx", import.meta.url),
  "utf8",
);
const runtimeModelSource = readFileSync(
  new URL("../src/tiptap-react/runtime-model.js", import.meta.url),
  "utf8",
);
const codeBlockCommandModelSource = readFileSync(
  new URL("../src/tiptap-react/commands/code-block-command-model.js", import.meta.url),
  "utf8",
);
const codeBlockNodeViewSource = readFileSync(
  new URL("../src/tiptap-react/components/code-block-node-view.jsx", import.meta.url),
  "utf8",
);
const codeBlockNodeViewExtensionSource = readFileSync(
  new URL("../src/tiptap-react/extensions/code-block-node-view.js", import.meta.url),
  "utf8",
);
const officialDragHandleBridgeSource = readFileSync(
  new URL("../src/tiptap-react/official-drag-handle-bridge.jsx", import.meta.url),
  "utf8",
);
const blockHandleComponentSource = readFileSync(
  new URL("../src/tiptap-react/components/block-handle.jsx", import.meta.url),
  "utf8",
);
const commandMenuSource = readFileSync(
  new URL("../src/tiptap-react/components/command-menu.jsx", import.meta.url),
  "utf8",
);
const hoverIntentHookSource = readFileSync(
  new URL("../src/tiptap-react/hooks/use-hover-intent-activation.js", import.meta.url),
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

test("React runtime context exposes stable editor runtime hooks", () => {
  assert.match(runtimeModelSource, /export function createPapyroTiptapRuntimeModel/u);
  assert.match(runtimeModelSource, /export function createPapyroTiptapSelectionSnapshot/u);
  assert.match(runtimeModelSource, /export function createPapyroTiptapCommandExecutor/u);
  assert.match(runtimeContextSource, /createPapyroTiptapRuntimeModel/u);
  assert.match(runtimeContextSource, /export function usePapyroTiptapPreferences/u);
  assert.match(runtimeContextSource, /export function usePapyroTiptapSelection/u);
  assert.match(runtimeContextSource, /export function usePapyroTiptapCommandExecutor/u);
  assert.match(indexSource, /createPapyroTiptapSelectionSnapshot/u);
  assert.match(indexSource, /usePapyroTiptapSelection/u);
  assert.match(indexSource, /usePapyroTiptapCommandExecutor/u);
});

test("React code block chrome exposes a typed command model", () => {
  assert.match(codeBlockCommandModelSource, /export function createCodeBlockLanguageCommands/u);
  assert.match(codeBlockCommandModelSource, /export function createCodeBlockLanguageChrome/u);
  assert.match(codeBlockCommandModelSource, /export function createCodeBlockChromeCommands/u);
  assert.match(codeBlockCommandModelSource, /export function activeCodeBlockLanguageCommandIndex/u);
  assert.match(codeBlockCommandModelSource, /export function nextCodeBlockLanguageCommandIndex/u);
  assert.match(codeBlockCommandModelSource, /PAPYRO_CODE_LANGUAGE_OPTIONS/u);
  assert.match(commandMenuSource, /createCodeBlockLanguageCommands/u);
  assert.match(codeBlockNodeViewSource, /createCodeBlockLanguageChrome/u);
  assert.match(codeBlockNodeViewSource, /aria-activedescendant/u);
  assert.match(codeBlockNodeViewSource, /nextCodeBlockLanguageCommandIndex/u);
  assert.match(codeBlockNodeViewSource, /buttonRef\?\.current\?\.focus/u);
  assert.match(indexSource, /createCodeBlockLanguageCommands/u);
  assert.match(indexSource, /createCodeBlockLanguageChrome/u);
  assert.match(indexSource, /nextCodeBlockLanguageCommandIndex/u);
});

test("React code block node view follows Tiptap React node view lifecycle", () => {
  assert.match(codeBlockNodeViewSource, /NodeViewWrapper/u);
  assert.match(codeBlockNodeViewSource, /NodeViewContent/u);
  assert.match(codeBlockNodeViewSource, /codeBlockDomAttributes/u);
  assert.match(codeBlockNodeViewSource, /nodeViewRootElement/u);
  assert.match(codeBlockNodeViewExtensionSource, /ReactNodeViewRenderer/u);
  assert.match(codeBlockNodeViewExtensionSource, /fallbackNodeView/u);
  assert.match(codeBlockNodeViewExtensionSource, /contentComponent/u);
  assert.match(
    codeBlockNodeViewExtensionSource,
    /className:\s*"mn-tiptap-code-block mn-tiptap-react-code-block-node-view"/u,
  );
  assert.match(editorEntrySource, /codeBlockNodeViewRenderer:\s*createTiptapReactCodeBlockNodeViewRenderer\(\)/u);
  assert.match(indexSource, /createTiptapReactCodeBlockNodeViewRenderer/u);
});

test("official drag handle bridge keeps Tiptap callbacks stable across renders", () => {
  assert.match(officialDragHandleBridgeSource, /PapyroBlockHandle/u);
  assert.match(officialDragHandleBridgeSource, /useCallback/u);
  assert.match(officialDragHandleBridgeSource, /useEffect/u);
  assert.match(officialDragHandleBridgeSource, /useRef/u);
  assert.match(officialDragHandleBridgeSource, /useState/u);
  assert.match(officialDragHandleBridgeSource, /subscribeViewState/u);
  assert.match(officialDragHandleBridgeSource, /entryRef\.current\s*=\s*entry/u);
  assert.match(officialDragHandleBridgeSource, /onNodeChange=\{handleNodeChange\}/u);
  assert.match(officialDragHandleBridgeSource, /onElementDragEnd=\{handleElementDragEnd\}/u);
  assert.match(officialDragHandleBridgeSource, /blockHandle\?\.viewState/u);
  assert.match(officialDragHandleBridgeSource, /allowOfficialDragFromBridge/u);
  assert.match(officialDragHandleBridgeSource, /clickAction\?\.\(event\)/u);
  assert.match(blockHandleComponentSource, /mn-tiptap-block-handle-controls/u);
  assert.match(blockHandleComponentSource, /rootProps/u);
});

test("React command chrome uses shared menu primitives", () => {
  assert.match(primitivesSource, /export function CommandRow/u);
  assert.match(primitivesSource, /export function CommandText/u);
  assert.match(primitivesSource, /export function CommandIconFrame/u);
  assert.match(primitivesSource, /export function EditorPopover/u);
  assert.match(primitivesSource, /export function CommandMenu/u);
  assert.match(primitivesSource, /export function CommandItem/u);
  assert.match(primitivesSource, /export function CommandSection/u);
  assert.match(primitivesSource, /export function IconButton/u);
  assert.match(primitivesSource, /export function ToolbarButton/u);
  assert.match(primitivesSource, /export function Kbd/u);
  assert.match(primitivesSource, /export function VisuallyHidden/u);
  assert.match(commandMenuSource, /from "\.\/primitives\.jsx"/u);
  assert.match(commandMenuSource, /CommandItem as PrimitiveCommandItem/u);
  assert.match(commandMenuSource, /<PrimitiveCommandItem/u);
  assert.match(commandMenuSource, /<CommandSection/u);
  assert.match(blockActionMenuSource, /from "\.\/primitives\.jsx"/u);
  assert.match(blockActionMenuSource, /<CommandRow/u);
  assert.match(blockActionMenuSource, /<CommandText/u);
  assert.match(tableContextMenuSource, /from "\.\/primitives\.jsx"/u);
  assert.match(tableContextMenuSource, /<CommandRow/u);
});

test("React slash table picker uses an anchored secondary panel", () => {
  assert.match(commandMenuSource, /mn-tiptap-slash-menu-item-shell/u);
  assert.match(commandMenuSource, /commandMenuSidePanel\(command\)/u);
  assert.match(commandMenuSource, /sidePanel === "table"/u);
  assert.match(commandMenuSource, /data-layout/u);
  assert.doesNotMatch(commandMenuSource, /inlinePanel\s*=\s*command\?\.id === "table"/u);
});

test("React slash menu uses hover intent for secondary panels without slowing keyboard focus", () => {
  assert.match(commandMenuSource, /useHoverIntentActivation/u);
  assert.match(commandMenuSource, /hoverIntent\.schedule\(index,\s*options\)/u);
  assert.match(commandMenuSource, /focusActivate=\{hoverIntent\.runNow\}/u);
  assert.match(hoverIntentHookSource, /DEFAULT_HOVER_INTENT_DELAY_MS\s*=\s*80/u);
  assert.match(hoverIntentHookSource, /globalThis\.setTimeout/u);
  assert.match(hoverIntentHookSource, /globalThis\.clearTimeout/u);
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
  assert.match(formatToolbarSource, /ToolbarButton/u);
  assert.match(formatToolbarSource, /"keyboard-active":\s*keyboardActive \? "true" : "false"/u);
  assert.match(formatToolbarSource, /pressed=\{command\.active\}/u);
  assert.match(formatToolbarSource, /FORMAT_TOOLBAR_SUBMENU_OWNER_ID/u);
  assert.match(formatToolbarSource, /role="menu"/u);
  assert.match(formatToolbarSource, /"submenu-command-index":\s*commandIndex/u);
  assert.match(formatToolbarSource, /"aria-controls":\s*submenuExpanded \? submenuOwnerId : undefined/u);
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
