import test from "node:test";
import assert from "node:assert/strict";

import {
  addColumnRightLabel,
  addRowBelowLabel,
  blockHandleActionsLabel,
  blockHandleInsertLabel,
  formatToolbarLabel,
  insertBlockAfterLabel,
  insertBlockAtEdgeLabel,
  insertBlockBeforeLabel,
  insertTableLabel,
  loadingEditorLabel,
  localizeCalloutKindOption,
  localizeSlashCommand,
  localizeTableCommand,
  markdownCommandsLabel,
  mathSourceEditorLabel,
  mermaidSourceEditorLabel,
  normalizeTiptapLanguage,
  selectTableColumnLabel,
  selectTableRowLabel,
  sourceMarkdownParseErrorLabel,
  sourcePaneLabel,
  tableCellActionsLabel,
  tableSelectionActionsLabel,
  tableSizeLabel,
  tableToolsLabel,
} from "../src/tiptap-i18n.js";

test("Tiptap i18n normalizes Chinese language values", () => {
  assert.equal(normalizeTiptapLanguage("Chinese"), "zh-CN");
  assert.equal(normalizeTiptapLanguage("zh_CN"), "zh-CN");
  assert.equal(normalizeTiptapLanguage("english"), "en");
});

test("Tiptap format toolbar label follows editor language", () => {
  assert.equal(formatToolbarLabel("english"), "Text formatting");
  assert.equal(formatToolbarLabel("Chinese"), "\u6587\u672c\u683c\u5f0f");
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
