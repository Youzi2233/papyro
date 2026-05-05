const CHINESE_LANGUAGE_VALUES = new Set(["chinese", "zh", "zh-cn", "zh_cn"]);

export function normalizeTiptapLanguage(value = "english") {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace("_", "-");
  return CHINESE_LANGUAGE_VALUES.has(normalized) ? "zh-CN" : "en";
}

export function isChineseLanguage(value) {
  return normalizeTiptapLanguage(value) === "zh-CN";
}

export function localizedText(language, english, chinese) {
  return isChineseLanguage(language) ? chinese : english;
}

const GROUP_LABELS = Object.freeze({
  Advanced: "高级",
  Align: "对齐",
  Actions: "操作",
  Blocks: "块",
  Callout: "标注",
  "Cell color": "单元格颜色",
  Cells: "单元格",
  Columns: "列",
  Color: "文字颜色",
  Danger: "危险",
  Headers: "表头",
  Highlight: "高亮",
  Insert: "插入",
  Lists: "列表",
  Navigate: "导航",
  Rows: "行",
  Table: "表格",
  Text: "文本",
});

const BLOCK_ACTION_LABELS = Object.freeze({
  "insert-before": ["Insert above", "在上方插入", "Add a paragraph before this block", "在当前块前添加段落"],
  "insert-after": ["Insert below", "在下方插入", "Add a paragraph after this block", "在当前块后添加段落"],
  paragraph: ["Paragraph", "段落", "Use plain body text", "使用普通正文"],
  "heading-1": ["Heading 1", "一级标题", "Large section title", "大型章节标题"],
  "heading-2": ["Heading 2", "二级标题", "Use a medium section title", "中型章节标题"],
  "heading-3": ["Heading 3", "三级标题", "Small subsection title", "小型小节标题"],
  "bullet-list": ["Bullet list", "无序列表", "Turn this block into bullets", "将当前块转换为项目符号列表"],
  "ordered-list": ["Numbered list", "有序列表", "Turn this block into steps", "将当前块转换为编号步骤"],
  "task-list": ["Task list", "任务列表", "Create Markdown checkboxes", "创建 Markdown 复选框"],
  blockquote: ["Quote", "引用", "Highlight a quoted passage", "突出引用内容"],
  callout: ["Callout", "标注", "Insert a note callout", "插入提示标注"],
  "callout-kind-note": ["Note", "备注", "Switch callout to note", "切换为备注标注"],
  "callout-kind-tip": ["Tip", "提示", "Switch callout to tip", "切换为提示标注"],
  "callout-kind-warning": ["Warning", "警告", "Switch callout to warning", "切换为警告标注"],
  "callout-kind-danger": ["Danger", "危险", "Switch callout to danger", "切换为危险标注"],
  "text-color-ink": ["Default text", "默认文字", "Use the current editor text color", "使用当前编辑器文字颜色"],
  "text-color-muted": ["Muted text", "弱化文字", "De-emphasize supporting content", "弱化辅助内容"],
  "text-color-accent": ["Accent text", "强调文字", "Draw attention without changing structure", "不改变结构地突出内容"],
  "text-color-danger": ["Danger text", "危险文字", "Mark risk, warning, or destructive content", "标记风险、警告或破坏性内容"],
  "highlight-clear": ["Clear highlight", "清除高亮", "Remove highlight from this block", "移除当前块高亮"],
  "highlight-yellow": ["Yellow highlight", "黄色高亮", "Soft review marker", "温和的审阅标记"],
  "highlight-blue": ["Blue highlight", "蓝色高亮", "Reference or information marker", "参考或信息标记"],
  "highlight-green": ["Green highlight", "绿色高亮", "Accepted or positive marker", "接受或正向标记"],
  "code-block": ["Code block", "代码块", "Use a fenced code block", "使用围栏代码块"],
  divider: ["Divider", "分割线", "Insert a horizontal rule", "插入水平分割线"],
  table: ["Table", "表格", "Insert a 3 by 2 table", "插入 3 x 2 表格"],
  "math-block": ["Math block", "公式块", "Insert a display formula", "插入独立公式"],
  mermaid: ["Mermaid diagram", "Mermaid 图表", "Insert a flowchart block", "插入流程图块"],
  image: ["Image", "图片", "Insert Markdown image syntax", "插入 Markdown 图片语法"],
  "copy-block": ["Copy block", "复制当前块", "Copy this block as Markdown", "以 Markdown 复制当前块"],
  "duplicate-block": ["Duplicate block", "重复当前块", "Copy this block below", "在下方复制当前块"],
  delete: ["Delete block", "删除当前块", "Remove this block", "移除当前块"],
});

