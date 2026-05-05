function normalizeCommandId(value) {
  return String(value ?? "").trim().toLowerCase();
}

function freezeCommand(command) {
  return Object.freeze({ ...command });
}

function editorCommand(editor, commandName, ...args) {
  const command = editor?.commands?.[commandName];
  if (typeof command !== "function") {
    return false;
  }
  return command(...args) !== false;
}

function focusEditor(editor, pos = null) {
  if (Number.isFinite(pos)) {
    editor?.commands?.focus?.(pos);
  } else {
    editor?.commands?.focus?.();
  }
}

function insertMarkdownAt(editor, markdown, pos) {
  if (typeof editor?.commands?.insertContentAt === "function" && Number.isFinite(pos)) {
    return editor.commands.insertContentAt(pos, markdown, { contentType: "markdown" }) !== false;
  }
  return editorCommand(editor, "insertContent", markdown, { contentType: "markdown" });
}

function insertMarkdown(editor, markdown) {
  return editorCommand(editor, "insertContent", markdown, { contentType: "markdown" });
}

function runEditorCommand(editor, commandName, args = [], fallbackMarkdown = null) {
  const ok = editorCommand(editor, commandName, ...args);
  if (!ok && typeof fallbackMarkdown === "string") {
    return insertMarkdown(editor, fallbackMarkdown);
  }
  return ok;
}

function targetEndPos(target) {
  const nodeSize = target?.node?.nodeSize ?? target?.block?.pmViewDesc?.node?.nodeSize ?? 0;
  return Number.isFinite(target?.pos) ? target.pos + Math.max(1, nodeSize) : null;
}

function deleteTarget(editor, target) {
  const from = target?.pos;
  const to = targetEndPos(target);
  if (Number.isFinite(from) && Number.isFinite(to) && to > from) {
    return editorCommand(editor, "deleteRange", { from, to });
  }
  return editorCommand(editor, "deleteNode", target?.kind);
}

function canRunEditorCommand(editor, commandName) {
  return typeof editor?.commands?.[commandName] === "function";
}

function createCommand({
  id,
  title,
  description,
  group,
  icon,
  shortcut = "",
  priority = 100,
  tone = "default",
  enabled = () => true,
  run,
}) {
  if (!id || typeof run !== "function") {
    throw new TypeError("Tiptap block actions require an id and run function");
  }

  return freezeCommand({
    id,
    title,
    description,
    group,
    icon,
    shortcut,
    priority,
    tone,
    enabled,
    run,
  });
}

