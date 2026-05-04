export function normalizeTiptapViewMode(mode) {
  if (typeof mode !== "string") return "hybrid";
  const normalized = mode.trim().toLowerCase();
  return ["source", "hybrid", "preview"].includes(normalized) ? normalized : "hybrid";
}

export function tiptapModeAllowsRichTextEditing(mode) {
  return normalizeTiptapViewMode(mode) === "hybrid";
}

export class TiptapModeController {
  #mode;

  constructor(initialMode = "hybrid") {
    this.#mode = normalizeTiptapViewMode(initialMode);
  }

  get mode() {
    return this.#mode;
  }

  apply(entry, nextMode = this.#mode) {
    const mode = normalizeTiptapViewMode(nextMode);
    this.#mode = mode;

    if (entry) {
      entry.viewMode = mode;
      if (entry.dom?.dataset) {
        entry.dom.dataset.viewMode = mode;
      }
      entry.editor?.setEditable?.(tiptapModeAllowsRichTextEditing(mode));
    }

    return mode;
  }
}

export function createTiptapModeController(initialMode) {
  return new TiptapModeController(initialMode);
}
