import { localizedText } from "./tiptap-i18n.js";
import { PAPYRO_TEXT_COLOR_OPTIONS } from "./tiptap-text-style.js";

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

function focusEditor(editor) {
  editor?.commands?.focus?.();
}

function isCommandActive(editor, activeName, activeAttrs) {
  if (typeof editor?.isActive !== "function") {
    return false;
  }
  return activeAttrs ? editor.isActive(activeName, activeAttrs) : editor.isActive(activeName);
}

function textStyleColor(editor) {
  return editor?.getAttributes?.("textStyle")?.color ?? null;
}

function formatCommandLanguage(context = {}) {
  return context.language ?? context.entry?.preferences?.language ?? "english";
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

function localizeFormatCommand(command, language) {
  const labels = FORMAT_COMMAND_LABELS[command.id];
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
}) {
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
    run: runCommand,
    active: activeCommand,
  });
}

export const PAPYRO_TIPTAP_FORMAT_COMMANDS = Object.freeze([
  createCommand({
    id: "bold",
    label: "B",
    title: "Bold",
    ariaLabel: "Toggle bold",
    commandName: "toggleBold",
    priority: 10,
  }),
  createCommand({
    id: "italic",
    label: "I",
    title: "Italic",
    ariaLabel: "Toggle italic",
    commandName: "toggleItalic",
    priority: 20,
  }),
  createCommand({
    id: "underline",
    label: "U",
    title: "Underline",
    ariaLabel: "Toggle underline",
    commandName: "toggleUnderline",
    priority: 25,
  }),
  createCommand({
    id: "strike",
    label: "S",
    title: "Strike",
    ariaLabel: "Toggle strikethrough",
    commandName: "toggleStrike",
    priority: 30,
  }),
  createCommand({
    id: "code",
    label: "{}",
    title: "Inline code",
    ariaLabel: "Toggle inline code",
    commandName: "toggleCode",
    priority: 40,
  }),
  createCommand({
    id: "link",
    label: "L",
    title: "Link",
    ariaLabel: "Edit link",
    activeName: "link",
    run: ({ openLinkEditor }) =>
      typeof openLinkEditor === "function" && openLinkEditor() === true,
    focusAfterRun: false,
    priority: 45,
  }),
  ...PAPYRO_TEXT_COLOR_OPTIONS.map((option, index) =>
    createCommand({
      id: `text-color-${option.id}`,
      label: "A",
      title: option.title,
      ariaLabel: option.description,
      commandName: option.color ? "setColor" : "unsetColor",
      commandArgs: option.color ? [option.color] : [],
      icon: `text-color ${option.id}`,
      active: ({ editor }) => textStyleColor(editor) === (option.color ?? null),
      priority: 46 + index,
    }),
  ),
  createCommand({
    id: "highlight",
    label: "H",
    title: "Highlight",
    ariaLabel: "Toggle highlight",
    commandName: "toggleHighlight",
    priority: 50,
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
  #commands;

  constructor(commands = PAPYRO_TIPTAP_FORMAT_COMMANDS) {
    this.#commands = Object.freeze(
      [...commands].sort((a, b) => a.priority - b.priority),
    );
  }

  get commands() {
    return this.#commands;
  }

  find(commandId) {
    const id = normalizeCommandId(commandId);
    return this.#commands.find((command) => command.id === id) ?? null;
  }

  states(context = {}) {
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
        },
        language,
      ),
    );
  }

  run(commandId, context = {}) {
    const command = this.find(commandId);
    if (!command) {
      return {
        ok: false,
        commandId,
        error: "unknown_format_command",
      };
    }

    const ok = command.run(context) !== false;
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

export function createTiptapFormatCommandController(commands) {
  return new TiptapFormatCommandController(commands);
}
