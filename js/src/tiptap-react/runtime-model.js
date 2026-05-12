import {
  createPapyroTiptapFormatSnapshot,
  samePapyroTiptapFormatSnapshot,
} from "../tiptap-format-snapshot.js";

const DEFAULT_LANGUAGE = "english";
const DEFAULT_VIEW_MODE = "hybrid";

export {
  createPapyroTiptapFormatSnapshot,
  samePapyroTiptapFormatSnapshot,
};

export function normalizePapyroTiptapLanguage(entryOrLanguage) {
  const language =
    typeof entryOrLanguage === "string"
      ? entryOrLanguage
      : entryOrLanguage?.preferences?.language;
  const normalized = String(language ?? DEFAULT_LANGUAGE).toLowerCase();
  if (normalized === "chinese" || normalized === "zh-cn" || normalized === "zh_cn") {
    return "chinese";
  }
  return DEFAULT_LANGUAGE;
}

export function normalizePapyroTiptapViewMode(entryOrMode) {
  const mode =
    typeof entryOrMode === "string" ? entryOrMode : entryOrMode?.viewMode;
  if (mode === "source" || mode === "preview") {
    return mode;
  }
  return DEFAULT_VIEW_MODE;
}

function selectionKind(selection) {
  if (!selection) return "none";
  if (selection.$anchorCell || selection.$headCell) return "table";
  if (selection.node) return "node";
  if (selection.empty) return "cursor";
  return "range";
}

export function createPapyroTiptapSelectionSnapshot(editor = null) {
  const selection = editor?.state?.selection ?? null;
  if (!selection) {
    return Object.freeze({
      kind: "none",
      empty: true,
      from: null,
      to: null,
      anchor: null,
      head: null,
      table: null,
    });
  }

  const from = Number.isFinite(selection.from) ? selection.from : null;
  const to = Number.isFinite(selection.to) ? selection.to : from;
  const anchor = Number.isFinite(selection.anchor) ? selection.anchor : from;
  const head = Number.isFinite(selection.head) ? selection.head : to;
  const anchorCell = selection.$anchorCell?.pos;
  const headCell = selection.$headCell?.pos;
  const table =
    Number.isFinite(anchorCell) || Number.isFinite(headCell)
      ? Object.freeze({
          anchorCell: Number.isFinite(anchorCell) ? anchorCell : null,
          headCell: Number.isFinite(headCell) ? headCell : null,
        })
      : null;

  return Object.freeze({
    kind: selectionKind(selection),
    empty: selection.empty === true,
    from,
    to,
    anchor,
    head,
    table,
  });
}

export function samePapyroTiptapSelectionSnapshot(left, right) {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.kind === right.kind
    && left.empty === right.empty
    && left.from === right.from
    && left.to === right.to
    && left.anchor === right.anchor
    && left.head === right.head
    && left.table?.anchorCell === right.table?.anchorCell
    && left.table?.headCell === right.table?.headCell
  );
}

function commandContext({ editor, entry, tabId, message, extra }) {
  return {
    editor,
    entry,
    tabId,
    message,
    ...(extra ?? {}),
  };
}

function runControllerCommand({
  controller,
  commandId,
  context,
  missingError,
}) {
  if (!controller || typeof controller.run !== "function") {
    return {
      ok: false,
      commandId,
      error: missingError,
    };
  }
  return controller.run(commandId, context);
}

export function createPapyroTiptapCommandExecutor({
  editor = null,
  entry = null,
  tabId = null,
} = {}) {
  const run = (scope, commandId, options = {}) => {
    const context = commandContext({
      editor: options.editor ?? editor,
      entry: options.entry ?? entry,
      tabId: options.tabId ?? tabId,
      message: options.message,
      extra: options.context,
    });

    if (scope === "slash" || scope === "insert") {
      return runControllerCommand({
        controller: context.entry?.slashCommands,
        commandId,
        context,
        missingError: "missing_slash_command_controller",
      });
    }

    if (scope === "format" || scope === "inline") {
      return runControllerCommand({
        controller: context.entry?.formatCommands,
        commandId,
        context,
        missingError: "missing_format_command_controller",
      });
    }

    if (scope === "history") {
      return runControllerCommand({
        controller: context.entry?.historyCommands,
        commandId,
        context,
        missingError: "missing_history_command_controller",
      });
    }

    if (scope === "block" || scope === "block-action") {
      return runControllerCommand({
        controller: context.entry?.blockActionCommands ?? context.entry?.blockActions,
        commandId,
        context,
        missingError: "missing_block_action_controller",
      });
    }

    if (scope === "table" || scope === "table-action") {
      return runControllerCommand({
        controller: context.entry?.tableCommands,
        commandId,
        context,
        missingError: "missing_table_command_controller",
      });
    }

    return {
      ok: false,
      commandId,
      error: "unknown_command_scope",
    };
  };

  return Object.freeze({
    run,
    runInsert: (commandId, options) => run("insert", commandId, options),
    runFormat: (commandId, options) => run("format", commandId, options),
    runHistory: (commandId, options) => run("history", commandId, options),
    runBlockAction: (commandId, options) => run("block-action", commandId, options),
    runTableAction: (commandId, options) => run("table-action", commandId, options),
  });
}

export function createPapyroTiptapRuntimeModel({
  editor = null,
  entry = null,
  selection = undefined,
  format = undefined,
} = {}) {
  return Object.freeze({
    editor,
    entry,
    language: normalizePapyroTiptapLanguage(entry),
    viewMode: normalizePapyroTiptapViewMode(entry),
    dioxus: entry?.dioxus ?? null,
    preferences: entry?.preferences ?? null,
    selection: selection ?? createPapyroTiptapSelectionSnapshot(editor),
    format: format ?? createPapyroTiptapFormatSnapshot(editor),
    commands: createPapyroTiptapCommandExecutor({
      editor,
      entry,
      tabId: entry?.dom?.dataset?.tabId ?? null,
    }),
  });
}
