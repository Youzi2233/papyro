export type TiptapLanguage = "en" | "zh-CN";

type LanguageInput = unknown;
type LocalizedPair = readonly [english: string, chinese: string];
type LocalizedQuad = readonly [
  englishTitle: string,
  chineseTitle: string,
  englishDescription: string,
  chineseDescription: string,
];
type SlashCommandLabels = readonly [
  englishTitle: string,
  chineseTitle: string,
  englishDescription: string,
  chineseDescription: string,
  englishGroup: string,
  chineseGroup: string,
];
type TableCommandLabels = readonly [
  englishTitle: string,
  chineseTitle: string,
  englishLabel: string,
  chineseLabel: string,
];

type LocalizableCommand = {
  id?: string;
  group: string;
  title?: string;
  description?: string;
  label?: string;
  groupKey?: string;
  sourceGroup?: unknown;
  icon?: string;
  [key: string]: unknown;
};

type CalloutKindOption = {
  kind?: unknown;
  title?: string;
  description?: string;
  [key: string]: unknown;
};

type BlockTypeOption = {
  type?: string;
  level?: number;
  label?: string;
};

type TableSelectionSummary = {
  kind?: string;
  positions?: { size?: number };
  rows?: unknown[];
  columns?: unknown[];
};

const CHINESE_LANGUAGE_VALUES = new Set<string>([
  "chinese",
  "zh",
  "zh-cn",
  "zh_cn",
]);

export function normalizeTiptapLanguage(
  value: LanguageInput = "english",
): TiptapLanguage {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace("_", "-");
  return CHINESE_LANGUAGE_VALUES.has(normalized) ? "zh-CN" : "en";
}

export function isChineseLanguage(value: LanguageInput): boolean {
  return normalizeTiptapLanguage(value) === "zh-CN";
}

export function localizedText(
  language: LanguageInput,
  english: string,
  chinese: string,
): string {
  return isChineseLanguage(language) ? chinese : english;
}

const GROUP_LABELS: Record<string, string> = Object.freeze({
  Advanced: "高级",
  Align: "对齐",
  Arrange: "排列",
  Actions: "操作",
  Blocks: "块",
  Callout: "标注",
  "Cell color": "单元格颜色",
  Cells: "单元格",
  Columns: "列",
  Color: "文字颜色",
  "Code language": "代码语言",
  Danger: "危险",
  Data: "数据",
  Headers: "表头",
  Highlight: "高亮",
  Insert: "插入",
  Lists: "列表",
  Media: "媒体",
  Navigate: "导航",
  Recent: "最近使用",
  Rows: "行",
  Selection: "选择",
  Structure: "结构",
  Style: "样式",
  Table: "表格",
  Text: "文本",
  "Text color": "文字颜色",
});

const BLOCK_ACTION_LABELS: Record<string, LocalizedQuad> = Object.freeze({
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
  "code-language-auto": ["Auto detect", "自动检测", "Let Papyro auto-detect this code block", "让 Papyro 自动检测当前代码块语言"],
  "code-language-plaintext": ["Plain text", "纯文本", "Highlight this block as plain text", "将当前代码块按纯文本显示"],
  "code-language-javascript": ["JavaScript", "JavaScript", "Highlight this block as JavaScript", "将当前代码块按 JavaScript 高亮"],
  "code-language-typescript": ["TypeScript", "TypeScript", "Highlight this block as TypeScript", "将当前代码块按 TypeScript 高亮"],
  "code-language-rust": ["Rust", "Rust", "Highlight this block as Rust", "将当前代码块按 Rust 高亮"],
  "code-language-python": ["Python", "Python", "Highlight this block as Python", "将当前代码块按 Python 高亮"],
  "code-language-go": ["Go", "Go", "Highlight this block as Go", "将当前代码块按 Go 高亮"],
  "code-language-json": ["JSON", "JSON", "Highlight this block as JSON", "将当前代码块按 JSON 高亮"],
  "code-language-bash": ["Bash", "Bash", "Highlight this block as Bash", "将当前代码块按 Bash 高亮"],
  "code-language-markdown": ["Markdown", "Markdown", "Highlight this block as Markdown", "将当前代码块按 Markdown 高亮"],
  "code-language-html": ["HTML", "HTML", "Highlight this block as HTML", "将当前代码块按 HTML 高亮"],
  "code-language-css": ["CSS", "CSS", "Highlight this block as CSS", "将当前代码块按 CSS 高亮"],
  "code-language-sql": ["SQL", "SQL", "Highlight this block as SQL", "将当前代码块按 SQL 高亮"],
  "code-language-yaml": ["YAML", "YAML", "Highlight this block as YAML", "将当前代码块按 YAML 高亮"],
  "code-language-toml": ["TOML", "TOML", "Highlight this block as TOML", "将当前代码块按 TOML 高亮"],
  "code-block": ["Code block", "代码块", "Use a fenced code block", "使用围栏代码块"],
  divider: ["Divider", "分割线", "Insert a horizontal rule", "插入水平分割线"],
  table: ["Table", "表格", "Insert a 3 by 2 table", "插入 3 x 2 表格"],
  "math-block": ["Math block", "公式块", "Insert a display formula", "插入独立公式"],
  mermaid: ["Mermaid diagram", "Mermaid 图表", "Insert a flowchart block", "插入流程图块"],
  image: ["Image", "图片", "Insert Markdown image syntax", "插入 Markdown 图片语法"],
  "reset-formatting": ["Reset formatting", "重置格式", "Clear marks and return to plain text", "清除标记并恢复为普通文本"],
  "copy-block": ["Copy block", "复制当前块", "Copy this block as Markdown", "以 Markdown 复制当前块"],
  "duplicate-block": ["Duplicate block", "重复当前块", "Copy this block below", "在下方复制当前块"],
  "move-block-up": ["Move up", "上移当前块", "Move this block above the previous block", "将当前块移到上一个块之前"],
  "move-block-down": ["Move down", "下移当前块", "Move this block below the next block", "将当前块移到下一个块之后"],
  delete: ["Delete block", "删除当前块", "Remove this block", "移除当前块"],
});

