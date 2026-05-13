import { localizedText } from "./tiptap-i18n.ts";
import { createPapyroTiptapFormatSnapshot } from "./tiptap-format-snapshot.ts";
import {
  PAPYRO_HIGHLIGHT_OPTIONS,
  PAPYRO_TEXT_COLOR_OPTIONS,
} from "./tiptap-text-style.ts";
import {
  PAPYRO_TIPTAP_TURN_INTO_COMMANDS,
  type PapyroTurnIntoCommand,
} from "./tiptap-turn-into-commands.ts";

type FormatCommandName =
  | "toggleBold"
  | "toggleCode"
  | "toggleItalic"
  | "toggleStrike"
  | "toggleUnderline"
  | "toggleHighlight"
  | "unsetHighlight"
  | "setColor"
  | "unsetColor"
  | "unsetAllMarks";

type EditorCommandMap = Partial<Record<FormatCommandName | "focus", (...args: unknown[]) => unknown>>;

type FormatEditor = {
  commands?: EditorCommandMap;
  isActive?: (name: string, attrs?: Record<string, unknown>) => boolean;
  getAttributes?: (name: string) => Record<string, unknown>;
};

type FormatOption = {
  id: string;
  title: string;
  description: string;
  color?: string | null;
};

type FormatSnapshot = ReturnType<typeof createPapyroTiptapFormatSnapshot>;

export type TiptapFormatCommandContext = {
  editor?: FormatEditor | null;
  entry?: {
    preferences?: {
      language?: string | null;
    } | null;
  } | null;
  language?: string | null;
  formatSnapshot?: FormatSnapshot | null;
  openLinkEditor?: () => boolean;
  openTurnIntoMenu?: () => boolean;
  childCommandId?: string | null;
};

type FormatCommandState = {
  id: string;
  label: string;
  title: string;
  ariaLabel: string;
  icon: string;
  priority: number;
  focusAfterRun: boolean;
  active: boolean;
  children: FormatCommandChildState[];
};

type FormatCommandChildState = {
  id: string;
  title: string;
  ariaLabel: string;
  description?: string;
  icon: string;
  priority: number;
  active: boolean;
};

type FormatCommand = Readonly<{
  id: string;
  label: string;
  title: string;
  ariaLabel: string;
  commandName?: FormatCommandName;
  commandArgs: readonly unknown[];
  activeName: string;
  activeAttrs?: Record<string, unknown>;
  icon: string;
  priority: number;
  focusAfterRun: boolean;
  children: readonly PapyroTurnIntoCommand[];
  run: (context: TiptapFormatCommandContext) => boolean;
  active: (context: TiptapFormatCommandContext) => boolean;
}>;

type FormatCommandInput = {
  id: string;
  label: string;
  title: string;
  ariaLabel?: string;
  commandName?: FormatCommandName;
  commandArgs?: readonly unknown[];
  activeName?: string;
  activeAttrs?: Record<string, unknown>;
  run?: (context: TiptapFormatCommandContext) => boolean;
  active?: (context: TiptapFormatCommandContext) => boolean;
  focusAfterRun?: boolean;
  icon?: string;
  priority?: number;
  children?: readonly PapyroTurnIntoCommand[];
};

type FormatRunResult = {
  ok: boolean;
  commandId: string;
  parentCommandId?: string;
  error: "unknown_format_command" | "format_command_failed" | null;
};

