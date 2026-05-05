import { isPlainUrl, normalizeEditorPreferences } from "./editor-core.js";

function clipboardPlainText(event, slice) {
  const fromClipboard = event?.clipboardData?.getData?.("text/plain");
  if (typeof fromClipboard === "string") {
    return fromClipboard;
  }

  let text = "";
  slice?.content?.forEach?.((node) => {
    text += node?.textContent ?? "";
  });
  return text;
}

function selectedTextContext(editor, view) {
  const state = view?.state ?? editor?.state ?? editor?.view?.state;
  const selection = state?.selection;
  if (!selection || selection.empty || typeof selection.from !== "number") {
    return null;
  }

  const text = state.doc?.textBetween?.(selection.from, selection.to, "\n", "\uFFFC") ?? "";
  if (!text.trim() || /[\r\n]/.test(text)) {
    return null;
  }

  return {
    from: selection.from,
    to: selection.to,
    text,
  };
}

export function autoLinkSelectedTextOnPaste({
  editor,
  view,
  event,
  slice,
  preferences = {},
} = {}) {
  const normalized = normalizeEditorPreferences(preferences);
  if (!normalized.autoLinkPaste || typeof editor?.commands?.setLink !== "function") {
    return false;
  }

  const pastedText = clipboardPlainText(event, slice).trim();
  if (!isPlainUrl(pastedText)) {
    return false;
  }

  const selection = selectedTextContext(editor, view);
  if (!selection) {
    return false;
  }

  editor.commands.setTextSelection?.({ from: selection.from, to: selection.to });
  const ok = editor.commands.setLink({ href: pastedText }) !== false;
  if (!ok) {
    return false;
  }

  event?.preventDefault?.();
  editor.commands.focus?.();
  return true;
}

export class TiptapPasteController {
  #editor = null;
  #entry = null;

  attach({ editor, entry } = {}) {
    this.#editor = editor ?? null;
    this.#entry = entry ?? null;
  }

  handlePaste({ view, event, slice } = {}) {
    return autoLinkSelectedTextOnPaste({
      editor: this.#editor,
      view,
      event,
      slice,
      preferences: this.#entry?.preferences,
    });
  }

  destroy() {
    this.#editor = null;
    this.#entry = null;
  }
}

export function createTiptapPasteController() {
  return new TiptapPasteController();
}
