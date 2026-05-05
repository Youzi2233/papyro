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

function createCommand({
  id,
  label,
  title,
  ariaLabel,
  commandName,
  activeName,
  activeAttrs,
  icon,
  priority = 100,
}) {
  if (!id || !commandName) {
    throw new TypeError("Tiptap format commands require an id and commandName");
  }

  return freezeCommand({
    id,
    label,
    title,
    ariaLabel: ariaLabel ?? title,
    commandName,
    activeName: activeName ?? id,
    activeAttrs,
    icon: icon ?? id,
    priority,
    run({ editor }) {
      return editorCommand(editor, commandName);
    },
    active({ editor }) {
      return isCommandActive(editor, activeName ?? id, activeAttrs);
    },
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
    return this.#commands.map((command) => ({
      id: command.id,
      label: command.label,
      title: command.title,
      ariaLabel: command.ariaLabel,
      icon: command.icon,
      priority: command.priority,
      active: command.active(context) === true,
    }));
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
    if (ok) {
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
