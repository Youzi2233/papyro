import {
  sourceMarkdownParseErrorLabel,
  sourcePaneLabel,
} from "./tiptap-i18n.ts";
import {
  normalizeTiptapViewMode,
  tiptapModeUsesSourcePane,
} from "./tiptap-mode-controller.ts";

type SourcePaneDocument = {
  createElement?: (tagName: "textarea") => SourcePaneTextarea;
};

type SourcePaneTextarea = {
  className: string;
  spellcheck?: boolean;
  autocapitalize?: string;
  autocomplete?: string;
  hidden: boolean;
  value?: string;
  selectionStart?: number;
  selectionEnd?: number;
  parentElement?: unknown;
  setAttribute?: (name: string, value: string) => void;
  addEventListener?: (name: string, handler: SourcePaneEventHandler) => void;
  removeEventListener?: (name: string, handler: SourcePaneEventHandler) => void;
  setSelectionRange?: (start: number, end: number) => void;
  focus?: () => void;
  remove?: () => void;
};

type SourcePaneKeyboardEvent = {
  key?: unknown;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  preventDefault?: () => void;
};

type SourcePaneEventHandler = (event?: SourcePaneKeyboardEvent) => void;

type SourcePaneRoot = {
  appendChild?: (child: SourcePaneTextarea) => void;
};

type SourcePaneMarkdownSync = {
  markdown?: string;
  setMarkdown?: (markdown: string) => {
    ok?: boolean;
    markdown?: string;
    error?: {
      message?: string;
    } | null;
  } | null | undefined;
};

type SourcePaneEntry = {
  tabId?: string;
  dom?: {
    dataset?: {
      tabId?: string;
      language?: string;
    };
  } | null;
  preferences?: {
    language?: string;
  } | null;
  dioxus?: {
    send?: (message: Record<string, unknown>) => void;
  } | null;
  editor?: {
    commands?: {
      setContent?: (
        markdown: string,
        options: { contentType: "markdown" },
      ) => unknown;
    };
  } | null;
  markdownSync?: SourcePaneMarkdownSync | null;
  viewMode?: unknown;
  suppressChange?: boolean;
};

type SourcePaneAttachOptions = {
  root?: SourcePaneRoot | null;
  entry?: SourcePaneEntry | null;
};

type SourcePaneControllerOptions = {
  document?: SourcePaneDocument | null;
  onSelectionChange?: ((entry: SourcePaneEntry) => void) | null;
};

type TextareaSelection = {
  start?: unknown;
  end?: unknown;
};

function defaultDocument(): SourcePaneDocument | null {
  return typeof document === "undefined" ? null : document;
}

function tabIdForEntry(entry: SourcePaneEntry | null | undefined): string {
  return entry?.tabId ?? entry?.dom?.dataset?.tabId ?? "";
}

function entryLanguage(entry: SourcePaneEntry | null | undefined): string {
  return entry?.preferences?.language ?? entry?.dom?.dataset?.language ?? "english";
}

function isSaveShortcut(event: SourcePaneKeyboardEvent | undefined): boolean {
  if (!event || event.altKey) return false;
  const key = String(event.key ?? "").toLowerCase();
  return key === "s" && (event.ctrlKey || event.metaKey);
}

function normalizedCursorOffset(offset: unknown, length: number): number {
  if (offset == null) return length;
  const value = Number(offset);
  return Number.isSafeInteger(value) && value >= 0 && value <= length ? value : length;
}

function replaceTextareaSelection(
  textarea: SourcePaneTextarea,
  text: unknown,
  cursorOffset: unknown = null,
): string {
  const source = String(textarea.value ?? "");
  const from = Math.max(0, Math.min(textarea.selectionStart ?? source.length, source.length));
  const to = Math.max(from, Math.min(textarea.selectionEnd ?? from, source.length));
  const insertion = String(text ?? "");
  const cursor = from + normalizedCursorOffset(cursorOffset, insertion.length);
  textarea.value = `${source.slice(0, from)}${insertion}${source.slice(to)}`;
  textarea.setSelectionRange?.(cursor, cursor);
  return textarea.value;
}

function restoreTextareaSelection(
  textarea: SourcePaneTextarea | null | undefined,
  previousSelection: TextareaSelection | null | undefined,
): boolean {
  if (!textarea || !previousSelection) return false;
  const valueLength = String(textarea.value ?? "").length;
  const from = Math.max(
    0,
    Math.min(Number(previousSelection.start) || 0, valueLength),
  );
  const to = Math.max(
    from,
    Math.min(Number(previousSelection.end) || from, valueLength),
  );
  textarea.setSelectionRange?.(from, to);
  return true;
}

function emit(entry: SourcePaneEntry | null | undefined, message: Record<string, unknown>): void {
  entry?.dioxus?.send?.({
    tab_id: tabIdForEntry(entry),
    ...message,
  });
}

function syncTiptapEditor(entry: SourcePaneEntry, markdown: string): void {
  entry.suppressChange = true;
  try {
    entry.editor?.commands?.setContent?.(markdown, {
      contentType: "markdown",
    });
  } finally {
    entry.suppressChange = false;
  }
}

function commitSourceMarkdown(
  entry: SourcePaneEntry | null | undefined,
  markdown: string,
): boolean {
  if (entry?.markdownSync?.markdown === markdown) {
    return true;
  }

  const result = entry?.markdownSync?.setMarkdown?.(markdown);
  if (!result?.ok) {
    emit(entry, {
      type: "runtime_error",
      message: result?.error?.message ?? sourceMarkdownParseErrorLabel(entryLanguage(entry)),
    });
    return false;
  }

  if (!entry) return false;
  syncTiptapEditor(entry, entry.markdownSync?.markdown ?? markdown);
  emit(entry, {
    type: "content_changed",
    content: entry.markdownSync?.markdown ?? markdown,
  });
  return true;
}

