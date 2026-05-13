import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const slotsSource = readFileSync(
  new URL("../src/tiptap-react/slots.tsx", import.meta.url),
  "utf8",
);
const indexSource = readFileSync(
  new URL("../src/tiptap-react/index.js", import.meta.url),
  "utf8",
);
const runtimeContextSource = readFileSync(
  new URL("../src/tiptap-react/runtime-context.tsx", import.meta.url),
  "utf8",
);
const islandSource = readFileSync(
  new URL("../src/tiptap-react/island.tsx", import.meta.url),
  "utf8",
);
const runtimeModelSource = readFileSync(
  new URL("../src/tiptap-react/runtime-model.ts", import.meta.url),
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
const hoverIntentHookSource = readFileSync(
  new URL("../src/tiptap-react/hooks/use-hover-intent-activation.js", import.meta.url),
  "utf8",
);
const pointerActivationHookSource = readFileSync(
  new URL("../src/tiptap-react/hooks/use-pointer-activation.js", import.meta.url),
  "utf8",
);
const officialTableNodeLayerSource = readFileSync(
  new URL("../src/tiptap-react/official-table-node-layer.tsx", import.meta.url),
  "utf8",
);
const floatingUtilsSource = readFileSync(
  new URL("../src/tiptap-react/utils/floating.js", import.meta.url),
  "utf8",
);
const tableCommandControllerSource = readFileSync(
  new URL("../src/tiptap-table-command-controller.ts", import.meta.url),
  "utf8",
);
const editorEntrySource = readFileSync(
  new URL("../src/editor-entry.ts", import.meta.url),
  "utf8",
);
const editorRuntimeDefaultsSource = readFileSync(
  new URL("../src/editor-runtime-defaults.ts", import.meta.url),
  "utf8",
);
const editorRuntimeSource = readFileSync(
  new URL("../src/editor-runtime.ts", import.meta.url),
  "utf8",
);
const editorRuntimeProtocolSource = readFileSync(
  new URL("../src/editor-runtime-protocol.ts", import.meta.url),
  "utf8",
);
const primitivesSource = readFileSync(
  new URL("../src/tiptap-react/components/primitives.jsx", import.meta.url),
  "utf8",
);

test("React island slots register official editor overlay layers by default", () => {
  assert.match(
    slotsSource,
    /import\s+\{\s*createPapyroOfficialDragHandleConfig\s*\}\s+from\s+"\.{2}\/tiptap-official-drag-handle\.js";/u,
  );
  assert.match(
    slotsSource,
    /import\s+\{\s*DragContextMenu\s*\}\s+from\s+"@\/components\/tiptap-ui\/drag-context-menu";/u,
  );
  assert.match(
    slotsSource,
    /import\s+\{\s*PapyroOfficialTableNodeLayer\s*\}\s+from\s+"\.\/official-table-node-layer";/u,
  );
  assert.match(slotsSource, /function PapyroOverlayLayer/u);
  assert.match(slotsSource, /<PapyroDragContextMenu \/>/u);
  assert.match(slotsSource, /<PapyroOfficialTableNodeLayer \{\.\.\.runtime\} \/>/u);
  assert.match(slotsSource, /OverlayLayer:\s*PapyroOverlayLayer/u);
  assert.doesNotMatch(slotsSource, /BeforeContent:\s*null/u);
  assert.doesNotMatch(slotsSource, /EditorContent:\s*null/u);
  assert.doesNotMatch(slotsSource, /AfterContent:\s*null/u);
});

test("React index exports the official drag context menu", () => {
  assert.match(indexSource, /DragContextMenu/u);
  assert.match(indexSource, /drag-context-menu/u);
});

test("React island loading state uses shared i18n labels", () => {
  assert.match(islandSource, /loadingEditorLabel/u);
  assert.doesNotMatch(islandSource, /aria-label="Loading editor"/u);
});

test("React island isolates optional chrome failures from editor content", () => {
  assert.match(islandSource, /class PapyroTiptapChromeErrorBoundary extends React\.Component/u);
  assert.match(islandSource, /static getDerivedStateFromError/u);
  assert.match(islandSource, /componentDidCatch\(error\)/u);
  assert.match(islandSource, /type:\s*"runtime_error"/u);
  assert.match(islandSource, /Editor chrome failed in/u);
  assert.match(islandSource, /<EditorContent editor=\{editor\} entry=\{entry\} \/>/u);
  assert.match(islandSource, /name="before-content"/u);
  assert.match(islandSource, /name="after-content"/u);
  assert.match(islandSource, /name="overlay"/u);
  assert.doesNotMatch(
    islandSource,
    /<PapyroTiptapChromeErrorBoundary[^>]*>\s*<EditorContent/u,
  );
});

test("React runtime context exposes stable editor runtime hooks", () => {
  assert.match(runtimeModelSource, /export function createPapyroTiptapRuntimeModel/u);
  assert.match(runtimeModelSource, /export function createPapyroTiptapSelectionSnapshot/u);
  assert.match(runtimeModelSource, /export function samePapyroTiptapSelectionSnapshot/u);
  assert.match(runtimeModelSource, /createPapyroTiptapFormatSnapshot/u);
  assert.match(runtimeModelSource, /samePapyroTiptapFormatSnapshot/u);
  assert.match(runtimeModelSource, /export function createPapyroTiptapCommandExecutor/u);
  assert.match(runtimeContextSource, /useSyncExternalStore/u);
  assert.match(runtimeContextSource, /useEditorState/u);
  assert.match(runtimeContextSource, /editor\.on\("transaction"/u);
  assert.match(runtimeContextSource, /editor\.on\("selectionUpdate"/u);
  assert.match(runtimeContextSource, /export function usePapyroTiptapSelectionSnapshot/u);
  assert.match(runtimeContextSource, /export function usePapyroTiptapFormatSnapshot/u);
  assert.match(runtimeContextSource, /createPapyroTiptapRuntimeModel/u);
  assert.match(runtimeContextSource, /export function usePapyroTiptapPreferences/u);
  assert.match(runtimeContextSource, /export function usePapyroTiptapSelection/u);
  assert.match(runtimeContextSource, /export function usePapyroTiptapFormat/u);
  assert.match(runtimeContextSource, /export function usePapyroTiptapCommandExecutor/u);
  assert.match(indexSource, /createPapyroTiptapSelectionSnapshot/u);
  assert.match(indexSource, /samePapyroTiptapSelectionSnapshot/u);
  assert.match(indexSource, /createPapyroTiptapFormatSnapshot/u);
  assert.match(indexSource, /samePapyroTiptapFormatSnapshot/u);
  assert.match(indexSource, /usePapyroTiptapSelectionSnapshot/u);
  assert.match(indexSource, /usePapyroTiptapSelection/u);
  assert.match(indexSource, /usePapyroTiptapFormatSnapshot/u);
  assert.match(indexSource, /usePapyroTiptapFormat/u);
  assert.match(indexSource, /usePapyroTiptapCommandExecutor/u);
});

test("React code block chrome exposes a typed command model", () => {
  assert.match(codeBlockCommandModelSource, /export function createCodeBlockLanguageCommands/u);
  assert.match(codeBlockCommandModelSource, /export function createCodeBlockLanguageChrome/u);
  assert.match(codeBlockCommandModelSource, /export function createCodeBlockChromeCommands/u);
  assert.match(codeBlockCommandModelSource, /export function activeCodeBlockLanguageCommandIndex/u);
  assert.match(codeBlockCommandModelSource, /export function nextCodeBlockLanguageCommandIndex/u);
  assert.match(codeBlockCommandModelSource, /PAPYRO_CODE_LANGUAGE_OPTIONS/u);
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
  assert.match(
    editorRuntimeDefaultsSource,
    /codeBlockNodeViewRenderer:\s*createTiptapReactCodeBlockNodeViewRenderer\(\)/u,
  );
  assert.doesNotMatch(editorEntrySource, /codeBlockNodeViewRenderer/u);
  assert.match(indexSource, /createTiptapReactCodeBlockNodeViewRenderer/u);
});

test("editor entry delegates production runtime assembly to defaults", () => {
  assert.match(editorEntrySource, /createPapyroTiptapRuntimeAdapter\(\)/u);
  assert.match(editorEntrySource, /installPapyroEditorRuntime\(window/u);
  assert.doesNotMatch(editorEntrySource, /createTiptapReact/u);
  assert.doesNotMatch(editorEntrySource, /createPapyroTiptapExtensions/u);
  assert.doesNotMatch(editorEntrySource, /extensionsFactory/u);
  assert.doesNotMatch(editorEntrySource, /mountControllerFactory/u);
  assert.doesNotMatch(editorEntrySource, /tableCommandControllerFactory/u);
});

test("editor runtime delegates Rust protocol handling to a focused bridge", () => {
  assert.match(editorRuntimeSource, /createTiptapRuntimeProtocolBridge/u);
  assert.match(editorRuntimeSource, /attachChannel:\s*protocolBridge\.attachChannel/u);
  assert.match(editorRuntimeSource, /handleRustMessage:\s*protocolBridge\.handleRustMessage/u);
  assert.doesNotMatch(editorRuntimeSource, /message\.type === "set_view_mode"/u);
  assert.doesNotMatch(editorRuntimeSource, /message\.type === "set_content"/u);
  assert.match(editorRuntimeProtocolSource, /export function createTiptapRuntimeProtocolBridge/u);
  assert.match(editorRuntimeProtocolSource, /attachChannel\(tabId, dioxus\)/u);
  assert.match(editorRuntimeProtocolSource, /handleRustMessage\(tabId, message\)/u);
  assert.match(editorRuntimeProtocolSource, /message\.type === "set_view_mode"/u);
  assert.match(editorRuntimeProtocolSource, /message\.type === "set_content"/u);
});

test("React drag handle slot uses the official DragContextMenu module path", () => {
  assert.match(slotsSource, /function PapyroDragContextMenu/u);
  assert.match(slotsSource, /createPapyroOfficialDragHandleConfig\(\)/u);
  assert.match(slotsSource, /<DragContextMenu/u);
  assert.match(slotsSource, /pluginKey=\{dragHandleConfig\.pluginKey\}/u);
  assert.match(slotsSource, /nested=\{dragHandleConfig\.nested\}/u);
  assert.match(slotsSource, /className="drag-handle mn-tiptap-drag-context-menu-handle"/u);
  assert.doesNotMatch(slotsSource, /official-drag-handle-bridge/u);
  assert.doesNotMatch(slotsSource, /PapyroBlockHandle/u);
  assert.doesNotMatch(indexSource, /official-drag-handle-bridge/u);
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
});

test("React slash menu uses hover intent for secondary panels without slowing keyboard focus", () => {
  assert.match(hoverIntentHookSource, /DEFAULT_HOVER_INTENT_DELAY_MS\s*=\s*80/u);
  assert.match(hoverIntentHookSource, /globalThis\.setTimeout/u);
  assert.match(hoverIntentHookSource, /globalThis\.clearTimeout/u);
});

test("React pointer activation does not retry handled pointer activations", () => {
  assert.match(pointerActivationHookSource, /const pointerActivated = useRef\(false\)/u);
  assert.match(pointerActivationHookSource, /pointerActivated\.current = true;\s*run\(\);/u);
  assert.match(pointerActivationHookSource, /if \(!pointerActivated\.current\) \{\s*run\(\);/u);
  assert.doesNotMatch(pointerActivationHookSource, /run\(\) !== false/u);
  assert.doesNotMatch(pointerActivationHookSource, /pointerHandled/u);
});

test("React floating chrome shares positioning utilities", () => {
  assert.match(floatingUtilsSource, /export function positionReactFloatingElement/u);
  assert.match(floatingUtilsSource, /export function shouldFlipFloatingSidePanel/u);
});

test("official table-node layer owns visible table chrome at the editor boundary", () => {
  assert.doesNotMatch(indexSource, /createTiptapReactFormatToolbarView/u);
  assert.doesNotMatch(editorRuntimeDefaultsSource, /createTiptapTableCommandController/u);
  assert.doesNotMatch(editorRuntimeDefaultsSource, /tableCommandControllerFactory/u);
  assert.match(editorRuntimeSource, /createTiptapTableCommandController/u);
  assert.match(
    editorRuntimeSource,
    /const tableCommands = createTiptapTableCommandController\(\)/u,
  );
  assert.match(editorRuntimeSource, /from "\.\/tiptap-table-command-controller\.ts"/u);
  assert.doesNotMatch(editorRuntimeSource, /tableToolbarControllerFactory/u);
  assert.doesNotMatch(editorRuntimeSource, /tableToolbar/u);
  assert.doesNotMatch(editorRuntimeSource, /from "\.\/tiptap-table-toolbar\.js"/u);
  assert.doesNotMatch(editorEntrySource, /createTiptapReactTableContextMenuRenderer/u);
  assert.doesNotMatch(editorEntrySource, /createTiptapReactTableChromeRenderer/u);
  assert.doesNotMatch(indexSource, /createTiptapReactTableContextMenuRenderer/u);
  assert.doesNotMatch(indexSource, /createTiptapReactTableChromeRenderer/u);
  assert.doesNotMatch(editorEntrySource, /createTiptapTableCommandController/u);
  assert.doesNotMatch(editorEntrySource, /tableMenuRendererFactory/u);
  assert.doesNotMatch(editorEntrySource, /tableChromeRendererFactory/u);
  assert.doesNotMatch(editorEntrySource, /tableChromeRendererFactory:\s*null/u);
  assert.doesNotMatch(editorEntrySource, /formatToolbarViewFactory:\s*createTiptapReactFormatToolbarView/u);
  assert.match(slotsSource, /PapyroToolbarFloating/u);
  assert.match(slotsSource, /PapyroOfficialTableNodeLayer/u);
  assert.match(officialTableNodeLayerSource, /TableHandle/u);
  assert.match(officialTableNodeLayerSource, /TableSelectionOverlay/u);
  assert.match(officialTableNodeLayerSource, /TableCellHandleMenu/u);
  assert.match(officialTableNodeLayerSource, /TableExtendRowColumnButtons/u);
  assert.match(tableCommandControllerSource, /export function createTiptapTableCommandController/u);
  assert.match(tableCommandControllerSource, /TABLE_COMMANDS/u);
  assert.doesNotMatch(tableCommandControllerSource, /addEventListener/u);
  assert.doesNotMatch(tableCommandControllerSource, /createElement/u);
  assert.doesNotMatch(tableCommandControllerSource, /querySelector/u);
  assert.doesNotMatch(tableCommandControllerSource, /pointerdown|pointerenter|mousedown|contextmenu/u);
});

test("React table chrome does not keep Papyro fallback menu exports", () => {
  assert.doesNotMatch(indexSource, /TableCommandIcon/u);
  assert.doesNotMatch(indexSource, /PapyroTableCommandMenuContent/u);
  assert.doesNotMatch(officialTableNodeLayerSource, /table-command-icons/u);
  assert.doesNotMatch(officialTableNodeLayerSource, /table-command-menu/u);
});