const SLASH_COMMAND_LABELS: Record<string, SlashCommandLabels> = Object.freeze({
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
  table: ["Table", "表格", "Insert a simple Markdown table", "插入 Markdown 表格", "Data", "数据"],
  image: ["Image", "图片", "Insert Markdown image syntax", "插入 Markdown 图片语法", "Media", "媒体"],
  "math-block": ["Math block", "公式块", "Insert a display formula", "插入独立公式", "Advanced", "高级"],
  mermaid: ["Mermaid diagram", "Mermaid 图表", "Insert a Mermaid code fence", "插入 Mermaid 代码围栏", "Advanced", "高级"],
});

const TABLE_COMMAND_LABELS: Record<string, TableCommandLabels> = Object.freeze({
  "add-column-before": ["Insert column left", "左侧插入列", "Left", "左侧"],
  "add-column-after": ["Insert column right", "右侧插入列", "Right", "右侧"],
  "delete-column": ["Delete current column", "删除当前列", "Delete", "删除"],
  "add-row-before": ["Insert row above", "上方插入行", "Above", "上方"],
  "add-row-after": ["Insert row below", "下方插入行", "Below", "下方"],
  "delete-row": ["Delete current row", "删除当前行", "Delete", "删除"],
  "merge-cells": ["Merge selected cells", "合并选中单元格", "Merge", "合并"],
  "split-cell": ["Split merged cell", "拆分合并单元格", "Split", "拆分"],
  "copy-cell-content": ["Copy cell content", "复制单元格内容", "Copy", "复制"],
  "clear-cell-content": ["Clear cell content", "清空单元格内容", "Clear content", "清空内容"],
  "clear-cell-style": ["Clear cell style", "清除单元格样式", "Clear style", "清除样式"],
  "merge-or-split": ["Merge or split cells", "合并或拆分单元格", "Auto", "自动"],
  "toggle-header-row": ["Toggle header row", "切换表头行", "Row", "行"],
  "toggle-header-column": ["Toggle header column", "切换表头列", "Column", "列"],
  "toggle-header-cell": ["Toggle header cell", "切换表头单元格", "Cell", "单元格"],
  "align-left": ["Align current cells left", "当前单元格左对齐", "Left", "左对齐"],
  "align-center": ["Align current cells center", "当前单元格居中", "Center", "居中"],
  "align-right": ["Align current cells right", "当前单元格右对齐", "Right", "右对齐"],
  "cell-text-clear": ["Clear cell text color", "清除单元格文字颜色", "Default", "默认"],
  "cell-text-muted": ["Use muted cell text", "使用弱化文字", "Muted", "弱化"],
  "cell-text-accent": ["Use accent cell text", "使用强调文字", "Accent", "强调"],
  "cell-text-danger": ["Use danger cell text", "使用危险文字", "Danger", "危险"],
  "cell-bg-clear": ["Clear cell background", "清除单元格背景", "Clear", "清除"],
  "cell-bg-yellow": ["Use a soft yellow cell background", "使用柔和黄色背景", "Yellow", "黄色"],
  "cell-bg-blue": ["Use a soft blue cell background", "使用柔和蓝色背景", "Blue", "蓝色"],
  "cell-bg-green": ["Use a soft green cell background", "使用柔和绿色背景", "Green", "绿色"],
  "previous-cell": ["Move to previous cell", "移动到上一个单元格", "Prev", "上一个"],
  "next-cell": ["Move to next cell", "移动到下一个单元格", "Next", "下一个"],
  "fix-table": ["Repair table structure", "修复表格结构", "Repair", "修复"],
  "delete-table": ["Delete table", "删除表格", "Delete", "删除"],
});

