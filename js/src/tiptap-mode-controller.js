export const TIPTAP_VIEW_MODE_CONTRACT = Object.freeze({
  source: Object.freeze({
    mode: "source",
    richTextEditable: false,
    sourcePaneVisible: true,
    rustPreviewVisible: false,
  }),
  hybrid: Object.freeze({
    mode: "hybrid",
    richTextEditable: true,
    sourcePaneVisible: false,
    rustPreviewVisible: false,
  }),
  preview: Object.freeze({
    mode: "preview",
    richTextEditable: false,
    sourcePaneVisible: false,
    rustPreviewVisible: true,
  }),
});

export function normalizeTiptapViewMode(mode) {
  if (typeof mode !== "string") return "hybrid";
  const normalized = mode.trim().toLowerCase();
  return ["source", "hybrid", "preview"].includes(normalized) ? normalized : "hybrid";
}

export function tiptapViewModeContract(mode) {
  return TIPTAP_VIEW_MODE_CONTRACT[normalizeTiptapViewMode(mode)];
}

export function tiptapModeAllowsRichTextEditing(mode) {
  return tiptapViewModeContract(mode).richTextEditable;
}

export function tiptapModeUsesSourcePane(mode) {
  return tiptapViewModeContract(mode).sourcePaneVisible;
}

export function tiptapModeUsesRustPreview(mode) {
  return tiptapViewModeContract(mode).rustPreviewVisible;
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
    const contract = tiptapViewModeContract(mode);
    this.#mode = mode;

    if (entry) {
      entry.viewMode = mode;
      if (entry.dom?.dataset) {
        entry.dom.dataset.viewMode = mode;
      }
      entry.editor?.setEditable?.(contract.richTextEditable);
    }

    return mode;
  }
}

export function createTiptapModeController(initialMode) {
  return new TiptapModeController(initialMode);
}
