import test from "node:test";
import assert from "node:assert/strict";

import {
  addColumnRightLabel,
  addRowBelowLabel,
  blockHandleActionsLabel,
  blockHandleInsertLabel,
  colorOptionAriaLabel,
  deleteNodeLabel,
  formatToolbarLabel,
  headingLabel,
  historyLabel,
  imageAlignLabel,
  imageCaptionLabel,
  imageDownloadLabel,
  imageReplaceLabel,
  imageUploadLabel,
  indentLabel,
  insertBlockAfterLabel,
  insertBlockAtEdgeLabel,
  insertBlockBeforeLabel,
  insertTableLabel,
  linkInputPlaceholder,
  listLabel,
  loadingEditorLabel,
  localizeCalloutKindOption,
  localizeSlashCommand,
  localizeTableCommand,
  markLabel,
  markdownCommandsLabel,
  mathSourceEditorLabel,
  mermaidSourceEditorLabel,
  normalizeTiptapLanguage,
  selectTableColumnLabel,
  selectTableRowLabel,
  sourceMarkdownParseErrorLabel,
  sourcePaneLabel,
  resetFormattingLabel,
  tableCellActionsLabel,
  tableCommandMenuSectionLabel,
  tableSelectionActionsLabel,
  tableSizeLabel,
  tableToolsLabel,
  textAlignLabel,
  turnIntoCurrentLabel,
} from "../src/tiptap-i18n.ts";

test("Tiptap i18n normalizes Chinese language values", () => {
  assert.equal(normalizeTiptapLanguage("Chinese"), "zh-CN");
  assert.equal(normalizeTiptapLanguage("zh_CN"), "zh-CN");
  assert.equal(normalizeTiptapLanguage("english"), "en");
});

test("Tiptap format toolbar label follows editor language", () => {
  assert.equal(formatToolbarLabel("english"), "Text formatting");
  assert.equal(formatToolbarLabel("Chinese"), "\u6587\u672c\u683c\u5f0f");
});

test("Tiptap React chrome labels follow editor language", () => {
  assert.equal(markLabel("Chinese", "bold"), "\u52a0\u7c97");
  assert.equal(headingLabel("Chinese", 2), "\u4e8c\u7ea7\u6807\u9898");
  assert.equal(listLabel("Chinese", "taskList"), "\u4efb\u52a1\u5217\u8868");
  assert.equal(textAlignLabel("Chinese", "center"), "\u5c45\u4e2d\u5bf9\u9f50");
  assert.equal(indentLabel("Chinese", "indent"), "\u589e\u52a0\u7f29\u8fdb");
  assert.equal(historyLabel("Chinese", "undo"), "\u64a4\u9500");
  assert.equal(
    turnIntoCurrentLabel("Chinese", "\u6587\u672c"),
    "\u8f6c\u6362\u4e3a\uff08\u5f53\u524d\uff1a\u6587\u672c\uff09",
  );
  assert.equal(linkInputPlaceholder("Chinese"), "\u7c98\u8d34\u94fe\u63a5...");
  assert.equal(
    colorOptionAriaLabel("Chinese", "highlight", "Yellow background"),
    "\u9ec4\u8272\u80cc\u666f\u9ad8\u4eae\u989c\u8272",
  );
  assert.equal(imageAlignLabel("Chinese", "center"), "\u56fe\u7247\u5c45\u4e2d");
  assert.equal(imageUploadLabel("Chinese"), "\u6dfb\u52a0\u56fe\u7247");
  assert.equal(imageReplaceLabel("Chinese"), "\u66ff\u6362\u56fe\u7247");
  assert.equal(imageDownloadLabel("Chinese"), "\u4e0b\u8f7d\u56fe\u7247");
  assert.equal(imageCaptionLabel("Chinese"), "\u56fe\u7247\u8bf4\u660e");
  assert.equal(deleteNodeLabel("Chinese"), "\u5220\u9664");
  assert.equal(resetFormattingLabel("Chinese"), "\u91cd\u7f6e\u683c\u5f0f");
});