const TABLE_COMMAND_DESCRIPTIONS: Record<string, LocalizedPair> = Object.freeze({
  "add-column-before": [
    "Add a column before the selected column.",
    "\u5728\u5f53\u524d\u5217\u5de6\u4fa7\u63d2\u5165\u4e00\u5217\u3002",
  ],
  "add-column-after": [
    "Add a column after the selected column.",
    "\u5728\u5f53\u524d\u5217\u53f3\u4fa7\u63d2\u5165\u4e00\u5217\u3002",
  ],
  "delete-column": [
    "Remove the selected column and its content.",
    "\u5220\u9664\u5f53\u524d\u5217\u53ca\u5176\u5185\u5bb9\u3002",
  ],
  "add-row-before": [
    "Add a row above the selected row.",
    "\u5728\u5f53\u524d\u884c\u4e0a\u65b9\u63d2\u5165\u4e00\u884c\u3002",
  ],
  "add-row-after": [
    "Add a row below the selected row.",
    "\u5728\u5f53\u524d\u884c\u4e0b\u65b9\u63d2\u5165\u4e00\u884c\u3002",
  ],
  "delete-row": [
    "Remove the selected row and its content.",
    "\u5220\u9664\u5f53\u524d\u884c\u53ca\u5176\u5185\u5bb9\u3002",
  ],
  "merge-cells": [
    "Combine the selected cells into one cell.",
    "\u5c06\u9009\u4e2d\u5355\u5143\u683c\u5408\u5e76\u4e3a\u4e00\u4e2a\u5355\u5143\u683c\u3002",
  ],
  "split-cell": [
    "Split a previously merged cell back into cells.",
    "\u5c06\u5df2\u5408\u5e76\u7684\u5355\u5143\u683c\u62c6\u56de\u666e\u901a\u5355\u5143\u683c\u3002",
  ],
  "copy-cell-content": [
    "Copy selected cells as tab-separated text.",
    "\u4ee5\u5236\u8868\u7b26\u6587\u672c\u590d\u5236\u9009\u4e2d\u5355\u5143\u683c\u3002",
  ],
  "clear-cell-content": [
    "Clear text while keeping the table structure.",
    "\u6e05\u7a7a\u5185\u5bb9\uff0c\u4fdd\u7559\u8868\u683c\u7ed3\u6784\u3002",
  ],
  "clear-cell-style": [
    "Remove alignment, colors, and text styling.",
    "\u79fb\u9664\u5bf9\u9f50\u3001\u989c\u8272\u548c\u6587\u5b57\u6837\u5f0f\u3002",
  ],
  "merge-or-split": [
    "Automatically merge or split based on selection.",
    "\u6839\u636e\u9009\u533a\u81ea\u52a8\u5408\u5e76\u6216\u62c6\u5206\u3002",
  ],
  "toggle-header-row": [
    "Turn the current row into a header row.",
    "\u5c06\u5f53\u524d\u884c\u5207\u6362\u4e3a\u8868\u5934\u884c\u3002",
  ],
  "toggle-header-column": [
    "Turn the current column into a header column.",
    "\u5c06\u5f53\u524d\u5217\u5207\u6362\u4e3a\u8868\u5934\u5217\u3002",
  ],
  "toggle-header-cell": [
    "Toggle header styling for the current cell.",
    "\u5207\u6362\u5f53\u524d\u5355\u5143\u683c\u7684\u8868\u5934\u6837\u5f0f\u3002",
  ],
  "align-left": [
    "Align selected cell text to the left.",
    "\u5c06\u9009\u4e2d\u5355\u5143\u683c\u6587\u5b57\u5de6\u5bf9\u9f50\u3002",
  ],
  "align-center": [
    "Center selected cell text.",
    "\u5c06\u9009\u4e2d\u5355\u5143\u683c\u6587\u5b57\u5c45\u4e2d\u3002",
  ],
  "align-right": [
    "Align selected cell text to the right.",
    "\u5c06\u9009\u4e2d\u5355\u5143\u683c\u6587\u5b57\u53f3\u5bf9\u9f50\u3002",
  ],
  "cell-text-clear": [
    "Use the default editor text color.",
    "\u4f7f\u7528\u9ed8\u8ba4\u7f16\u8f91\u5668\u6587\u5b57\u989c\u8272\u3002",
  ],
  "cell-text-muted": [
    "Use a quieter text color for selected cells.",
    "\u4e3a\u9009\u4e2d\u5355\u5143\u683c\u4f7f\u7528\u5f31\u5316\u6587\u5b57\u989c\u8272\u3002",
  ],
  "cell-text-accent": [
    "Use the accent text color for selected cells.",
    "\u4e3a\u9009\u4e2d\u5355\u5143\u683c\u4f7f\u7528\u5f3a\u8c03\u6587\u5b57\u989c\u8272\u3002",
  ],
  "cell-text-danger": [
    "Use the danger text color for selected cells.",
    "\u4e3a\u9009\u4e2d\u5355\u5143\u683c\u4f7f\u7528\u5371\u9669\u6587\u5b57\u989c\u8272\u3002",
  ],
  "cell-bg-clear": [
    "Remove the selected cell background.",
    "\u79fb\u9664\u9009\u4e2d\u5355\u5143\u683c\u80cc\u666f\u8272\u3002",
  ],
  "cell-bg-yellow": [
    "Apply a soft yellow cell background.",
    "\u5e94\u7528\u67d4\u548c\u7684\u9ec4\u8272\u5355\u5143\u683c\u80cc\u666f\u3002",
  ],
  "cell-bg-blue": [
    "Apply a soft blue cell background.",
    "\u5e94\u7528\u67d4\u548c\u7684\u84dd\u8272\u5355\u5143\u683c\u80cc\u666f\u3002",
  ],
  "cell-bg-green": [
    "Apply a soft green cell background.",
    "\u5e94\u7528\u67d4\u548c\u7684\u7eff\u8272\u5355\u5143\u683c\u80cc\u666f\u3002",
  ],
  "previous-cell": [
    "Move focus to the previous table cell.",
    "\u5c06\u7126\u70b9\u79fb\u5230\u4e0a\u4e00\u4e2a\u5355\u5143\u683c\u3002",
  ],
  "next-cell": [
    "Move focus to the next table cell.",
    "\u5c06\u7126\u70b9\u79fb\u5230\u4e0b\u4e00\u4e2a\u5355\u5143\u683c\u3002",
  ],
  "fix-table": [
    "Repair inconsistent table structure if needed.",
    "\u5fc5\u8981\u65f6\u4fee\u590d\u4e0d\u4e00\u81f4\u7684\u8868\u683c\u7ed3\u6784\u3002",
  ],
  "delete-table": [
    "Remove the whole table from the note.",
    "\u4ece\u7b14\u8bb0\u4e2d\u5220\u9664\u6574\u5f20\u8868\u683c\u3002",
  ],
});

