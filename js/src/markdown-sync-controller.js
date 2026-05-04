import {
  createPapyroMarkdownManager,
  parseTiptapMarkdown,
  serializeTiptapMarkdown,
} from "./tiptap-markdown.js";

function createParseFailure(error, markdown) {
  return {
    type: "markdown_parse_failed",
    message: error instanceof Error ? error.message : String(error),
    markdown,
  };
}

export class MarkdownSyncController {
  #markdown;
  #manager;
  #lastError;

  constructor({ initialMarkdown = "", manager = createPapyroMarkdownManager() } = {}) {
    this.#markdown = initialMarkdown ?? "";
    this.#manager = manager;
    this.#lastError = null;
  }

  get markdown() {
    return this.#markdown;
  }

  get lastError() {
    return this.#lastError;
  }

  parse(markdown = this.#markdown) {
    try {
      const doc = parseTiptapMarkdown(markdown, this.#manager);
      this.#lastError = null;
      return {
        ok: true,
        doc,
        markdown,
      };
    } catch (error) {
      this.#lastError = createParseFailure(error, markdown);
      return {
        ok: false,
        error: this.#lastError,
        markdown,
      };
    }
  }

  setMarkdown(markdown) {
    const nextMarkdown = markdown ?? "";
    const result = this.parse(nextMarkdown);
    if (result.ok) {
      this.#markdown = nextMarkdown;
    }
    return result;
  }

  setFromEditor(editor) {
    if (!editor || typeof editor.getMarkdown !== "function") {
      throw new TypeError("MarkdownSyncController requires editor.getMarkdown()");
    }

    const markdown = editor.getMarkdown();
    this.#markdown = markdown ?? "";
    this.#lastError = null;
    return this.#markdown;
  }

  insertMarkdown(markdown, insertAt = this.#markdown.length) {
    const insertion = markdown ?? "";
    const offset = Math.max(0, Math.min(Number(insertAt) || 0, this.#markdown.length));
    return this.setMarkdown(
      `${this.#markdown.slice(0, offset)}${insertion}${this.#markdown.slice(offset)}`,
    );
  }

  serializeDoc(doc) {
    try {
      const markdown = serializeTiptapMarkdown(doc, this.#manager);
      this.#markdown = markdown;
      this.#lastError = null;
      return {
        ok: true,
        markdown,
      };
    } catch (error) {
      this.#lastError = createParseFailure(error, this.#markdown);
      return {
        ok: false,
        error: this.#lastError,
        markdown: this.#markdown,
      };
    }
  }
}

export function createMarkdownSyncController(options) {
  return new MarkdownSyncController(options);
}
