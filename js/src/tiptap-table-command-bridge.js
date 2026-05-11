import {
  TABLE_COMMANDS,
  canRunTableEditorCommand,
  runTableEditorCommand,
} from "./tiptap-table-commands.js";

function normalizeCommandId(value) {
  return String(value ?? "").trim().toLowerCase();
}

export class TiptapTableCommandBridge {
  #editor = null;
  #entry = null;
  #commands = TABLE_COMMANDS;

  constructor({ commands = TABLE_COMMANDS } = {}) {
    this.#commands = commands;
  }

  attach({ editor, entry } = {}) {
    this.#editor = editor ?? null;
    this.#entry = entry ?? null;
  }

  refresh(editor = this.#editor) {
    if (editor) {
      this.#editor = editor;
    }
    return this.state;
  }

  get state() {
    return {
      open: false,
      menuOpen: false,
      commands: [...this.#commands],
    };
  }

  find(commandId) {
    const id = normalizeCommandId(commandId);
    return this.#commands.find((command) => command.id === id) ?? null;
  }

  run(commandId, context = {}) {
    const command = this.find(commandId);
    const editor = context.editor ?? this.#editor;
    if (!command) {
      return {
        ok: false,
        commandId,
        error: "unknown_table_command",
      };
    }

    if (!canRunTableEditorCommand(editor, command.command, command.args)) {
      return {
        ok: false,
        commandId: command.id,
        error: "table_command_unavailable",
      };
    }

    const ok = runTableEditorCommand(editor, command.command, command.args);
    return {
      ok,
      commandId: command.id,
      error: ok ? null : "table_command_failed",
    };
  }

  handleKeyDown() {
    return false;
  }

  shouldKeepOpenOnEditorBlur() {
    return false;
  }

  contains() {
    return false;
  }

  close() {}

  destroy() {
    this.#editor = null;
    this.#entry = null;
  }
}

export function createTiptapTableCommandBridge(options) {
  return new TiptapTableCommandBridge(options);
}