const MARK_LABELS: Record<string, LocalizedPair> = Object.freeze({
  bold: ["Bold", "\u52a0\u7c97"],
  italic: ["Italic", "\u659c\u4f53"],
  underline: ["Underline", "\u4e0b\u5212\u7ebf"],
  strike: ["Strikethrough", "\u5220\u9664\u7ebf"],
  code: ["Inline code", "\u884c\u5185\u4ee3\u7801"],
  superscript: ["Superscript", "\u4e0a\u6807"],
  subscript: ["Subscript", "\u4e0b\u6807"],
});

const BLOCK_TYPE_LABELS: Record<string, LocalizedPair> = Object.freeze({
  paragraph: ["Text", "\u6587\u672c"],
  "heading-1": ["Heading 1", "\u4e00\u7ea7\u6807\u9898"],
  "heading-2": ["Heading 2", "\u4e8c\u7ea7\u6807\u9898"],
  "heading-3": ["Heading 3", "\u4e09\u7ea7\u6807\u9898"],
  bulletList: ["Bulleted list", "\u65e0\u5e8f\u5217\u8868"],
  orderedList: ["Numbered list", "\u7f16\u53f7\u5217\u8868"],
  taskList: ["To-do list", "\u4efb\u52a1\u5217\u8868"],
  blockquote: ["Blockquote", "\u5f15\u7528"],
  codeBlock: ["Code block", "\u4ee3\u7801\u5757"],
});

const LIST_LABELS: Record<string, LocalizedPair> = Object.freeze({
  bulletList: ["Bullet List", "\u65e0\u5e8f\u5217\u8868"],
  orderedList: ["Ordered List", "\u6709\u5e8f\u5217\u8868"],
  taskList: ["Task List", "\u4efb\u52a1\u5217\u8868"],
});

const TEXT_ALIGN_LABELS: Record<string, LocalizedPair> = Object.freeze({
  left: ["Align left", "\u5de6\u5bf9\u9f50"],
  center: ["Align center", "\u5c45\u4e2d\u5bf9\u9f50"],
  right: ["Align right", "\u53f3\u5bf9\u9f50"],
  justify: ["Align justify", "\u4e24\u7aef\u5bf9\u9f50"],
});

const HISTORY_LABELS: Record<string, LocalizedPair> = Object.freeze({
  undo: ["Undo", "\u64a4\u9500"],
  redo: ["Redo", "\u91cd\u505a"],
});

const TEXT_COLOR_LABELS: Record<string, string> = Object.freeze({
  "Default text": "\u9ed8\u8ba4\u6587\u5b57",
  "Gray text": "\u7070\u8272\u6587\u5b57",
  "Brown text": "\u68d5\u8272\u6587\u5b57",
  "Orange text": "\u6a59\u8272\u6587\u5b57",
  "Yellow text": "\u9ec4\u8272\u6587\u5b57",
  "Green text": "\u7eff\u8272\u6587\u5b57",
  "Blue text": "\u84dd\u8272\u6587\u5b57",
  "Purple text": "\u7d2b\u8272\u6587\u5b57",
  "Pink text": "\u7c89\u8272\u6587\u5b57",
  "Red text": "\u7ea2\u8272\u6587\u5b57",
});

const HIGHLIGHT_COLOR_LABELS: Record<string, string> = Object.freeze({
  "Default background": "\u9ed8\u8ba4\u80cc\u666f",
  "Gray background": "\u7070\u8272\u80cc\u666f",
  "Brown background": "\u68d5\u8272\u80cc\u666f",
  "Orange background": "\u6a59\u8272\u80cc\u666f",
  "Yellow background": "\u9ec4\u8272\u80cc\u666f",
  "Green background": "\u7eff\u8272\u80cc\u666f",
  "Blue background": "\u84dd\u8272\u80cc\u666f",
  "Purple background": "\u7d2b\u8272\u80cc\u666f",
  "Pink background": "\u7c89\u8272\u80cc\u666f",
  "Red background": "\u7ea2\u8272\u80cc\u666f",
});

