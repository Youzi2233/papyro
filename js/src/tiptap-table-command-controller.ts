import {
  TABLE_COMMANDS,
  canRunTableEditorCommand,
  runTableEditorCommand,
} from "./tiptap-table-commands.js";

type TiptapEditorCommand = (...args: readonly unknown[]) => unknown;

export interface TiptapTableCommandEditor {
  commands?: Record<string, TiptapEditorCommand | undefined> & {
    focus?: () => unknown;
  };
  can?: () => Record<string, TiptapEditorCommand | undefined> | null;
}

export interface TiptapTableCommand {
  id: string;
  command: string;
  args?: readonly unknown[];
  disabled?: boolean;
  [key: string]: unknown;
}

export type TiptapTableCommandList = readonly TiptapTableCommand[];

export interface TiptapTableCommandControllerOptions {
  commands?: TiptapTableCommandList;
}

export interface TiptapTableCommandAttachContext {
  editor?: TiptapTableCommandEditor | null;
}

export interface TiptapTableCommandRunContext {
  editor?: TiptapTableCommandEditor | null;
}

export interface TiptapTableCommandControllerState {
  open: false;
  menuOpen: false;
  commands: TiptapTableCommand[];
}

export type TiptapTableCommandRunResult =
  | {
      ok: true;
      commandId: string;
      error: null;
    }
  | {
      ok: false;
      commandId: unknown;
      error:
        | "unknown_table_command"
        | "table_command_unavailable"
        | "table_command_failed";
    };

function normalizeCommandId(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export class TiptapTableCommandController {
  #editor: TiptapTableCommandEditor | null = null;
  #commands: TiptapTableCommandList;

  constructor({
    commands = TABLE_COMMANDS as TiptapTableCommandList,
  }: TiptapTableCommandControllerOptions = {}) {
    this.#commands = commands;
  }

  attach({ editor = null }: TiptapTableCommandAttachContext = {}): void {
    this.#editor = editor;
  }

  refresh(
    editor: TiptapTableCommandEditor | null = this.#editor,
  ): TiptapTableCommandControllerState {
    if (editor) {
      this.#editor = editor;
    }
    return this.state;
  }

  get state(): TiptapTableCommandControllerState {
    return {
      open: false,
      menuOpen: false,
      commands: [...this.#commands],
    };
  }

  find(commandId: unknown): TiptapTableCommand | null {
    const id = normalizeCommandId(commandId);
    return this.#commands.find((command) => command.id === id) ?? null;
  }

  run(
    commandId: unknown,
    context: TiptapTableCommandRunContext = {},
  ): TiptapTableCommandRunResult {
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

    const ok = runTableEditorCommand(editor, command.command, command.args) === true;
    return ok
      ? {
          ok,
          commandId: command.id,
          error: null,
        }
      : {
          ok,
          commandId: command.id,
          error: "table_command_failed",
        };
  }

  destroy(): void {
    this.#editor = null;
  }
}

export function createTiptapTableCommandController(
  options?: TiptapTableCommandControllerOptions,
): TiptapTableCommandController {
  return new TiptapTableCommandController(options);
}
