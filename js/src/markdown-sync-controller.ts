import {
  createPapyroMarkdownManager,
  parseTiptapMarkdown,
  serializeTiptapMarkdown,
} from "./tiptap-markdown.js";

type MarkdownManager = {
  parse?: (markdown: string) => unknown;
  serialize?: (doc: unknown) => string;
};

type MarkdownParseFailure = {
  type: "markdown_parse_failed";
  message: string;
  markdown: string;
};

type MarkdownParseSuccess = {
  ok: true;
  doc: unknown;
  markdown: string;
};

type MarkdownParseResult =
  | MarkdownParseSuccess
  | {
      ok: false;
      error: MarkdownParseFailure;
      markdown: string;
    };

type MarkdownSerializeResult =
  | {
      ok: true;
      markdown: string;
    }
  | {
      ok: false;
      error: MarkdownParseFailure;
      markdown: string;
    };

type MarkdownSyncControllerOptions = {
  initialMarkdown?: string | null;
  manager?: MarkdownManager;
};

type TiptapMarkdownEditor = {
  getJSON?: () => unknown;
  getMarkdown?: () => string | null | undefined;
};

function createParseFailure(
  error: unknown,
  markdown: string,
): MarkdownParseFailure {
  return {
    type: "markdown_parse_failed",
    message: error instanceof Error ? error.message : String(error),
    markdown,
  };
}

export class MarkdownSyncController {
  #markdown: string;
  #manager: MarkdownManager;
  #lastError: MarkdownParseFailure | null;

  constructor({
    initialMarkdown = "",
    manager = createPapyroMarkdownManager(),
  }: MarkdownSyncControllerOptions = {}) {
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

  parse(markdown = this.#markdown): MarkdownParseResult {
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

  setMarkdown(markdown: string | null | undefined): MarkdownParseResult {
    const nextMarkdown = markdown ?? "";
    const result = this.parse(nextMarkdown);
    if (result.ok) {
      this.#markdown = nextMarkdown;
    }
    return result;
  }

  setFromEditor(editor: TiptapMarkdownEditor | null | undefined): string {
    if (!editor) {
      throw new TypeError("MarkdownSyncController requires a Tiptap editor");
    }

    let markdown: string | null | undefined = null;
    if (typeof editor.getJSON === "function") {
      markdown = serializeTiptapMarkdown(editor.getJSON(), this.#manager);
    } else if (typeof editor.getMarkdown === "function") {
      markdown = editor.getMarkdown();
    } else {
      throw new TypeError("MarkdownSyncController requires editor.getJSON() or editor.getMarkdown()");
    }

    this.#markdown = markdown ?? "";
    this.#lastError = null;
    return this.#markdown;
  }

  insertMarkdown(
    markdown: string | null | undefined,
    insertAt = this.#markdown.length,
  ): MarkdownParseResult {
    const insertion = markdown ?? "";
    const offset = Math.max(0, Math.min(Number(insertAt) || 0, this.#markdown.length));
    return this.setMarkdown(
      `${this.#markdown.slice(0, offset)}${insertion}${this.#markdown.slice(offset)}`,
    );
  }

  serializeDoc(doc: unknown): MarkdownSerializeResult {
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

export function createMarkdownSyncController(
  options?: MarkdownSyncControllerOptions,
) {
  return new MarkdownSyncController(options);
}
