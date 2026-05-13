import { createMarkdownCallout } from "./tiptap-markdown-snippets.js";

type CommandName =
  | "insertContent"
  | "setParagraph"
  | "toggleHeading"
  | "toggleBulletList"
  | "toggleOrderedList"
  | "toggleTaskList"
  | "toggleBlockquote"
  | "setCalloutBlock"
  | "toggleCodeBlock";

type EditorCommandMap = Partial<Record<CommandName, (...args: unknown[]) => unknown>>;

export type PapyroTurnIntoEditor = {
  commands?: EditorCommandMap;
  isActive?: (name: string, attrs?: Record<string, unknown>) => boolean;
};

export type PapyroTurnIntoCommandContext = {
  editor?: PapyroTurnIntoEditor | null;
};

export type PapyroTurnIntoCommand = Readonly<{
  id: string;
  title: string;
  description: string;
  group: string;
  icon: string;
  priority: number;
  activeName?: string;
  activeAttrs?: Readonly<Record<string, unknown>>;
  active: (context: PapyroTurnIntoCommandContext) => boolean;
  run: (context: PapyroTurnIntoCommandContext) => boolean;
}>;

type TurnIntoCommandInput = Omit<PapyroTurnIntoCommand, "active"> & {
  active?: (context: PapyroTurnIntoCommandContext) => boolean;
};

function freezeCommand<T extends object>(command: T): Readonly<T> {
  return Object.freeze({ ...command });
}

function editorCommand(
  editor: PapyroTurnIntoEditor | null | undefined,
  commandName: CommandName,
  ...args: unknown[]
): boolean {
  const command = editor?.commands?.[commandName];
  if (typeof command !== "function") {
    return false;
  }
  return command(...args) !== false;
}

function insertMarkdown(
  editor: PapyroTurnIntoEditor | null | undefined,
  markdown: string,
): boolean {
  return editorCommand(editor, "insertContent", markdown, { contentType: "markdown" });
}

function runEditorCommand(
  editor: PapyroTurnIntoEditor | null | undefined,
  commandName: CommandName,
  args: unknown[] = [],
  fallbackMarkdown: string | null = null,
): boolean {
  const ok = editorCommand(editor, commandName, ...args);
  if (!ok && typeof fallbackMarkdown === "string") {
    return insertMarkdown(editor, fallbackMarkdown);
  }
  return ok;
}

function canRunEditorCommand(
  editor: PapyroTurnIntoEditor | null | undefined,
  commandName: CommandName,
): boolean {
  return typeof editor?.commands?.[commandName] === "function";
}

function isCommandActive(
  editor: PapyroTurnIntoEditor | null | undefined,
  activeName: string | undefined,
  activeAttrs: Readonly<Record<string, unknown>> | undefined,
): boolean {
  if (typeof editor?.isActive !== "function") {
    return false;
  }
  if (!activeName) {
    return false;
  }
  return activeAttrs ? editor.isActive(activeName, activeAttrs) : editor.isActive(activeName);
}

function createTurnIntoCommand({
  id,
  title,
  description,
  group,
  icon,
  priority,
  activeName,
  activeAttrs,
  active,
  run,
}: TurnIntoCommandInput): PapyroTurnIntoCommand {
  if (!id || typeof run !== "function") {
    throw new TypeError("Tiptap turn-into commands require an id and run function");
  }

  return freezeCommand({
    id,
    title,
    description,
    group,
    icon,
    priority,
    activeName,
    activeAttrs,
    active:
      typeof active === "function"
        ? active
        : ({ editor }) => isCommandActive(editor, activeName ?? id, activeAttrs),
    run,
  });
}

export const PAPYRO_TIPTAP_TURN_INTO_COMMANDS: readonly PapyroTurnIntoCommand[] = Object.freeze([
  createTurnIntoCommand({
    id: "paragraph",
    title: "Paragraph",
    description: "Use plain body text",
    group: "Text",
    icon: "paragraph",
    priority: 20,
    activeName: "paragraph",
    run: ({ editor }) => editorCommand(editor, "setParagraph"),
  }),
  createTurnIntoCommand({
    id: "heading-1",
    title: "Heading 1",
    description: "Large section title",
    group: "Text",
    icon: "heading-1",
    priority: 21,
    activeName: "heading",
    activeAttrs: { level: 1 },
    run: ({ editor }) => runEditorCommand(editor, "toggleHeading", [{ level: 1 }], "# "),
  }),
  createTurnIntoCommand({
    id: "heading-2",
    title: "Heading 2",
    description: "Use a medium section title",
    group: "Text",
    icon: "heading-2",
    priority: 22,
    activeName: "heading",
    activeAttrs: { level: 2 },
    run: ({ editor }) => runEditorCommand(editor, "toggleHeading", [{ level: 2 }], "## "),
  }),
  createTurnIntoCommand({
    id: "heading-3",
    title: "Heading 3",
    description: "Small subsection title",
    group: "Text",
    icon: "heading-3",
    priority: 23,
    activeName: "heading",
    activeAttrs: { level: 3 },
    run: ({ editor }) => runEditorCommand(editor, "toggleHeading", [{ level: 3 }], "### "),
  }),
  createTurnIntoCommand({
    id: "bullet-list",
    title: "Bullet list",
    description: "Turn this block into bullets",
    group: "Lists",
    icon: "bullet-list",
    priority: 30,
    activeName: "bulletList",
    run: ({ editor }) => runEditorCommand(editor, "toggleBulletList", [], "- "),
  }),
  createTurnIntoCommand({
    id: "ordered-list",
    title: "Numbered list",
    description: "Turn this block into steps",
    group: "Lists",
    icon: "ordered-list",
    priority: 31,
    activeName: "orderedList",
    run: ({ editor }) => runEditorCommand(editor, "toggleOrderedList", [], "1. "),
  }),
  createTurnIntoCommand({
    id: "task-list",
    title: "Task list",
    description: "Create Markdown checkboxes",
    group: "Lists",
    icon: "task-list",
    priority: 32,
    activeName: "taskList",
    run: ({ editor }) =>
      canRunEditorCommand(editor, "toggleTaskList")
        ? editorCommand(editor, "toggleTaskList")
        : insertMarkdown(editor, "- [ ] "),
  }),
  createTurnIntoCommand({
    id: "blockquote",
    title: "Quote",
    description: "Highlight a quoted passage",
    group: "Blocks",
    icon: "quote",
    priority: 40,
    activeName: "blockquote",
    run: ({ editor }) => runEditorCommand(editor, "toggleBlockquote", [], "> "),
  }),
  createTurnIntoCommand({
    id: "callout",
    title: "Callout",
    description: "Insert a note callout",
    group: "Blocks",
    icon: "callout",
    priority: 41,
    activeName: "calloutBlock",
    run: ({ editor }) =>
      runEditorCommand(
        editor,
        "setCalloutBlock",
        [{ kind: "NOTE", text: "Callout text" }],
        createMarkdownCallout(),
      ),
  }),
  createTurnIntoCommand({
    id: "code-block",
    title: "Code block",
    description: "Use a fenced code block",
    group: "Blocks",
    icon: "code-block",
    priority: 42,
    activeName: "codeBlock",
    run: ({ editor }) =>
      runEditorCommand(editor, "toggleCodeBlock", [], "```\ncode\n```"),
  }),
]);