function localizedGroup(group: string, language: LanguageInput): string {
  return localizedText(language, group, GROUP_LABELS[group] ?? group);
}

export function localizeBlockAction<T extends LocalizableCommand>(
  command: T,
  language: LanguageInput,
): T & { group: string } {
  const labels = command.id ? BLOCK_ACTION_LABELS[command.id] : undefined;
  return {
    ...command,
    title: labels ? localizedText(language, labels[0], labels[1]) : command.title,
    description: labels ? localizedText(language, labels[2], labels[3]) : command.description,
    group: localizedGroup(command.group, language),
  } as T & { group: string };
}

export function localizeSlashCommand<T extends LocalizableCommand>(
  command: T,
  language: LanguageInput,
): T & { group: string; icon: string } {
  const labels = command.id ? SLASH_COMMAND_LABELS[command.id] : undefined;
  const group = command.sourceGroup
    ? localizedGroup(command.group, language)
    : labels
      ? localizedText(language, labels[4], labels[5])
      : localizedGroup(command.group, language);
  return {
    ...command,
    title: labels ? localizedText(language, labels[0], labels[1]) : command.title,
    description: labels ? localizedText(language, labels[2], labels[3]) : command.description,
    group,
    icon: command.icon ?? "paragraph",
  } as T & { group: string; icon: string };
}

export function localizeTableCommand<T extends LocalizableCommand>(
  command: T,
  language: LanguageInput,
): T & { group: string; groupKey: string } {
  const labels = command.id ? TABLE_COMMAND_LABELS[command.id] : undefined;
  const description = command.id
    ? TABLE_COMMAND_DESCRIPTIONS[command.id]
    : undefined;
  return {
    ...command,
    groupKey: command.groupKey ?? command.group,
    group: localizedGroup(command.group, language),
    title: labels ? localizedText(language, labels[0], labels[1]) : command.title,
    label: labels ? localizedText(language, labels[2], labels[3]) : command.label,
    description: description
      ? localizedText(language, description[0], description[1])
      : command.description,
  } as T & { group: string; groupKey: string };
}

const CALLOUT_KIND_LABELS: Record<string, LocalizedQuad> = Object.freeze({
  NOTE: ["Note", "备注", "Neutral context", "普通补充信息"],
  TIP: ["Tip", "提示", "Helpful suggestion", "有帮助的建议"],
  WARNING: ["Warning", "警告", "Risk or caution", "风险或注意事项"],
  DANGER: ["Danger", "危险", "Critical issue", "关键问题"],
});

export function localizeCalloutKindOption<T extends CalloutKindOption>(
  option: T,
  language: LanguageInput,
): T {
  const kind = String(option?.kind ?? "").trim().toUpperCase();
  const labels = CALLOUT_KIND_LABELS[kind];
  return {
    ...option,
    title: labels
      ? localizedText(language, labels[0], labels[1])
      : option?.title,
    description: labels
      ? localizedText(language, labels[2], labels[3])
      : option?.description,
  } as T;
}

export function markLabel(language: LanguageInput, mark: unknown): string {
  const key = String(mark ?? "");
  const labels = MARK_LABELS[key];
  return labels ? localizedText(language, labels[0], labels[1]) : String(mark ?? "");
}

export function blockTypeLabel(
  language: LanguageInput,
  option: BlockTypeOption = {},
): string {
  const key = option.type === "heading" && option.level
    ? `heading-${option.level}`
    : option.type;
  const labels = key ? BLOCK_TYPE_LABELS[key] : undefined;
  return labels
    ? localizedText(language, labels[0], labels[1])
    : String(option.label ?? option.type ?? "");
}

export function listLabel(language: LanguageInput, type: unknown): string {
  const key = String(type ?? "");
  const labels = LIST_LABELS[key];
  return labels ? localizedText(language, labels[0], labels[1]) : String(type ?? "");
}

export function headingLabel(language: LanguageInput, level: number): string {
  return blockTypeLabel(language, { type: "heading", level });
}

export function textButtonLabel(language: LanguageInput): string {
  return blockTypeLabel(language, { type: "paragraph" });
}

export function blockquoteLabel(language: LanguageInput): string {
  return blockTypeLabel(language, { type: "blockquote" });
}

export function codeBlockLabel(language: LanguageInput): string {
  return blockTypeLabel(language, { type: "codeBlock" });
}

export function textAlignLabel(language: LanguageInput, align: unknown): string {
  const key = String(align ?? "");
  const labels = TEXT_ALIGN_LABELS[key];
  return labels ? localizedText(language, labels[0], labels[1]) : String(align ?? "");
}

export function historyLabel(language: LanguageInput, action: unknown): string {
  const key = String(action ?? "");
  const labels = HISTORY_LABELS[key];
  return labels ? localizedText(language, labels[0], labels[1]) : String(action ?? "");
}

export function turnIntoLabel(language: LanguageInput): string {
  return localizedText(language, "Turn into", "\u8f6c\u6362\u4e3a");
}

