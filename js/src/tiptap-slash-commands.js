const DEFAULT_LIMIT = 8;

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function freezeCommand(command) {
  return Object.freeze({
    ...command,
    aliases: Object.freeze([...(command.aliases ?? [])]),
    keywords: Object.freeze([...(command.keywords ?? [])]),
  });
}

function editorCommand(editor, commandName, ...args) {
  const command = editor?.commands?.[commandName];
  if (typeof command !== "function") {
    return false;
  }
  return command(...args) !== false;
}

function insertMarkdown(editor, markdown) {
  return editorCommand(editor, "insertContent", markdown, { contentType: "markdown" });
}

function focusEditor(editor) {
  editor?.commands?.focus?.();
}

function runEditorCommand(editor, commandName, args = [], fallbackMarkdown) {
  const ok = editorCommand(editor, commandName, ...args);
  if (!ok && fallbackMarkdown) {
    return insertMarkdown(editor, fallbackMarkdown);
  }
  return ok;
}

function commandSearchText(command) {
  return [
    command.id,
    command.title,
    command.description,
    command.group,
    ...command.aliases,
    ...command.keywords,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(" ");
}

function scoreCommand(command, query) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return command.priority ?? 100;

  const title = normalizeText(command.title);
  const id = normalizeText(command.id);
  const aliases = command.aliases.map(normalizeText);
  const keywords = command.keywords.map(normalizeText);
  const haystack = commandSearchText(command);

  if (id === normalizedQuery || aliases.includes(normalizedQuery)) return 0;
  if (title === normalizedQuery) return 1;
  if (id.startsWith(normalizedQuery)) return 2;
  if (title.startsWith(normalizedQuery)) return 3;
  if (aliases.some((alias) => alias.startsWith(normalizedQuery))) return 4;
  if (keywords.some((keyword) => keyword.startsWith(normalizedQuery))) return 5;
  if (haystack.includes(normalizedQuery)) return 6;
  return null;
}

function createCommand({
  id,
  title,
  description,
  group,
  aliases = [],
  keywords = [],
  priority = 100,
  run,
}) {
  if (!id || typeof run !== "function") {
    throw new TypeError("Tiptap slash commands require an id and run function");
  }

  return freezeCommand({
    id,
    title,
    description,
    group,
    aliases,
    keywords,
    priority,
    run,
  });
}