test("Tiptap editor surface labels follow editor language", () => {
  assert.equal(sourcePaneLabel("Chinese"), "Markdown \u6e90\u7801");
  assert.equal(sourceMarkdownParseErrorLabel("Chinese"), "\u65e0\u6cd5\u89e3\u6790 Markdown \u6e90\u7801");
  assert.equal(loadingEditorLabel("Chinese"), "\u6b63\u5728\u52a0\u8f7d\u7f16\u8f91\u5668");
  assert.equal(mermaidSourceEditorLabel("Chinese"), "\u7f16\u8f91 Mermaid \u56fe\u8868\u6e90\u7801");
  assert.equal(mathSourceEditorLabel("Chinese", true), "\u7f16\u8f91\u5757\u7ea7\u516c\u5f0f\u6e90\u7801");
  assert.equal(mathSourceEditorLabel("Chinese", false), "\u7f16\u8f91\u884c\u5185\u516c\u5f0f\u6e90\u7801");
});

test("Tiptap slash commands expose readable Chinese labels", () => {
  const command = localizeSlashCommand(
    {
      id: "heading-1",
      title: "Heading 1",
      description: "Large section title",
      group: "Text",
    },
    "Chinese",
  );

  assert.equal(command.title, "一级标题");
  assert.equal(command.description, "大型章节标题");
  assert.equal(command.group, "文本");
});

test("Tiptap table commands expose readable Chinese labels", () => {
  const command = localizeTableCommand(
    {
      id: "align-center",
      group: "Align",
      title: "Align current cells center",
      label: "Center",
    },
    "Chinese",
  );

  assert.equal(command.group, "对齐");
  assert.equal(command.title, "当前单元格居中");
  assert.equal(command.label, "居中");
  assert.equal(command.description, "将选中单元格文字居中。");
});

test("Tiptap floating chrome exposes readable Chinese labels", () => {
  assert.equal(blockHandleInsertLabel("Chinese"), "在下方插入块");
  assert.equal(blockHandleActionsLabel("Chinese"), "块操作");
  assert.equal(markdownCommandsLabel("Chinese"), "Markdown 块命令");
  assert.equal(tableToolsLabel("Chinese"), "表格工具");
  assert.equal(tableCellActionsLabel("Chinese"), "单元格操作");
  assert.equal(tableSelectionActionsLabel("Chinese"), "选区操作");
  assert.equal(tableCommandMenuSectionLabel("Chinese", "structure"), "结构");
  assert.equal(tableCommandMenuSectionLabel("Chinese", "content"), "内容");
  assert.equal(tableCommandMenuSectionLabel("Chinese", "style"), "样式");
  assert.equal(tableCommandMenuSectionLabel("Chinese", "danger"), "危险");
  assert.equal(addRowBelowLabel("Chinese"), "在下方添加行");
  assert.equal(addColumnRightLabel("Chinese"), "在右侧添加列");
  assert.equal(insertBlockAfterLabel("Chinese"), "在下方插入内容块");
  assert.equal(insertBlockBeforeLabel("Chinese"), "在上方插入内容块");
  assert.equal(insertBlockAtEdgeLabel("Chinese", "before"), "在上方插入内容块");
  assert.equal(insertBlockAtEdgeLabel("Chinese", "after"), "在下方插入内容块");
  assert.equal(tableSizeLabel("Chinese", 2, 3), "表格 2 x 3");
  assert.equal(insertTableLabel("Chinese", 2, 3), "插入 2 行 3 列表格");
  assert.equal(selectTableRowLabel("Chinese", 1), "选择第 2 行");
  assert.equal(selectTableColumnLabel("Chinese", 2), "选择第 3 列");
});

test("Tiptap callout options expose readable Chinese labels", () => {
  const option = localizeCalloutKindOption(
    {
      kind: "NOTE",
      title: "Note",
      description: "Neutral context",
    },
    "Chinese",
  );

  assert.equal(option.title, "备注");
  assert.equal(option.description, "普通补充信息");
});
