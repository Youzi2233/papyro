import { normalizeTiptapViewMode } from "./tiptap-mode-controller.js";

function defaultDocument() {
  return typeof document === "undefined" ? null : document;
}

function tabIdForEntry(entry) {
  return entry?.tabId ?? entry?.dom?.dataset?.tabId ?? "";
}

function isSaveShortcut(event) {
  if (!event || event.altKey) return false;
  const key = String(event.key ?? "").toLowerCase();
  return key === "s" && (event.ctrlKey || event.metaKey);
}

function normalizedCursorOffset(offset, length) {
  if (offset == null) return length;
  const value = Number(offset);
  return Number.isSafeInteger(value) && value >= 0 && value <= length ? value : length;
}

function replaceTextareaSelection(textarea, text, cursorOffset = null) {
  const source = String(textarea.value ?? "");
  const from = Math.max(0, Math.min(textarea.selectionStart ?? source.length, source.length));
  const to = Math.max(from, Math.min(textarea.selectionEnd ?? from, source.length));
  const insertion = String(text ?? "");
  const cursor = from + normalizedCursorOffset(cursorOffset, insertion.length);
  textarea.value = `${source.slice(0, from)}${insertion}${source.slice(to)}`;
  textarea.setSelectionRange?.(cursor, cursor);
  return textarea.value;
}

function emit(entry, message) {
  entry?.dioxus?.send?.({
    tab_id: tabIdForEntry(entry),
    ...message,
  });
}

function syncTiptapEditor(entry, markdown) {
  entry.suppressChange = true;
  try {
    entry.editor?.commands?.setContent?.(markdown, {
      contentType: "markdown",
    });
  } finally {
    entry.suppressChange = false;
  }
}

function commitSourceMarkdown(entry, markdown) {
  const result = entry?.markdownSync?.setMarkdown?.(markdown);
  if (!result?.ok) {
    emit(entry, {
      type: "runtime_error",
      message: result?.error?.message ?? "Unable to parse Markdown source",
    });
    return false;
  }

  syncTiptapEditor(entry, entry.markdownSync.markdown);
  emit(entry, {
    type: "content_changed",
    content: entry.markdownSync.markdown,
  });
  return true;
}

export class TiptapSourcePaneController {
  #document;
  #entry = null;
  #textarea = null;
  #inputHandler = null;
  #keydownHandler = null;
  #selectionHandler = null;
  #onSelectionChange = null;

  constructor({ document = defaultDocument(), onSelectionChange = null } = {}) {
    this.#document = document;
    this.#onSelectionChange =
      typeof onSelectionChange === "function" ? onSelectionChange : null;
  }

  get textarea() {
    return this.#textarea;
  }

  attach({ root, entry } = {}) {
    if (!root || !this.#document?.createElement || !entry) return null;
    this.#entry = entry;

    if (!this.#textarea) {
      const textarea = this.#document.createElement("textarea");
      textarea.className = "mn-tiptap-source-pane";
      textarea.spellcheck = false;
      textarea.autocapitalize = "off";
      textarea.autocomplete = "off";
      textarea.setAttribute?.("aria-label", "Markdown source");
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
    this.setMarkdown(entry.markdownSync?.markdown ?? "");
    this.applyMode(entry);
    return this.#textarea;
  }

  applyMode(entry = this.#entry, mode = entry?.viewMode) {
    if (!this.#textarea) return false;
    const active = normalizeTiptapViewMode(mode) === "source";
    this.#textarea.hidden = !active;
    if (active) {
      this.setMarkdown(entry?.markdownSync?.markdown ?? "");
    }
    return active;
  }

  setMarkdown(markdown) {
    if (!this.#textarea) return false;
    const value = String(markdown ?? "");
    if (this.#textarea.value !== value) {
      this.#textarea.value = value;
    }
    return true;
  }

  insertMarkdown(entry = this.#entry, markdown = "", cursorOffset = null) {
    if (!this.#textarea || normalizeTiptapViewMode(entry?.viewMode) !== "source") {
      return false;
    }
    const nextMarkdown = replaceTextareaSelection(this.#textarea, markdown, cursorOffset);
    return commitSourceMarkdown(entry, nextMarkdown);
  }

  focus(entry = this.#entry) {
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

export function createTiptapSourcePaneController(options) {
  return new TiptapSourcePaneController(options);
}