export function turnIntoCurrentLabel(
  language: LanguageInput,
  currentLabel?: string,
): string {
  return localizedText(
    language,
    `Turn into (current: ${currentLabel || "Text"})`,
    `\u8f6c\u6362\u4e3a\uff08\u5f53\u524d\uff1a${currentLabel || "\u6587\u672c"}\uff09`,
  );
}

export function linkLabel(language: LanguageInput): string {
  return localizedText(language, "Link", "\u94fe\u63a5");
}

export function linkInputPlaceholder(language: LanguageInput): string {
  return localizedText(language, "Paste a link...", "\u7c98\u8d34\u94fe\u63a5...");
}

export function linkApplyTitle(language: LanguageInput): string {
  return localizedText(language, "Apply link", "\u5e94\u7528\u94fe\u63a5");
}

export function linkOpenTitle(language: LanguageInput): string {
  return localizedText(language, "Open in new window", "\u5728\u65b0\u7a97\u53e3\u6253\u5f00");
}

export function linkRemoveTitle(language: LanguageInput): string {
  return localizedText(language, "Remove link", "\u79fb\u9664\u94fe\u63a5");
}

export function textColorLabel(language: LanguageInput): string {
  return localizedText(language, "Text color", "\u6587\u5b57\u989c\u8272");
}

export function highlightLabel(language: LanguageInput): string {
  return localizedText(language, "Highlight", "\u9ad8\u4eae");
}

export function highlightTextLabel(language: LanguageInput): string {
  return localizedText(language, "Highlight text", "\u9ad8\u4eae\u6587\u5b57");
}

export function removeHighlightLabel(language: LanguageInput): string {
  return localizedText(language, "Remove highlight", "\u79fb\u9664\u9ad8\u4eae");
}

export function recentColorsLabel(language: LanguageInput): string {
  return localizedText(language, "Recently used", "\u6700\u8fd1\u4f7f\u7528");
}

export function highlightColorsLabel(language: LanguageInput): string {
  return localizedText(language, "Highlight colors", "\u9ad8\u4eae\u989c\u8272");
}

export function textColorOptionsLabel(language: LanguageInput): string {
  return localizedText(language, "Text color options", "\u6587\u5b57\u989c\u8272\u9009\u9879");
}

export function colorKindLabel(language: LanguageInput, type: unknown): string {
  return type === "highlight"
    ? localizedText(language, "highlight", "\u9ad8\u4eae")
    : localizedText(language, "text", "\u6587\u5b57");
}

export function textColorOptionLabel(
  language: LanguageInput,
  label: unknown,
): string {
  const key = String(label ?? "");
  return localizedText(language, key, TEXT_COLOR_LABELS[key] ?? key);
}

export function highlightColorOptionLabel(
  language: LanguageInput,
  label: unknown,
): string {
  const key = String(label ?? "");
  return localizedText(
    language,
    key,
    HIGHLIGHT_COLOR_LABELS[key] ?? key,
  );
}

export function colorOptionLabel(
  language: LanguageInput,
  type: unknown,
  label: unknown,
): string {
  return type === "highlight"
    ? highlightColorOptionLabel(language, label)
    : textColorOptionLabel(language, label);
}

export function colorOptionAriaLabel(
  language: LanguageInput,
  type: unknown,
  label: unknown,
): string {
  const option = colorOptionLabel(language, type, label);
  const kind = colorKindLabel(language, type);
  return localizedText(language, `${option} ${kind} color`, `${option}${kind}\u989c\u8272`);
}

export function tableSizeLabel(
  language: LanguageInput,
  rows: number,
  cols: number,
): string {
  return localizedText(language, `Table ${rows} x ${cols}`, `表格 ${rows} x ${cols}`);
}

export function insertTableLabel(
  language: LanguageInput,
  rows: unknown,
  cols: unknown,
): string {
  const rowCount = Number(rows) || 1;
  const colCount = Number(cols) || 1;
  return localizedText(
    language,
    `Insert ${rowCount} by ${colCount} table`,
    `插入 ${rowCount} 行 ${colCount} 列表格`,
  );
}

export function markdownCommandsLabel(language: LanguageInput): string {
  return localizedText(language, "Markdown block commands", "Markdown 块命令");
}

export function formatToolbarLabel(language: LanguageInput): string {
  return localizedText(language, "Text formatting", "\u6587\u672c\u683c\u5f0f");
}

export function sourcePaneLabel(language: LanguageInput): string {
  return localizedText(language, "Markdown source", "Markdown \u6e90\u7801");
}

export function sourceMarkdownParseErrorLabel(language: LanguageInput): string {
  return localizedText(
    language,
    "Unable to parse Markdown source",
    "\u65e0\u6cd5\u89e3\u6790 Markdown \u6e90\u7801",
  );
}

export function loadingEditorLabel(language: LanguageInput): string {
  return localizedText(language, "Loading editor", "\u6b63\u5728\u52a0\u8f7d\u7f16\u8f91\u5668");
}

export function mermaidSourceEditorLabel(language: LanguageInput): string {
  return localizedText(
    language,
    "Edit Mermaid diagram source",
    "\u7f16\u8f91 Mermaid \u56fe\u8868\u6e90\u7801",
  );
}

