import {
  createMarkdownCallout,
  createMarkdownTable,
  normalizeCalloutKind,
} from "./tiptap-markdown-snippets.js";
import { normalizeCodeBlockLanguage } from "./tiptap-code-block.js";
import { localizeSlashCommand, normalizeTiptapLanguage } from "./tiptap-i18n.js";

const DEFAULT_LIMIT = 8;
const DEFAULT_RECENT_LIMIT = 4;
const RECENT_GROUP = "Recent";

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

export { createMarkdownCallout, createMarkdownTable };


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

function normalizeSlashCodeLanguage(language) {
  const raw = String(language ?? "").trim().toLowerCase();
  if (!raw || raw === "auto") return null;
  return normalizeCodeBlockLanguage(raw);
}

export function createMarkdownCodeBlock(language = null) {
  const normalized = normalizeSlashCodeLanguage(language);
  return `\`\`\`${normalized ?? ""}\ncode\n\`\`\``;
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

function sortCommandMatches(matches, query, recentCommandIds = []) {
  const normalizedQuery = normalizeText(query);
  const recentOrder = new Map(recentCommandIds.map((id, index) => [id, index]));
  return [...matches].sort((a, b) => {
    if (!normalizedQuery) {
      const leftRecent = recentOrder.has(a.command.id)
        ? recentOrder.get(a.command.id)
        : Number.POSITIVE_INFINITY;
      const rightRecent = recentOrder.has(b.command.id)
        ? recentOrder.get(b.command.id)
        : Number.POSITIVE_INFINITY;
      if (leftRecent !== rightRecent) return leftRecent - rightRecent;
    }
    return a.score - b.score || a.command.priority - b.command.priority || a.index - b.index;
  });
}

function localizeQueryMatch(match, visibleIndex, { locale, recentCommandIds = [], query = "" } = {}) {
  const normalizedQuery = normalizeText(query);
  const recent = !normalizedQuery && recentCommandIds.includes(match.command.id);
  const command = recent
    ? {
        ...match.command,
        group: RECENT_GROUP,
        sourceGroup: match.command.group,
      }
    : match.command;

  return {
    ...localizeSlashCommand(command, locale),
    index: visibleIndex,
    sourceIndex: match.index,
    recent,
  };
}

function createCommand({
  id,
  title,
  description,
  group,
  icon = "paragraph",
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
    icon,
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
    icon: "paragraph",
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
    icon: "heading-1",
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
    icon: "heading-2",
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
    icon: "heading-3",
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
    icon: "bullet-list",
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
    icon: "ordered-list",
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
    icon: "task-list",
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
    icon: "quote",
    aliases: ["quote"],
    keywords: ["blockquote", "引用"],
    priority: 40,
    run: ({ editor }) => runEditorCommand(editor, "toggleBlockquote", [], "> "),
  }),
  createCommand({
    id: "callout",
    title: "Callout",
    description: "Insert a note callout",
    group: "Blocks",
    icon: "callout",
    aliases: ["note", "alert", "admonition"],
    keywords: ["callout", "notice", "tip", "warning"],
    priority: 41,
    run: ({ editor, calloutKind = "NOTE" }) => {
      const kind = normalizeCalloutKind(calloutKind);
      return runEditorCommand(
        editor,
        "setCalloutBlock",
        [{ kind, text: "Callout text" }],
        createMarkdownCallout(kind),
      );
    },
  }),
  createCommand({
    id: "code-block",
    title: "Code block",
    description: "Insert a fenced code block",
    group: "Blocks",
    icon: "code-block",
    aliases: ["code", "fence"],
    keywords: ["programming", "代码", "代码块"],
    priority: 42,
    run: ({ editor, codeLanguage = null }) => {
      const language = normalizeSlashCodeLanguage(codeLanguage);
      return runEditorCommand(
        editor,
        "toggleCodeBlock",
        language ? [{ language }] : [],
        createMarkdownCodeBlock(language),
      );
    },
  }),
  createCommand({
    id: "divider",
    title: "Divider",
    description: "Insert a horizontal rule",
    group: "Blocks",
    icon: "divider",
    aliases: ["hr", "line"],
    keywords: ["separator", "rule", "分割线"],
    priority: 43,
    run: ({ editor }) => runEditorCommand(editor, "setHorizontalRule", [], "\n---\n"),
  }),
  createCommand({
    id: "table",
    title: "Table",
    description: "Insert a simple Markdown table",
    group: "Data",
    icon: "table",
    aliases: ["grid"],
    keywords: ["cells", "表格"],
    priority: 50,
    run: ({ editor, entry, tableSize = {} }) => {
      const rows = Math.max(1, Number(tableSize.rows) || 3);
      const cols = Math.max(1, Number(tableSize.cols) || 2);
      const ok = runEditorCommand(
        editor,
        "insertTable",
        [{ rows, cols, withHeaderRow: true }],
        createMarkdownTable(rows, cols),
      );
      return ok;
    },
  }),
  createCommand({
    id: "image",
    title: "Image",
    description: "Insert Markdown image syntax",
    group: "Media",
    icon: "image",
    aliases: ["img", "picture"],
    keywords: ["media", "asset", "图片", "图像"],
    priority: 51,
    run: ({ editor }) =>
      runEditorCommand(
        editor,
        "setImage",
        [{ src: "assets/image.png", alt: "alt text", title: "" }],
        "![alt text](assets/image.png)",
      ),
  }),
  createCommand({
    id: "math-block",
    title: "Math block",
    description: "Insert a display formula",
    group: "Advanced",
    icon: "math",
    aliases: ["math", "formula"],
    keywords: ["latex", "equation", "公式", "数学"],
    priority: 52,
    run: ({ editor }) =>
      runEditorCommand(editor, "setMathBlock", [{ source: "x^2 + y^2 = z^2" }], "\n$$\n\n$$\n"),
  }),
  createCommand({
    id: "mermaid",
    title: "Mermaid diagram",
    description: "Insert a Mermaid code fence",
    group: "Advanced",
    icon: "mermaid",
    aliases: ["diagram", "flowchart"],
    keywords: ["chart", "graph", "图表", "流程图"],
    priority: 53,
    run: ({ editor }) =>
      runEditorCommand(
        editor,
        "setMermaidBlock",
        [{ source: "flowchart TD\n  A --> B" }],
        "\n```mermaid\nflowchart TD\n  A --> B\n```\n",
      ),
  }),
]);