const SLASH_COMMAND_LABELS = Object.freeze({
  paragraph: ["Paragraph", "段落", "Write plain body text", "书写普通正文", "Text", "文本"],
  "heading-1": ["Heading 1", "一级标题", "Large section title", "大型章节标题", "Text", "文本"],
  "heading-2": ["Heading 2", "二级标题", "Medium section title", "中型章节标题", "Text", "文本"],
  "heading-3": ["Heading 3", "三级标题", "Small section title", "小型小节标题", "Text", "文本"],
  "bullet-list": ["Bullet list", "无序列表", "Create an unordered list", "创建无序列表", "Lists", "列表"],
  "ordered-list": ["Ordered list", "有序列表", "Create a numbered list", "创建编号列表", "Lists", "列表"],
  "task-list": ["Task list", "任务列表", "Insert Markdown checkboxes", "插入 Markdown 复选框", "Lists", "列表"],
  blockquote: ["Quote", "引用", "Highlight a quoted passage", "突出引用内容", "Blocks", "块"],
  callout: ["Callout", "标注", "Insert a note callout", "插入提示标注", "Blocks", "块"],
  "code-block": ["Code block", "代码块", "Insert a fenced code block", "插入围栏代码块", "Blocks", "块"],
  divider: ["Divider", "分割线", "Insert a horizontal rule", "插入水平分割线", "Blocks", "块"],
  table: ["Table", "表格", "Insert a simple Markdown table", "插入 Markdown 表格", "Advanced", "高级"],
  "math-block": ["Math block", "公式块", "Insert a display formula", "插入独立公式", "Advanced", "高级"],
  mermaid: ["Mermaid diagram", "Mermaid 图表", "Insert a Mermaid code fence", "插入 Mermaid 代码围栏", "Advanced", "高级"],
  image: ["Image", "图片", "Insert Markdown image syntax", "插入 Markdown 图片语法", "Advanced", "高级"],
});

const TABLE_COMMAND_LABELS = Object.freeze({
  "add-column-before": ["Insert column left", "左侧插入列", "Left", "左侧"],
  "add-column-after": ["Insert column right", "右侧插入列", "Right", "右侧"],
  "delete-column": ["Delete current column", "删除当前列", "Delete", "删除"],
  "add-row-before": ["Insert row above", "上方插入行", "Above", "上方"],
  "add-row-after": ["Insert row below", "下方插入行", "Below", "下方"],
  "delete-row": ["Delete current row", "删除当前行", "Delete", "删除"],
  "merge-cells": ["Merge selected cells", "合并选中单元格", "Merge", "合并"],
  "split-cell": ["Split current cell", "拆分当前单元格", "Split", "拆分"],
  "merge-or-split": ["Merge or split cells", "合并或拆分单元格", "Auto", "自动"],
  "toggle-header-row": ["Toggle header row", "切换表头行", "Row", "行"],
  "toggle-header-column": ["Toggle header column", "切换表头列", "Column", "列"],
  "toggle-header-cell": ["Toggle header cell", "切换表头单元格", "Cell", "单元格"],
  "align-left": ["Align current cells left", "当前单元格左对齐", "Left", "左对齐"],
  "align-center": ["Align current cells center", "当前单元格居中", "Center", "居中"],
  "align-right": ["Align current cells right", "当前单元格右对齐", "Right", "右对齐"],
  "cell-bg-clear": ["Clear cell background", "清除单元格背景", "Clear", "清除"],
  "cell-bg-yellow": ["Use a soft yellow cell background", "使用柔和黄色背景", "Yellow", "黄色"],
  "cell-bg-blue": ["Use a soft blue cell background", "使用柔和蓝色背景", "Blue", "蓝色"],
  "cell-bg-green": ["Use a soft green cell background", "使用柔和绿色背景", "Green", "绿色"],
  "previous-cell": ["Move to previous cell", "移动到上一个单元格", "Prev", "上一个"],
  "next-cell": ["Move to next cell", "移动到下一个单元格", "Next", "下一个"],
  "fix-table": ["Repair table structure", "修复表格结构", "Repair", "修复"],
  "delete-table": ["Delete table", "删除表格", "Delete", "删除"],
});