export const PAPYRO_TIPTAP_SLASH_COMMANDS = Object.freeze([
  createCommand({
    id: "paragraph",
    title: "Paragraph",
    description: "Write plain body text",
    group: "Text",
    aliases: ["p", "text"],
    keywords: ["body", "normal", "文本", "正文", "段落"],
    priority: 10,
    run: ({ editor }) => runEditorCommand(editor, "setParagraph"),
  }),
  createCommand({
    id: "heading-1",
    title: "Heading 1",
    description: "Large section title",
    group: "Text",
    aliases: ["h1", "title"],
    keywords: ["heading", "headline", "标题", "一级标题"],
    priority: 20,
    run: ({ editor }) => runEditorCommand(editor, "toggleHeading", [{ level: 1 }], "# "),
  }),
  createCommand({
    id: "heading-2",
    title: "Heading 2",
    description: "Medium section title",
    group: "Text",
    aliases: ["h2", "subtitle"],
    keywords: ["heading", "section", "标题", "二级标题"],
    priority: 21,
    run: ({ editor }) => runEditorCommand(editor, "toggleHeading", [{ level: 2 }], "## "),
  }),
  createCommand({
    id: "heading-3",
    title: "Heading 3",
    description: "Small section title",
    group: "Text",
    aliases: ["h3"],
    keywords: ["heading", "subsection", "标题", "三级标题"],
    priority: 22,
    run: ({ editor }) => runEditorCommand(editor, "toggleHeading", [{ level: 3 }], "### "),
  }),
  createCommand({
    id: "bullet-list",
    title: "Bullet list",
    description: "Create an unordered list",
    group: "Lists",
    aliases: ["ul", "list"],
    keywords: ["bullet", "unordered", "列表", "无序列表"],
    priority: 30,
    run: ({ editor }) => runEditorCommand(editor, "toggleBulletList", [], "- "),
  }),
  createCommand({
    id: "ordered-list",
    title: "Ordered list",
    description: "Create a numbered list",
    group: "Lists",
    aliases: ["ol", "numbered"],
    keywords: ["number", "ordered", "列表", "有序列表"],
    priority: 31,
    run: ({ editor }) => runEditorCommand(editor, "toggleOrderedList", [], "1. "),
  }),
  createCommand({
    id: "task-list",
    title: "Task list",
    description: "Insert Markdown checkboxes",
    group: "Lists",
    aliases: ["todo", "checkbox"],
    keywords: ["task", "check", "待办", "任务", "复选框"],
    priority: 32,
    run: ({ editor }) => insertMarkdown(editor, "- [ ] "),
  }),
  createCommand({
    id: "blockquote",
    title: "Quote",
    description: "Highlight a quoted passage",
    group: "Blocks",
    aliases: ["quote"],
    keywords: ["blockquote", "引用"],
    priority: 40,
    run: ({ editor }) => runEditorCommand(editor, "toggleBlockquote", [], "> "),
  }),
  createCommand({
    id: "code-block",
    title: "Code block",
    description: "Insert a fenced code block",
    group: "Blocks",
    aliases: ["code", "fence"],
    keywords: ["programming", "代码", "代码块"],
    priority: 41,
    run: ({ editor }) =>
      runEditorCommand(editor, "toggleCodeBlock", [], "```\ncode\n```"),
  }),
  createCommand({
    id: "divider",
    title: "Divider",
    description: "Insert a horizontal rule",
    group: "Blocks",
    aliases: ["hr", "line"],
    keywords: ["separator", "rule", "分割线"],
    priority: 42,
    run: ({ editor }) => runEditorCommand(editor, "setHorizontalRule", [], "\n---\n"),
  }),
  createCommand({
    id: "table",
    title: "Table",
    description: "Insert a simple Markdown table",
    group: "Advanced",
    aliases: ["grid"],
    keywords: ["cells", "表格"],
    priority: 50,
    run: ({ editor }) =>
      insertMarkdown(editor, "\n| Column | Notes |\n| --- | --- |\n|  |  |\n"),
  }),
  createCommand({
    id: "math-block",
    title: "Math block",
    description: "Insert a display formula",
    group: "Advanced",
    aliases: ["math", "formula"],
    keywords: ["latex", "equation", "公式", "数学"],
    priority: 51,
    run: ({ editor }) => insertMarkdown(editor, "\n$$\n\n$$\n"),
  }),
  createCommand({
    id: "mermaid",
    title: "Mermaid diagram",
    description: "Insert a Mermaid code fence",
    group: "Advanced",
    aliases: ["diagram", "flowchart"],
    keywords: ["chart", "graph", "图表", "流程图"],
    priority: 52,
    run: ({ editor }) =>
      insertMarkdown(editor, "\n```mermaid\nflowchart TD\n  A --> B\n```\n"),
  }),
]);

export class TiptapSlashCommandController {
  #commands;

  constructor(commands = PAPYRO_TIPTAP_SLASH_COMMANDS) {
    this.#commands = Object.freeze([...commands]);
  }

  get commands() {
    return this.#commands;
  }

  find(commandId) {
    const id = normalizeText(commandId);
    return this.#commands.find((command) => command.id === id) ?? null;
  }

  query(query, { limit = DEFAULT_LIMIT } = {}) {
    return this.#commands
      .map((command, index) => ({
        command,
        index,
        score: scoreCommand(command, query),
      }))
      .filter((match) => match.score !== null)
      .sort((a, b) => a.score - b.score || a.command.priority - b.command.priority || a.index - b.index)
      .slice(0, Math.max(0, limit))
      .map((match) => match.command);
  }

  run(commandId, context = {}) {
    const command = this.find(commandId);
    if (!command) {
      return {
        ok: false,
        error: "unknown_slash_command",
        commandId,
      };
    }

    const ok = command.run(context) !== false;
    if (ok) {
      focusEditor(context.editor);
    }

    return {
      ok,
      commandId: command.id,
      error: ok ? null : "slash_command_failed",
    };
  }
}

export function createTiptapSlashCommandController(commands) {
  return new TiptapSlashCommandController(commands);
}