export class TiptapSlashCommandController {
  #commands;
  #language;
  #recentCommandIds = [];
  #recentLimit;

  constructor(commands = PAPYRO_TIPTAP_SLASH_COMMANDS, { language = "english", recentLimit = DEFAULT_RECENT_LIMIT } = {}) {
    this.#commands = Object.freeze([...commands]);
    this.#language = normalizeTiptapLanguage(language);
    this.#recentLimit = Math.max(0, Number(recentLimit) || 0);
  }

  get commands() {
    return this.#commands;
  }

  get recentCommandIds() {
    return [...this.#recentCommandIds];
  }

  find(commandId) {
    const id = normalizeText(commandId);
    return this.#commands.find((command) => command.id === id) ?? null;
  }

  setLanguage(language) {
    this.#language = normalizeTiptapLanguage(language);
  }

  recordUsage(commandId) {
    const command = this.find(commandId);
    if (!command || this.#recentLimit <= 0) {
      return this.recentCommandIds;
    }

    this.#recentCommandIds = [
      command.id,
      ...this.#recentCommandIds.filter((id) => id !== command.id),
    ].slice(0, this.#recentLimit);
    return this.recentCommandIds;
  }

  query(query, { limit = DEFAULT_LIMIT, language = this.#language } = {}) {
    const locale = normalizeTiptapLanguage(language);
    const matches = this.#commands
      .map((command, index) => ({
        command,
        index,
        score: scoreCommand(command, query),
      }))
      .filter((match) => match.score !== null)
      .sort((a, b) => a.index - b.index);

    return sortCommandMatches(matches, query, this.#recentCommandIds)
      .slice(0, Math.max(0, limit))
      .map((match, visibleIndex) =>
        localizeQueryMatch(match, visibleIndex, {
          locale,
          query,
          recentCommandIds: this.#recentCommandIds,
        }),
      );
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
      this.recordUsage(command.id);
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
