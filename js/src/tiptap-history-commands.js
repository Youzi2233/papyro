function normalizeCommandId(value) {
  return String(value ?? "").trim().toLowerCase();
}

function editorCommand(editor, commandName) {
  const command = editor?.commands?.[commandName];
  if (typeof command !== "function") return false;
  return command() !== false;
}

function focusEditor(editor) {
  editor?.commands?.focus?.();
}

export const PAPYRO_TIPTAP_HISTORY_COMMANDS = Object.freeze([
  Object.freeze({
    id: "undo",
    title: "Undo",
    commandName: "undo",
  }),
  Object.freeze({
    id: "redo",
    title: "Redo",
    commandName: "redo",
  }),
]);

export class TiptapHistoryCommandController {
  #commands;

  constructor(commands = PAPYRO_TIPTAP_HISTORY_COMMANDS) {
    this.#commands = Object.freeze([...commands]);
  }

  get commands() {
    return this.#commands;
  }

  find(commandId) {
    const id = normalizeCommandId(commandId);
    return this.#commands.find((command) => command.id === id) ?? null;
  }

  run(commandId, context = {}) {
    const command = this.find(commandId);
    if (!command) {
      return {
        ok: false,
        commandId,
        error: "unknown_history_command",
      };
    }

    const ok = editorCommand(context.editor, command.commandName);
    if (ok) focusEditor(context.editor);

    return {
      ok,
      commandId: command.id,
      error: ok ? null : "history_command_failed",
    };
  }
}

export function createTiptapHistoryCommandController(commands) {
  return new TiptapHistoryCommandController(commands);
}
