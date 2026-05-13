import { isPlainUrl, normalizeEditorPreferences } from "./editor-core.ts";

type ClipboardLike = {
  getData?: (type: string) => string;
};

export type PapyroPasteEvent = {
  clipboardData?: ClipboardLike | null;
  preventDefault?: () => void;
};

type SliceLike = {
  content?: {
    forEach?: (callback: (node: { textContent?: string | null }) => void) => void;
  } | null;
};

type SelectionLike = {
  empty?: boolean;
  from?: number;
  to?: number;
};

type DocLike = {
  textBetween?: (
    from: number,
    to: number,
    blockSeparator?: string,
    leafText?: string,
  ) => string;
};

type StateLike = {
  doc?: DocLike | null;
  selection?: SelectionLike | null;
};

export type PapyroPasteEditor = {
  state?: StateLike | null;
  view?: { state?: StateLike | null } | null;
  commands?: {
    focus?: () => unknown;
    setLink?: (attrs: { href: string }) => unknown;
    setTextSelection?: (range: { from: number; to: number }) => unknown;
  } | null;
};

export type PapyroPasteView = {
  state?: StateLike | null;
};

export type PapyroPastePreferences = {
  auto_link_paste?: boolean | null;
  autoLinkPaste?: boolean | null;
  language?: string | null;
  app_language?: string | null;
  appLanguage?: string | null;
};

type SelectedTextContext = {
  from: number;
  to: number;
  text: string;
};

export type PapyroPasteEntry = {
  preferences?: PapyroPastePreferences | null;
};

export type AutoLinkPasteInput = {
  editor?: PapyroPasteEditor | null;
  view?: PapyroPasteView | null;
  event?: PapyroPasteEvent | null;
  slice?: SliceLike | null;
  preferences?: PapyroPastePreferences | null;
};

function clipboardPlainText(event?: PapyroPasteEvent | null, slice?: SliceLike | null): string {
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

function selectedTextContext(
  editor?: PapyroPasteEditor | null,
  view?: PapyroPasteView | null,
): SelectedTextContext | null {
  const state = view?.state ?? editor?.state ?? editor?.view?.state;
  const selection = state?.selection;
  if (!selection || selection.empty || typeof selection.from !== "number") {
    return null;
  }

  const to = typeof selection.to === "number" ? selection.to : selection.from;
  const text = state.doc?.textBetween?.(selection.from, to, "\n", "\uFFFC") ?? "";
  if (!text.trim() || /[\r\n]/.test(text)) {
    return null;
  }

  return {
    from: selection.from,
    to,
    text,
  };
}

export function autoLinkSelectedTextOnPaste({
  editor,
  view,
  event,
  slice,
  preferences = {},
}: AutoLinkPasteInput = {}): boolean {
  const normalized = normalizeEditorPreferences(preferences ?? {});
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
  #editor: PapyroPasteEditor | null = null;
  #entry: PapyroPasteEntry | null = null;

  attach({
    editor,
    entry,
  }: {
    editor?: PapyroPasteEditor | null;
    entry?: PapyroPasteEntry | null;
  } = {}): void {
    this.#editor = editor ?? null;
    this.#entry = entry ?? null;
  }

  handlePaste({
    view,
    event,
    slice,
  }: {
    view?: PapyroPasteView | null;
    event?: PapyroPasteEvent | null;
    slice?: SliceLike | null;
  } = {}): boolean {
    return autoLinkSelectedTextOnPaste({
      editor: this.#editor,
      view,
      event,
      slice,
      preferences: this.#entry?.preferences,
    });
  }

  destroy(): void {
    this.#editor = null;
    this.#entry = null;
  }
}

export function createTiptapPasteController(): TiptapPasteController {
  return new TiptapPasteController();
}