export function mathSourceEditorLabel(
  language: LanguageInput,
  displayMode = false,
): string {
  return displayMode
    ? localizedText(
        language,
        "Edit display math source",
        "\u7f16\u8f91\u5757\u7ea7\u516c\u5f0f\u6e90\u7801",
      )
    : localizedText(
        language,
        "Edit inline math source",
        "\u7f16\u8f91\u884c\u5185\u516c\u5f0f\u6e90\u7801",
      );
}

export function insertBlockMenuTitleLabel(language: LanguageInput): string {
  return localizedText(language, "Insert block", "\u63d2\u5165\u5185\u5bb9\u5757");
}

export function slashQueryMenuTitleLabel(
  language: LanguageInput,
  query: unknown,
): string {
  const normalizedQuery = String(query ?? "");
  return normalizedQuery ? `/${normalizedQuery}` : insertBlockMenuTitleLabel(language);
}

export function noCommandsLabel(language: LanguageInput): string {
  return localizedText(language, "No commands", "没有可用命令");
}

export function calloutOptionLabel(
  language: LanguageInput,
  title: string,
): string {
  return localizedText(language, `Insert ${title} callout`, `插入${title}标注`);
}

export function blockHandleInsertLabel(language: LanguageInput): string {
  return localizedText(language, "Insert block below", "在下方插入块");
}

export function blockHandleActionsLabel(language: LanguageInput): string {
  return localizedText(language, "Block actions", "块操作");
}

export function blockActionTargetLabel(
  language: LanguageInput,
  kind: unknown,
): string {
  const normalized = String(kind ?? "block").replace(/-/g, "_");
  const labels: Record<string, LocalizedPair> = {
    block: ["Block", "\u5185\u5bb9\u5757"],
    paragraph: ["Paragraph", "\u6bb5\u843d"],
    heading: ["Heading", "\u6807\u9898"],
    list: ["List", "\u5217\u8868"],
    list_item: ["List item", "\u5217\u8868\u9879"],
    code_block: ["Code block", "\u4ee3\u7801\u5757"],
    quote: ["Quote", "\u5f15\u7528"],
    blockquote: ["Quote", "\u5f15\u7528"],
    table: ["Table", "\u8868\u683c"],
    calloutBlock: ["Callout", "\u6807\u6ce8"],
    callout_block: ["Callout", "\u6807\u6ce8"],
  };
  const label = labels[normalized];
  if (label) return localizedText(language, label[0], label[1]);

  const fallback = normalized.replace(/_/g, " ");
  return fallback.charAt(0).toUpperCase() + fallback.slice(1);
}

export function blockActionSubmenuLabel(
  language: LanguageInput,
  submenu: unknown,
): string {
  const labels: Record<string, LocalizedPair> = {
    "turn-into": ["Turn into", "\u8f6c\u6362\u4e3a"],
    "code-language": ["Code language", "\u4ee3\u7801\u8bed\u8a00"],
  };
  const key = String(submenu ?? "");
  const label = labels[key];
  return label ? localizedText(language, label[0], label[1]) : String(submenu ?? "");
}

export function blockActionSubmenuDescription(
  language: LanguageInput,
  submenu: unknown,
): string {
  const labels: Record<string, LocalizedPair> = {
    "turn-into": [
      "Change the current block type",
      "\u66f4\u6539\u5f53\u524d\u5757\u7c7b\u578b",
    ],
    "code-language": [
      "Set highlighting for this code block",
      "\u8bbe\u7f6e\u4ee3\u7801\u5757\u9ad8\u4eae\u8bed\u8a00",
    ],
  };
  const label = labels[String(submenu ?? "")];
  return label ? localizedText(language, label[0], label[1]) : "";
}

export function linkEditorTitleLabel(language: LanguageInput): string {
  return localizedText(language, "Edit link", "\u7f16\u8f91\u94fe\u63a5");
}

export function linkEditorInputLabel(language: LanguageInput): string {
  return localizedText(language, "Link URL", "\u94fe\u63a5\u5730\u5740");
}

export function linkEditorPlaceholder(language: LanguageInput): string {
  return localizedText(language, "https://example.com", "https://example.com");
}

export function linkEditorApplyLabel(language: LanguageInput): string {
  return localizedText(language, "Apply", "\u5e94\u7528");
}

export function linkEditorRemoveLabel(language: LanguageInput): string {
  return localizedText(language, "Remove", "\u79fb\u9664");
}

export function linkEditorCloseLabel(language: LanguageInput): string {
  return localizedText(language, "Close link editor", "\u5173\u95ed\u94fe\u63a5\u7f16\u8f91\u5668");
}

export function linkEditorInvalidLabel(language: LanguageInput): string {
  return localizedText(
    language,
    "Enter a valid http, https, mailto, tel, or relative link.",
    "\u8bf7\u8f93\u5165\u6709\u6548\u7684 http\u3001https\u3001mailto\u3001tel \u6216\u76f8\u5bf9\u94fe\u63a5\u3002",
  );
}

export function tableToolsLabel(language: LanguageInput): string {
  return localizedText(language, "Table tools", "表格工具");
}

export function tableCellActionsLabel(language: LanguageInput): string {
  return localizedText(language, "Cell actions", "单元格操作");
}