function localizedGroup(group, language) {
  return localizedText(language, group, GROUP_LABELS[group] ?? group);
}

export function localizeBlockAction(command, language) {
  const labels = BLOCK_ACTION_LABELS[command.id];
  return {
    ...command,
    title: labels ? localizedText(language, labels[0], labels[1]) : command.title,
    description: labels ? localizedText(language, labels[2], labels[3]) : command.description,
    group: localizedGroup(command.group, language),
  };
}

export function localizeSlashCommand(command, language) {
  const labels = SLASH_COMMAND_LABELS[command.id];
  return {
    ...command,
    title: labels ? localizedText(language, labels[0], labels[1]) : command.title,
    description: labels ? localizedText(language, labels[2], labels[3]) : command.description,
    group: labels ? localizedText(language, labels[4], labels[5]) : localizedGroup(command.group, language),
  };
}

export function localizeTableCommand(command, language) {
  const labels = TABLE_COMMAND_LABELS[command.id];
  return {
    ...command,
    group: localizedGroup(command.group, language),
    title: labels ? localizedText(language, labels[0], labels[1]) : command.title,
    label: labels ? localizedText(language, labels[2], labels[3]) : command.label,
  };
}

export function tableSizeLabel(language, rows, cols) {
  return localizedText(language, `Table ${rows} x ${cols}`, `表格 ${rows} x ${cols}`);
}

export function insertTableLabel(language, rows, cols) {
  const rowCount = Number(rows) || 1;
  const colCount = Number(cols) || 1;
  return localizedText(
    language,
    `Insert ${rowCount} by ${colCount} table`,
    `插入 ${rowCount} 行 ${colCount} 列表格`,
  );
}

export function markdownCommandsLabel(language) {
  return localizedText(language, "Markdown block commands", "Markdown 块命令");
}

export function noCommandsLabel(language) {
  return localizedText(language, "No commands", "没有可用命令");
}

export function calloutOptionLabel(language, title) {
  return localizedText(language, `Insert ${title} callout`, `插入${title}标注`);
}

export function blockHandleInsertLabel(language) {
  return localizedText(language, "Insert block below", "在下方插入块");
}

export function blockHandleActionsLabel(language) {
  return localizedText(language, "Block actions", "块操作");
}

export function tableToolsLabel(language) {
  return localizedText(language, "Table tools", "表格工具");
}

export function addRowBelowLabel(language) {
  return localizedText(language, "Add row below", "在下方添加行");
}

export function addColumnRightLabel(language) {
  return localizedText(language, "Add column right", "在右侧添加列");
}

export function selectTableLabel(language) {
  return localizedText(language, "Select table", "选择整张表格");
}

export function selectTableRowLabel(language, index) {
  const row = Number(index) + 1;
  return localizedText(language, `Select row ${row}`, `选择第 ${row} 行`);
}

export function selectTableColumnLabel(language, index) {
  const column = Number(index) + 1;
  return localizedText(language, `Select column ${column}`, `选择第 ${column} 列`);
}
