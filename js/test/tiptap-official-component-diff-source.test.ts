import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const toolbarSource = readSource(
  "../src/components/tiptap-templates/notion/notion-like/papyro-toolbar-floating.tsx",
);
const floatingToolbarSource = toolbarSource.slice(
  toolbarSource.indexOf("export function PapyroToolbarFloating"),
  toolbarSource.indexOf("function canMoreOptions"),
);
const moreOptionsSource = toolbarSource.slice(
  toolbarSource.indexOf("export function MoreOptions"),
);
const slashMenuSource = readSource(
  "../src/components/tiptap-ui/slash-dropdown-menu/slash-dropdown-menu.tsx",
);
const slashMenuHookSource = readSource(
  "../src/components/tiptap-ui/slash-dropdown-menu/use-slash-dropdown-menu.ts",
);
const dragContextMenuSource = readSource(
  "../src/components/tiptap-ui/drag-context-menu/drag-context-menu.tsx",
);
const slashCommandTriggerSource = readSource(
  "../src/components/tiptap-ui/slash-command-trigger-button/use-slash-command-trigger.ts",
);
const tooltipSource = readSource(
  "../src/components/tiptap-ui-primitive/tooltip/tooltip.tsx",
);
const popoverSource = readSource(
  "../src/components/tiptap-ui-primitive/popover/popover.tsx",
);
const dropdownMenuSource = readSource(
  "../src/components/tiptap-ui-primitive/dropdown-menu/dropdown-menu.tsx",
);
const uiUtilsSource = readSource(
  "../src/lib/tiptap-ui-utils.ts",
);
const tableHandleMenuSource = readSource(
  "../src/components/tiptap-node/table-node/ui/table-handle-menu/table-handle-menu.tsx",
);
const tableCellHandleMenuSource = readSource(
  "../src/components/tiptap-node/table-node/ui/table-cell-handle-menu/table-cell-handle-menu.tsx",
);
const imageNodeFloatingSource = readSource(
  "../src/components/tiptap-node/image-node/image-node-floating.tsx",
);
const imageNodeViewSource = readSource(
  "../src/components/tiptap-node/image-node/image-node-view.tsx",
);

test("Papyro floating toolbar keeps the official Notion-like composition without AI", () => {
  assert.match(toolbarSource, /export function PapyroToolbarFloating/u);
  assert.match(floatingToolbarSource, /<TurnIntoDropdown hideWhenUnavailable=\{true\} \/>/u);
  assert.match(floatingToolbarSource, /<MarkButton type="bold" hideWhenUnavailable=\{true\} \/>/u);
  assert.match(floatingToolbarSource, /<MarkButton type="italic" hideWhenUnavailable=\{true\} \/>/u);
  assert.match(floatingToolbarSource, /<MarkButton type="strike" hideWhenUnavailable=\{true\} \/>/u);
  assert.match(floatingToolbarSource, /<ImageNodeFloating \/>/u);
  assert.match(floatingToolbarSource, /<LinkPopover[\s\S]*?autoOpenOnLinkActive=\{false\}[\s\S]*?\/>/u);
  assert.match(floatingToolbarSource, /<ColorTextPopover hideWhenUnavailable=\{true\} \/>/u);
  assert.match(floatingToolbarSource, /<MoreOptions hideWhenUnavailable=\{true\} \/>/u);
  assert.doesNotMatch(floatingToolbarSource, /<MarkButton type="underline"/u);
  assert.doesNotMatch(floatingToolbarSource, /<MarkButton type="code"/u);
  assert.match(moreOptionsSource, /<MarkButton type="underline" \/>/u);
  assert.match(moreOptionsSource, /<MarkButton type="code" \/>/u);
  assert.doesNotMatch(toolbarSource, /ImproveDropdown|aiTextPrompt|aiGenerationShow/u);
});

test("Papyro floating toolbar documents its retained WebView and i18n adapters in source", () => {
  assert.match(toolbarSource, /preserveEditorSelectionOnMouseDown/u);
  assert.match(toolbarSource, /preserveEditorSelectionOnPointerDown/u);
  assert.match(toolbarSource, /className="tiptap-selection-floating-layer"/u);
  assert.match(toolbarSource, /className="tiptap-selection-toolbar"/u);
  assert.match(toolbarSource, /className="tiptap-floating-toolbar-popover"/u);
  assert.match(toolbarSource, /className="tiptap-floating-toolbar-popover-toolbar"/u);
  assert.match(toolbarSource, /data-plain="true"/u);
  assert.doesNotMatch(moreOptionsSource, /<PopoverContent[\s\S]*?asChild/u);
  assert.match(toolbarSource, /formatToolbarLabel\(language\)/u);
  assert.match(toolbarSource, /moreOptionsLabel/u);
  assert.match(toolbarSource, /usePapyroTiptapLanguage/u);
  assert.match(toolbarSource, /editor\.on\("transaction", handleSelectionUpdate\)/u);
});

test("Papyro floating tooltip waits for a measured position before showing", () => {
  assert.match(tooltipSource, /const positioned = context\.isPositioned/u);
  assert.match(tooltipSource, /visibility: positioned \? style\?\.visibility : "hidden"/u);
  assert.match(tooltipSource, /data-positioned=\{positioned \? "true" : "false"\}/u);
});