export class TiptapSourcePaneController {
  #document: SourcePaneDocument | null;
  #entry: SourcePaneEntry | null = null;
  #textarea: SourcePaneTextarea | null = null;
  #inputHandler: SourcePaneEventHandler | null = null;
  #keydownHandler: SourcePaneEventHandler | null = null;
  #selectionHandler: SourcePaneEventHandler | null = null;
  #onSelectionChange: ((entry: SourcePaneEntry) => void) | null = null;

  constructor({
    document = defaultDocument(),
    onSelectionChange = null,
  }: SourcePaneControllerOptions = {}) {
    this.#document = document;
    this.#onSelectionChange =
      typeof onSelectionChange === "function" ? onSelectionChange : null;
  }

  get textarea(): SourcePaneTextarea | null {
    return this.#textarea;
  }

  attach({ root, entry }: SourcePaneAttachOptions = {}): SourcePaneTextarea | null {
    if (!root || !this.#document?.createElement || !entry) return null;
    this.#entry = entry;

    if (!this.#textarea) {
      const textarea = this.#document.createElement("textarea");
      textarea.className = "mn-tiptap-source-pane";
      textarea.spellcheck = false;
      textarea.autocapitalize = "off";
      textarea.autocomplete = "off";
      textarea.setAttribute?.("aria-label", sourcePaneLabel(entryLanguage(entry)));
      textarea.setAttribute?.("data-gramm", "false");
      textarea.hidden = true;
      this.#textarea = textarea;

      this.#inputHandler = () => {
        if (!this.#entry || !this.#textarea) return;
        commitSourceMarkdown(this.#entry, this.#textarea.value);
        this.#onSelectionChange?.(this.#entry);
      };
      this.#keydownHandler = (event) => {
        if (!isSaveShortcut(event)) return;
        event.preventDefault?.();
        emit(this.#entry, { type: "save_requested" });
      };
      this.#selectionHandler = () => {
        if (!this.#entry) return;
        this.#onSelectionChange?.(this.#entry);
      };
      textarea.addEventListener?.("input", this.#inputHandler);
      textarea.addEventListener?.("keydown", this.#keydownHandler);
      textarea.addEventListener?.("click", this.#selectionHandler);
      textarea.addEventListener?.("keyup", this.#selectionHandler);
      textarea.addEventListener?.("select", this.#selectionHandler);
    }

    if (this.#textarea.parentElement !== root) {
      root.appendChild?.(this.#textarea);
    }
    this.#textarea.setAttribute?.("aria-label", sourcePaneLabel(entryLanguage(entry)));
    this.setMarkdown(entry.markdownSync?.markdown ?? "");
    this.applyMode(entry);
    return this.#textarea;
  }

  applyMode(
    entry: SourcePaneEntry | null = this.#entry,
    mode: unknown = entry?.viewMode,
  ): boolean {
    if (!this.#textarea) return false;
    const active = tiptapModeUsesSourcePane(mode);
    this.#textarea.hidden = !active;
    if (active) {
      const previousSelection = {
        start: this.#textarea.selectionStart,
        end: this.#textarea.selectionEnd,
      };
      this.setMarkdown(entry?.markdownSync?.markdown ?? "");
      restoreTextareaSelection(this.#textarea, previousSelection);
    }
    return active;
  }

  setMarkdown(markdown: unknown): boolean {
    if (!this.#textarea) return false;
    const value = String(markdown ?? "");
    if (this.#textarea.value !== value) {
      this.#textarea.value = value;
    }
    return true;
  }

  insertMarkdown(
    entry: SourcePaneEntry | null = this.#entry,
    markdown: unknown = "",
    cursorOffset: unknown = null,
  ): boolean {
    if (!this.#textarea || normalizeTiptapViewMode(entry?.viewMode) !== "source") {
      return false;
    }
    const nextMarkdown = replaceTextareaSelection(this.#textarea, markdown, cursorOffset);
    return commitSourceMarkdown(entry, nextMarkdown);
  }

  focus(entry: SourcePaneEntry | null = this.#entry): boolean {
    if (!this.#textarea || normalizeTiptapViewMode(entry?.viewMode) !== "source") {
      return false;
    }
    this.#textarea.focus?.();
    return true;
  }

  destroy() {
    if (this.#textarea) {
      if (this.#inputHandler) {
        this.#textarea.removeEventListener?.("input", this.#inputHandler);
      }
      if (this.#keydownHandler) {
        this.#textarea.removeEventListener?.("keydown", this.#keydownHandler);
      }
      if (this.#selectionHandler) {
        this.#textarea.removeEventListener?.("click", this.#selectionHandler);
        this.#textarea.removeEventListener?.("keyup", this.#selectionHandler);
        this.#textarea.removeEventListener?.("select", this.#selectionHandler);
      }
      this.#textarea.remove?.();
    }
    this.#textarea = null;
    this.#entry = null;
    this.#inputHandler = null;
    this.#keydownHandler = null;
    this.#selectionHandler = null;
  }
}

export function createTiptapSourcePaneController(
  options?: SourcePaneControllerOptions,
): TiptapSourcePaneController {
  return new TiptapSourcePaneController(options);
}