function normalizeCommandId(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function freezeCommand<T extends object>(command: T): Readonly<T> {
  return Object.freeze({ ...command });
}

function editorCommand(
  editor: FormatEditor | null | undefined,
  commandName: FormatCommandName | undefined,
  ...args: unknown[]
): boolean {
  const command = editor?.commands?.[commandName];
  if (typeof command !== "function") {
    return false;
  }
  return command(...args) !== false;
}

function focusEditor(editor: FormatEditor | null | undefined): void {
  editor?.commands?.focus?.();
}

function isCommandActive(
  editor: FormatEditor | null | undefined,
  activeName: string | undefined,
  activeAttrs?: Record<string, unknown>,
): boolean {
  if (typeof editor?.isActive !== "function") {
    return false;
  }
  if (!activeName) {
    return false;
  }
  return activeAttrs ? editor.isActive(activeName, activeAttrs) : editor.isActive(activeName);
}

function formatSnapshot(context: TiptapFormatCommandContext = {}): FormatSnapshot {
  return context.formatSnapshot ?? createPapyroTiptapFormatSnapshot(context.editor);
}

function isSnapshotMarkActive(
  context: TiptapFormatCommandContext,
  markId: keyof FormatSnapshot["marks"],
): boolean {
  return formatSnapshot(context).marks?.[markId] === true;
}

function isSnapshotTextColorActive(
  context: TiptapFormatCommandContext,
  option: FormatOption,
): boolean {
  return formatSnapshot(context).textColors?.[option.id] === true;
}

function isSnapshotHighlightActive(
  context: TiptapFormatCommandContext,
  option: FormatOption,
): boolean {
  return formatSnapshot(context).highlights?.[option.id] === true;
}

function formatCommandLanguage(context: TiptapFormatCommandContext = {}): string {
  return context.language ?? context.entry?.preferences?.language ?? "english";
}

function localizeTurnIntoLabel<T extends { id: string; title: string; ariaLabel?: string }>(
  language: string,
  command: T,
): T & { title: string; ariaLabel: string } {
  const labels = {
    "turn-into": [
      "Turn into",
      "\u8f6c\u6362\u4e3a",
      "Change block type",
      "\u66f4\u6539\u5757\u7c7b\u578b",
    ],
    paragraph: ["Paragraph", "\u6bb5\u843d", "Use plain body text", "\u4f7f\u7528\u666e\u901a\u6b63\u6587"],
    "heading-1": [
      "Heading 1",
      "\u4e00\u7ea7\u6807\u9898",
      "Large section title",
      "\u5927\u578b\u7ae0\u8282\u6807\u9898",
    ],
    "heading-2": [
      "Heading 2",
      "\u4e8c\u7ea7\u6807\u9898",
      "Use a medium section title",
      "\u4e2d\u578b\u7ae0\u8282\u6807\u9898",
    ],
    "heading-3": [
      "Heading 3",
      "\u4e09\u7ea7\u6807\u9898",
      "Small subsection title",
      "\u5c0f\u578b\u5c0f\u8282\u6807\u9898",
    ],
    "bullet-list": [
      "Bullet list",
      "\u65e0\u5e8f\u5217\u8868",
      "Turn this block into bullets",
      "\u8f6c\u6362\u4e3a\u65e0\u5e8f\u5217\u8868",
    ],
    "ordered-list": [
      "Numbered list",
      "\u6709\u5e8f\u5217\u8868",
      "Turn this block into steps",
      "\u8f6c\u6362\u4e3a\u6709\u5e8f\u5217\u8868",
    ],
    "task-list": [
      "Task list",
      "\u4efb\u52a1\u5217\u8868",
      "Create Markdown checkboxes",
      "\u521b\u5efa Markdown \u590d\u9009\u6846",
    ],
    blockquote: ["Quote", "\u5f15\u7528", "Highlight a quoted passage", "\u7a81\u51fa\u5f15\u7528\u5185\u5bb9"],
    callout: ["Callout", "\u6807\u6ce8", "Insert a note callout", "\u63d2\u5165\u63d0\u793a\u6807\u6ce8"],
    "code-block": [
      "Code block",
      "\u4ee3\u7801\u5757",
      "Use a fenced code block",
      "\u4f7f\u7528\u56f4\u680f\u4ee3\u7801\u5757",
    ],
  };
  const label = labels[command.id];
  if (!label) {
    return {
      ...command,
      ariaLabel: command.ariaLabel ?? command.title,
    };
  }

  return {
    ...command,
    title: localizedText(language, label[0], label[1]),
    ariaLabel: localizedText(language, label[2], label[3]),
  };
}

const FORMAT_COMMAND_LABELS = Object.freeze({
  bold: ["Bold", "加粗", "Toggle bold", "切换加粗"],
  italic: ["Italic", "斜体", "Toggle italic", "切换斜体"],
  underline: ["Underline", "下划线", "Toggle underline", "切换下划线"],
  strike: ["Strike", "删除线", "Toggle strikethrough", "切换删除线"],
  code: ["Inline code", "行内代码", "Toggle inline code", "切换行内代码"],
  link: ["Link", "链接", "Edit link", "编辑链接"],
  "text-color-ink": [
    "Default text",
    "默认文字",
    "Use the current editor text color",
    "使用当前编辑器文字颜色",
  ],
  "text-color-muted": [
    "Muted text",
    "弱化文字",
    "De-emphasize supporting text",
    "弱化辅助文字",
  ],
  "text-color-accent": [
    "Accent text",
    "强调文字",
    "Apply accent text color",
    "应用强调文字颜色",
  ],
  "text-color-danger": [
    "Danger text",
    "危险文字",
    "Apply danger text color",
    "应用危险文字颜色",
  ],
  highlight: ["Highlight", "高亮", "Toggle highlight", "切换高亮"],
  "clear-formatting": [
    "Clear formatting",
    "清除格式",
    "Clear selected formatting",
    "清除所选文本格式",
  ],
});

const HIGHLIGHT_FORMAT_COMMAND_LABELS = Object.freeze({
  "highlight-clear": [
    "Clear highlight",
    "\u6e05\u9664\u9ad8\u4eae",
    "Remove highlight",
    "\u79fb\u9664\u9ad8\u4eae",
  ],
  "highlight-yellow": [
    "Yellow highlight",
    "\u9ec4\u8272\u9ad8\u4eae",
    "Toggle yellow highlight",
    "\u5207\u6362\u9ec4\u8272\u9ad8\u4eae",
  ],
  "highlight-blue": [
    "Blue highlight",
    "\u84dd\u8272\u9ad8\u4eae",
    "Toggle blue highlight",
    "\u5207\u6362\u84dd\u8272\u9ad8\u4eae",
  ],
  "highlight-green": [
    "Green highlight",
    "\u7eff\u8272\u9ad8\u4eae",
    "Toggle green highlight",
    "\u5207\u6362\u7eff\u8272\u9ad8\u4eae",
  ],
});

function localizeFormatCommand(
  command: FormatCommandState,
  language: string,
): FormatCommandState {
  if (command.id === "turn-into") {
    return localizeTurnIntoLabel(language, command);
  }

  const labels =
    FORMAT_COMMAND_LABELS[command.id] ?? HIGHLIGHT_FORMAT_COMMAND_LABELS[command.id];
  if (!labels) return command;

  return {
    ...command,
    title: localizedText(language, labels[0], labels[1]),
    ariaLabel: localizedText(language, labels[2], labels[3]),
  };
}

function createCommand({
  id,
  label,
  title,
  ariaLabel,
  commandName,
  commandArgs = [],
  activeName,
  activeAttrs,
  run,
  active,
  focusAfterRun = true,
  icon,
  priority = 100,
  children = [],
}: FormatCommandInput): FormatCommand {
  if (!id || (!commandName && typeof run !== "function")) {
    throw new TypeError("Tiptap format commands require an id and runnable command");
  }

  const runCommand =
    typeof run === "function"
      ? run
      : ({ editor }) => editorCommand(editor, commandName, ...commandArgs);
  const activeCommand =
    typeof active === "function"
      ? active
      : ({ editor }) => isCommandActive(editor, activeName ?? id, activeAttrs);

  return freezeCommand({
    id,
    label,
    title,
    ariaLabel: ariaLabel ?? title,
    commandName,
    commandArgs: Object.freeze([...commandArgs]),
    activeName: activeName ?? id,
    activeAttrs,
    icon: icon ?? id,
    priority,
    focusAfterRun,
    children: Object.freeze([...children]),
    run: runCommand,
    active: activeCommand,
  });
}

const textColorOptions = PAPYRO_TEXT_COLOR_OPTIONS as readonly FormatOption[];
const highlightOptions = PAPYRO_HIGHLIGHT_OPTIONS as readonly FormatOption[];

export const PAPYRO_TIPTAP_FORMAT_COMMANDS: readonly FormatCommand[] = Object.freeze([
  createCommand({
    id: "bold",
    label: "B",
    title: "Bold",
    ariaLabel: "Toggle bold",
    commandName: "toggleBold",
    active: (context) => isSnapshotMarkActive(context, "bold"),
    priority: 10,
  }),
  createCommand({
    id: "italic",
    label: "I",
    title: "Italic",
    ariaLabel: "Toggle italic",
    commandName: "toggleItalic",
    active: (context) => isSnapshotMarkActive(context, "italic"),
    priority: 20,
  }),
  createCommand({
    id: "underline",
    label: "U",
    title: "Underline",
    ariaLabel: "Toggle underline",
    commandName: "toggleUnderline",
    active: (context) => isSnapshotMarkActive(context, "underline"),
    priority: 25,
  }),
  createCommand({
    id: "strike",
    label: "S",
    title: "Strike",
    ariaLabel: "Toggle strikethrough",
    commandName: "toggleStrike",
    active: (context) => isSnapshotMarkActive(context, "strike"),
    priority: 30,
  }),
  createCommand({
    id: "code",
    label: "{}",
    title: "Inline code",
    ariaLabel: "Toggle inline code",
    commandName: "toggleCode",
    active: (context) => isSnapshotMarkActive(context, "code"),
    priority: 40,
  }),
  createCommand({
    id: "link",
    label: "L",
    title: "Link",
    ariaLabel: "Edit link",
    activeName: "link",
    active: (context) => isSnapshotMarkActive(context, "link"),
    run: ({ openLinkEditor }) =>
      typeof openLinkEditor === "function" && openLinkEditor() === true,
    focusAfterRun: false,
    priority: 45,
  }),
  ...textColorOptions.map((option, index) =>
    createCommand({
      id: `text-color-${option.id}`,
      label: "A",
      title: option.title,
      ariaLabel: option.description,
      commandName: option.color ? "setColor" : "unsetColor",
      commandArgs: option.color ? [option.color] : [],
      icon: `text-color ${option.id}`,
      active: (context) => isSnapshotTextColorActive(context, option),
      priority: 46 + index,
    }),
  ),
  ...highlightOptions.map((option, index) =>
    createCommand({
      id: `highlight-${option.id}`,
      label: "H",
      title: option.title,
      ariaLabel: option.description,
      commandName: option.color ? "toggleHighlight" : "unsetHighlight",
      commandArgs: option.color ? [{ color: option.color }] : [],
      icon: `highlight ${option.id}`,
      active:
        option.color ? (context) => isSnapshotHighlightActive(context, option) : () => false,
      priority: 50 + index,
    }),
  ),
  createCommand({
    id: "turn-into",
    label: "T",
    title: "Turn into",
    ariaLabel: "Change block type",
    icon: "turn-into",
    run: ({ openTurnIntoMenu }) =>
      typeof openTurnIntoMenu === "function" && openTurnIntoMenu() === true,
    focusAfterRun: false,
    children: PAPYRO_TIPTAP_TURN_INTO_COMMANDS,
    active: () => false,
    priority: 88,
  }),
  createCommand({
    id: "clear-formatting",
    label: "Tx",
    title: "Clear formatting",
    ariaLabel: "Clear selected formatting",
    commandName: "unsetAllMarks",
    active: () => false,
    priority: 90,
  }),
]);

export class TiptapFormatCommandController {
  #commands: readonly FormatCommand[];

  constructor(commands: readonly FormatCommand[] = PAPYRO_TIPTAP_FORMAT_COMMANDS) {
    this.#commands = Object.freeze(
      [...commands].sort((a, b) => a.priority - b.priority),
    );
  }

  get commands(): readonly FormatCommand[] {
    return this.#commands;
  }

  find(commandId: unknown): FormatCommand | null {
    const id = normalizeCommandId(commandId);
    return this.#commands.find((command) => command.id === id) ?? null;
  }

  findChild(
    commandId: unknown,
  ): { parent: FormatCommand; child: PapyroTurnIntoCommand } | null {
    const id = normalizeCommandId(commandId);
    for (const command of this.#commands) {
      const child = command.children.find((item) => item.id === id);
      if (child) {
        return { parent: command, child };
      }
    }
    return null;
  }

  states(context: TiptapFormatCommandContext = {}): FormatCommandState[] {
    const language = formatCommandLanguage(context);
    return this.#commands.map((command) =>
      localizeFormatCommand(
        {
          id: command.id,
          label: command.label,
          title: command.title,
          ariaLabel: command.ariaLabel,
          icon: command.icon,
          priority: command.priority,
          focusAfterRun: command.focusAfterRun,
          active: command.active(context) === true,
          children: command.children.map((child) =>
            localizeTurnIntoLabel(language, {
              id: child.id,
              title: child.title,
              ariaLabel: child.description ?? child.title,
              description: child.description,
              icon: child.icon,
              priority: child.priority,
              active: child.active?.(context) === true,
            }),
          ),
        },
        language,
      ),
    );
  }

  run(commandId: string, context: TiptapFormatCommandContext = {}): FormatRunResult {
    const command = this.find(commandId);
    const childMatch = command ? null : this.findChild(commandId);
    if (childMatch) {
      const ok = childMatch.child.run(context) !== false;
      if (ok) {
        focusEditor(context.editor);
      }

      return {
        ok,
        commandId: childMatch.child.id,
        parentCommandId: childMatch.parent.id,
        error: ok ? null : "format_command_failed",
      };
    }

    if (!command) {
      return {
        ok: false,
        commandId,
        error: "unknown_format_command",
      };
    }

    const child = command.children.find((item) => item.id === context.childCommandId);
    const ok = child ? child.run(context) !== false : command.run(context) !== false;
    if (ok && command.focusAfterRun !== false) {
      focusEditor(context.editor);
    }

    return {
      ok,
      commandId: command.id,
      error: ok ? null : "format_command_failed",
    };
  }
}

export function createTiptapFormatCommandController(
  commands?: readonly FormatCommand[],
): TiptapFormatCommandController {
  return new TiptapFormatCommandController(commands);
}