test("Papyro popover and dropdown surfaces hide until their first measured position", () => {
  assert.match(popoverSource, /function useDeferredFloatingVisibility/u);
  assert.match(dropdownMenuSource, /function useDeferredFloatingVisibility/u);
  assert.match(popoverSource, /data-positioned=\{isPositioned \? "true" : "false"\}/u);
  assert.match(dropdownMenuSource, /data-positioned=\{isPositioned \? "true" : "false"\}/u);
  assert.match(popoverSource, /visibility: isPositioned \? style\?\.visibility : "hidden"/u);
  assert.match(dropdownMenuSource, /visibility: isPositioned \? style\?\.visibility : "hidden"/u);
});

test("slash menu keeps supported Markdown-local commands and excludes unavailable official features", () => {
  assert.match(slashMenuHookSource, /text:\s*\{/u);
  assert.match(slashMenuHookSource, /heading_1:\s*\{/u);
  assert.match(slashMenuHookSource, /bullet_list:\s*\{/u);
  assert.match(slashMenuHookSource, /ordered_list:\s*\{/u);
  assert.match(slashMenuHookSource, /task_list:\s*\{/u);
  assert.match(slashMenuHookSource, /quote:\s*\{/u);
  assert.match(slashMenuHookSource, /code_block:\s*\{/u);
  assert.match(slashMenuHookSource, /table:\s*\{/u);
  assert.match(slashMenuHookSource, /divider:\s*\{/u);
  assert.match(slashMenuHookSource, /image:\s*\{/u);
  assert.match(slashMenuHookSource, /keywords:\s*\["table", "insertTable"\]/u);
  assert.match(slashMenuSource, /scrollIntoView\(\{ block: "nearest" \}\)/u);
  assert.doesNotMatch(
    slashMenuHookSource,
    /AiSparklesIcon|addMentionTrigger|addEmojiTrigger|insertTocNode|aiTextPrompt|continue_writing|ai_ask_button|mention:\s*\{|emoji:\s*\{|toc:\s*\{/u,
  );
});

test("drag context menu keeps core local actions and excludes unsupported official integrations", () => {
  assert.match(dragContextMenuSource, /<ColorMenu \/>/u);
  assert.match(dragContextMenuSource, /<TableAlignMenu \/>/u);
  assert.match(dragContextMenuSource, /<TableFitToWidth \/>/u);
  assert.match(dragContextMenuSource, /<TransformActionGroup \/>/u);
  assert.match(dragContextMenuSource, /<CoreActionGroup \/>/u);
  assert.match(dragContextMenuSource, /<DeleteActionGroup \/>/u);
  assert.match(dragContextMenuSource, /SlashCommandTriggerButton/u);
  assert.match(dragContextMenuSource, /typeof editor\.commands\.setLockDragHandle === "function"/u);
  assert.match(dragContextMenuSource, /const nodeName = getNodeDisplayName\(editor\)/u);
  assert.match(dragContextMenuSource, /<MenuGroupLabel>\{nodeName\}<\/MenuGroupLabel>/u);
  assert.match(slashCommandTriggerSource, /insertBlockMenuTitleLabel/u);
  assert.doesNotMatch(slashCommandTriggerSource, /label:\s*"Insert block"/u);
  assert.match(uiUtilsSource, /bulletList:\s*"Bullet list"/u);
  assert.match(uiUtilsSource, /orderedList:\s*"Numbered list"/u);
  assert.match(uiUtilsSource, /taskList:\s*"Task list"/u);
  assert.doesNotMatch(
    dragContextMenuSource,
    /useAiAsk|AskAiShortcutBadge|useCopyAnchorLink|CopyAnchorLinkShortcutBadge|useImageDownload|useTocShowTitle|isTextSelectionValid/u,
  );
});

test("table menus keep only the documented Papyro surface adapter on official menu content", () => {
  assert.match(tableHandleMenuSource, /className="tiptap-table-menu-content"/u);
  assert.match(tableCellHandleMenuSource, /className="tiptap-table-menu-content"/u);
  assert.match(tableHandleMenuSource, /<ColorMenu \/>/u);
  assert.match(tableHandleMenuSource, /<TableAlignMenu index=\{index\} orientation=\{orientation\} \/>/u);
  assert.match(tableHandleMenuSource, /tableContextTitleLabel\(language, orientation\)/u);
  assert.doesNotMatch(tableHandleMenuSource, /ARIA_LABELS/u);
  assert.match(tableCellHandleMenuSource, /<ColorMenu \/>/u);
  assert.match(tableCellHandleMenuSource, /<TableAlignMenu \/>/u);
  assert.match(tableCellHandleMenuSource, /Grip4Icon/u);
  assert.doesNotMatch(tableCellHandleMenuSource, /ChevronDownIcon/u);
  assert.doesNotMatch(
    `${tableHandleMenuSource}\n${tableCellHandleMenuSource}`,
    /PapyroTableCommandMenuContent|createPapyroTableCommandMenuModel|createTableCellHandleCommandMenuModel|contentClassName="tiptap-table-menu-content"/u,
  );
});

test("image node remains the official node UI boundary with local resources handled outside it", () => {
  assert.match(imageNodeFloatingSource, /export function ImageNodeFloating/u);
  assert.match(imageNodeFloatingSource, /ImageDownloadButton/u);
  assert.match(imageNodeViewSource, /NodeViewWrapper/u);
  assert.match(imageNodeViewSource, /NodeViewContent/u);
  assert.doesNotMatch(
    `${imageNodeFloatingSource}\n${imageNodeViewSource}`,
    /papyro:\/\/|window\.papyro|saveLocalImage|resolveLocalImage|desktopResource/u,
  );
});
