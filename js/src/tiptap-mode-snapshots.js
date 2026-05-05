import { normalizeTiptapViewMode } from "./tiptap-mode-controller.js";

function safePosition(value) {
  const position = Number(value);
  return Number.isSafeInteger(position) && position >= 0 ? position : null;
}

function editorSelectionSnapshot(editor) {
  const selection = editor?.state?.selection;
  const from = safePosition(selection?.from);
  const to = safePosition(selection?.to);
  if (from === null || to === null) return null;

  return {
    from,
    to,
  };
}

function sourceSelectionSnapshot(sourcePane) {
  const textarea = sourcePane?.textarea;
  if (!textarea) return null;

  const valueLength = String(textarea.value ?? "").length;
  const from = safePosition(textarea.selectionStart);
  const to = safePosition(textarea.selectionEnd);
  if (from === null || to === null) return null;

  return {
    from: Math.min(from, valueLength),
    to: Math.min(to, valueLength),
  };
}

function restoreEditorSelection(editor, selection) {
  if (!editor || !selection) return false;

  const from = safePosition(selection.from);
  const to = safePosition(selection.to);
  if (from === null || to === null) return false;

  const selected =
    typeof editor.commands?.setTextSelection === "function" &&
    editor.commands.setTextSelection({ from, to }) !== false;
  if (!selected) return false;

  editor.commands?.focus?.();
  return true;
}

function restoreSourceSelection(sourcePane, selection) {
  const textarea = sourcePane?.textarea;
  if (!textarea || !selection) return false;

  const valueLength = String(textarea.value ?? "").length;
  const from = Math.min(safePosition(selection.from) ?? valueLength, valueLength);
  const to = Math.min(safePosition(selection.to) ?? from, valueLength);
  textarea.setSelectionRange?.(from, to);
  textarea.focus?.();
  return true;
}

function markdownRevision(entry) {
  return entry?.markdownSync?.markdown?.length ?? 0;
}

export class TiptapModeSnapshotController {
  #snapshots = new Map();

  get snapshots() {
    return new Map(
      Array.from(this.#snapshots.entries()).map(([mode, snapshot]) => [mode, { ...snapshot }]),
    );
  }

  capture(entry, mode = entry?.viewMode) {
    const normalizedMode = normalizeTiptapViewMode(mode);
    const selection =
      normalizedMode === "source"
        ? sourceSelectionSnapshot(entry?.sourcePane)
        : editorSelectionSnapshot(entry?.editor);

    if (!selection) return null;

    const snapshot = {
      mode: normalizedMode,
      selection,
      markdownRevision: markdownRevision(entry),
    };
    this.#snapshots.set(normalizedMode, snapshot);
    return { ...snapshot, selection: { ...selection } };
  }

  restore(entry, mode = entry?.viewMode) {
    const normalizedMode = normalizeTiptapViewMode(mode);
    const snapshot = this.#snapshots.get(normalizedMode);
    if (!snapshot) return false;
    if (snapshot.markdownRevision !== markdownRevision(entry)) return false;

    if (normalizedMode === "source") {
      return restoreSourceSelection(entry?.sourcePane, snapshot.selection);
    }

    if (normalizedMode === "hybrid") {
      return restoreEditorSelection(entry?.editor, snapshot.selection);
    }

    return false;
  }

  clear() {
    this.#snapshots.clear();
  }
}

export function createTiptapModeSnapshotController() {
  return new TiptapModeSnapshotController();
}