export const PAPYRO_TIPTAP_BLOCK_ACTIONS = Object.freeze([
  createCommand({
    id: "insert-before",
    title: "Insert above",
    description: "Add a paragraph before this block",
    group: "Insert",
    icon: "plus-top",
    shortcut: "Enter",
    priority: 10,
    run: ({ editor, target }) => insertMarkdownAt(editor, "\n", target?.pos),
  }),
  createCommand({
    id: "insert-after",
    title: "Insert below",
    description: "Add a paragraph after this block",
    group: "Insert",
    icon: "plus-bottom",
    shortcut: "Shift Enter",
    priority: 11,
    run: ({ editor, target }) => insertMarkdownAt(editor, "\n", targetEndPos(target)),
  }),
  createCommand({
    id: "paragraph",
    title: "Paragraph",
    description: "Use plain body text",
    group: "Text",
    icon: "paragraph",
    priority: 20,
    run: ({ editor }) => editorCommand(editor, "setParagraph"),
  }),
  createCommand({
    id: "heading-1",
    title: "Heading 1",
    description: "Large section title",
    group: "Text",
    icon: "heading-1",
    priority: 21,
    run: ({ editor }) => runEditorCommand(editor, "toggleHeading", [{ level: 1 }], "# "),
  }),
  createCommand({
    id: "heading-2",
    title: "Heading 2",
    description: "Use a medium section title",
    group: "Text",
    icon: "heading-2",
    priority: 22,
    run: ({ editor }) => runEditorCommand(editor, "toggleHeading", [{ level: 2 }], "## "),
  }),
  createCommand({
    id: "heading-3",
    title: "Heading 3",
    description: "Small subsection title",
    group: "Text",
    icon: "heading-3",
    priority: 23,
    run: ({ editor }) => runEditorCommand(editor, "toggleHeading", [{ level: 3 }], "### "),
  }),
  createCommand({
    id: "bullet-list",
    title: "Bullet list",
    description: "Turn this block into bullets",
    group: "Lists",
    icon: "bullet-list",
    priority: 30,
    run: ({ editor }) => runEditorCommand(editor, "toggleBulletList", [], "- "),
  }),
  createCommand({
    id: "ordered-list",
    title: "Numbered list",
    description: "Turn this block into steps",
    group: "Lists",
    icon: "ordered-list",
    priority: 31,
    run: ({ editor }) => runEditorCommand(editor, "toggleOrderedList", [], "1. "),
  }),
  createCommand({
    id: "task-list",
    title: "Task list",
    description: "Create Markdown checkboxes",
    group: "Lists",
    icon: "task-list",
    priority: 32,
    run: ({ editor }) =>
      canRunEditorCommand(editor, "toggleTaskList")
        ? editorCommand(editor, "toggleTaskList")
        : insertMarkdown(editor, "- [ ] "),
  }),
  createCommand({
    id: "blockquote",
    title: "Quote",
    description: "Highlight a quoted passage",
    group: "Blocks",
    icon: "quote",
    priority: 40,
    run: ({ editor }) => runEditorCommand(editor, "toggleBlockquote", [], "> "),
  }),
  createCommand({
    id: "code-block",
    title: "Code block",
    description: "Use a fenced code block",
    group: "Blocks",
    icon: "code-block",
    priority: 41,
    run: ({ editor }) =>
      runEditorCommand(editor, "toggleCodeBlock", [], "```\ncode\n```"),
  }),
  createCommand({
    id: "divider",
    title: "Divider",
    description: "Insert a horizontal rule",
    group: "Blocks",
    icon: "divider",
    priority: 42,
    run: ({ editor }) => runEditorCommand(editor, "setHorizontalRule", [], "\n---\n"),
  }),
  createCommand({
    id: "table",
    title: "Table",
    description: "Insert a 3 by 2 table",
    group: "Advanced",
    icon: "table",
    priority: 50,
    run: ({ editor }) =>
      runEditorCommand(
        editor,
        "insertTable",
        [{ rows: 3, cols: 2, withHeaderRow: true }],
        "\n| Column | Notes |\n| --- | --- |\n|  |  |\n",
      ),
  }),
  createCommand({
    id: "math-block",
    title: "Math block",
    description: "Insert a display formula",
    group: "Advanced",
    icon: "math",
    priority: 51,
    run: ({ editor }) =>
      runEditorCommand(
        editor,
        "setMathBlock",
        [{ source: "x^2 + y^2 = z^2" }],
        "\n$$\n\n$$\n",
      ),
  }),
  createCommand({
    id: "mermaid",
    title: "Mermaid diagram",
    description: "Insert a flowchart block",
    group: "Advanced",
    icon: "mermaid",
    priority: 52,
    run: ({ editor }) =>
      runEditorCommand(
        editor,
        "setMermaidBlock",
        [{ source: "flowchart TD\n  A --> B" }],
        "\n```mermaid\nflowchart TD\n  A --> B\n```\n",
      ),
  }),
  createCommand({
    id: "image",
    title: "Image",
    description: "Insert Markdown image syntax",
    group: "Advanced",
    icon: "image",
    priority: 53,
    run: ({ editor }) =>
      runEditorCommand(
        editor,
        "setImage",
        [{ src: "assets/image.png", alt: "alt text", title: "" }],
        "![alt text](assets/image.png)",
      ),
  }),
  createCommand({
    id: "delete",
    title: "Delete block",
    description: "Remove this block",
    group: "Danger",
    icon: "delete",
    shortcut: "Del",
    priority: 90,
    tone: "danger",
    run: ({ editor, target }) => deleteTarget(editor, target),
  }),
]);

export class TiptapBlockActionController {
  #commands;

  constructor(commands = PAPYRO_TIPTAP_BLOCK_ACTIONS) {
    this.#commands = Object.freeze([...commands]);
  }

  get commands() {
    return this.#commands;
  }

  find(commandId) {
    const id = normalizeCommandId(commandId);
    return this.#commands.find((command) => command.id === id) ?? null;
  }

  list(context = {}) {
    return this.#commands
      .filter((command) => command.enabled(context) !== false)
      .sort((left, right) => left.priority - right.priority)
      .map((command) => ({
        id: command.id,
        title: command.title,
        description: command.description,
        group: command.group,
        icon: command.icon,
        shortcut: command.shortcut,
        tone: command.tone,
      }));
  }

  run(commandId, context = {}) {
    const command = this.find(commandId);
    if (!command) {
      return {
        ok: false,
        commandId,
        error: "unknown_block_action",
      };
    }

    focusEditor(context.editor, context.target?.pos);
    const ok = command.run(context) !== false;
    if (ok) {
      focusEditor(context.editor);
    }

    return {
      ok,
      commandId: command.id,
      error: ok ? null : "block_action_failed",
    };
  }
}

export function createTiptapBlockActionController(commands) {
  return new TiptapBlockActionController(commands);
}
