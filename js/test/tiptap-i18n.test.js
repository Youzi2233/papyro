import test from "node:test";
import assert from "node:assert/strict";

import {
  addColumnRightLabel,
  addRowBelowLabel,
  blockHandleActionsLabel,
  blockHandleInsertLabel,
  insertTableLabel,
  localizeCalloutKindOption,
  localizeSlashCommand,
  localizeTableCommand,
  markdownCommandsLabel,
  normalizeTiptapLanguage,
  selectTableColumnLabel,
  selectTableRowLabel,
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