export function tableSelectionActionsLabel(language: LanguageInput): string {
  return localizedText(language, "Selection actions", "选区操作");
}

export function tableContextEyebrowLabel(language: LanguageInput): string {
  return localizedText(language, "Table", "表格");
}

export function tableContextTitleLabel(
  language: LanguageInput,
  selectionKind: unknown,
): string {
  const labels: Record<string, LocalizedPair> = {
    cell: ["Cell actions", "单元格操作"],
    cells: ["Selection actions", "选区操作"],
    row: ["Row actions", "行操作"],
    column: ["Column actions", "列操作"],
    table: ["Table actions", "整表操作"],
  };
  const label = labels[String(selectionKind ?? "")] ?? labels.cell;
  return localizedText(language, label[0], label[1]);
}

export function tableContextSubtitleLabel(
  language: LanguageInput,
  selection: TableSelectionSummary = {},
): string {
  const kind = selection?.kind ?? "cell";
  const selectedCount = selection?.positions?.size ?? 0;
  if (kind === "table") {
    return localizedText(language, "Whole table selected", "已选择整张表");
  }
  if (kind === "row") {
    const rows = selection?.rows ?? [];
    if (rows.length === 1) {
      const row = Number(rows[0]) + 1;
      return localizedText(language, `Row ${row}`, `第 ${row} 行`);
    }
    return localizedText(language, `${rows.length} rows selected`, `已选择 ${rows.length} 行`);
  }
  if (kind === "column") {
    const columns = selection?.columns ?? [];
    if (columns.length === 1) {
      const column = Number(columns[0]) + 1;
      return localizedText(language, `Column ${column}`, `第 ${column} 列`);
    }
    return localizedText(
      language,
      `${columns.length} columns selected`,
      `已选择 ${columns.length} 列`,
    );
  }
  if (kind === "cells" || selectedCount > 1) {
    const count = Math.max(2, selectedCount);
    return localizedText(language, `${count} cells selected`, `已选择 ${count} 个单元格`);
  }
  if (selectedCount === 1) {
    return localizedText(language, "1 cell selected", "已选择 1 个单元格");
  }
  return localizedText(language, "Current cell", "当前单元格");
}

export function tableCommandMenuSectionLabel(
  language: LanguageInput,
  section: unknown,
): string {
  const labels: Record<string, LocalizedPair> = {
    structure: ["Structure", "结构"],
    content: ["Content", "内容"],
    style: ["Style", "样式"],
    danger: ["Danger", "危险"],
  };
  const label = labels[String(section ?? "")];
  return label ? localizedText(language, label[0], label[1]) : String(section ?? "");
}

export function tableCommandLayoutGroupLabel(
  language: LanguageInput,
  layoutGroup: unknown,
): string {
  const labels: Record<string, LocalizedPair> = {
    align: ["Alignment", "\u5bf9\u9f50"],
    "text-color": ["Text color", "\u6587\u5b57\u989c\u8272"],
    "cell-color": ["Cell color", "\u5355\u5143\u683c\u989c\u8272"],
  };
  const label = labels[String(layoutGroup ?? "")];
  return label ? localizedText(language, label[0], label[1]) : String(layoutGroup ?? "");
}

export function tableCommandLayoutGroupDescription(
  language: LanguageInput,
  layoutGroup: unknown,
): string {
  const labels: Record<string, LocalizedPair> = {
    align: [
      "Choose horizontal alignment.",
      "\u9009\u62e9\u6c34\u5e73\u5bf9\u9f50\u65b9\u5f0f\u3002",
    ],
    "text-color": [
      "Choose the text color.",
      "\u9009\u62e9\u6587\u5b57\u989c\u8272\u3002",
    ],
    "cell-color": [
      "Choose the cell background.",
      "\u9009\u62e9\u5355\u5143\u683c\u80cc\u666f\u8272\u3002",
    ],
  };
  const label = labels[String(layoutGroup ?? "")];
  return label ? localizedText(language, label[0], label[1]) : "";
}

export function addRowBelowLabel(language: LanguageInput): string {
  return localizedText(language, "Add row below", "在下方添加行");
}

export function addColumnRightLabel(language: LanguageInput): string {
  return localizedText(language, "Add column right", "在右侧添加列");
}

export function insertBlockAfterLabel(language: LanguageInput): string {
  return localizedText(language, "Insert block after", "在下方插入内容块");
}

export function insertBlockBeforeLabel(language: LanguageInput): string {
  return localizedText(language, "Insert block before", "在上方插入内容块");
}

export function insertBlockAtEdgeLabel(
  language: LanguageInput,
  edge = "after",
): string {
  return edge === "before"
    ? insertBlockBeforeLabel(language)
    : insertBlockAfterLabel(language);
}

export function selectTableRowLabel(
  language: LanguageInput,
  index: unknown,
): string {
  const row = Number(index) + 1;
  return localizedText(language, `Select row ${row}`, `选择第 ${row} 行`);
}

export function selectTableColumnLabel(
  language: LanguageInput,
  index: unknown,
): string {
  const column = Number(index) + 1;
  return localizedText(language, `Select column ${column}`, `选择第 ${column} 列`);
}
