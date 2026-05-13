import { mergeAttributes, Node } from "@tiptap/core";
import type {
  CommandProps,
  MarkdownParseHelpers,
  MarkdownToken,
  NodeViewRenderer,
  NodeViewRendererProps,
} from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import katex from "katex";

import { mathSourceEditorLabel } from "./tiptap-i18n.ts";

const INLINE_MATH_TOKEN = "inlineMath";
const MATH_BLOCK_TOKEN = "mathBlock";

export const PAPYRO_KATEX_OPTIONS = Object.freeze({
  output: "mathml",
  throwOnError: true,
  strict: "ignore",
  trust: false,
  maxSize: 8,
  maxExpand: 1000,
});

type MathAttributes = {
  source?: unknown;
  singleLine?: unknown;
};

type InlineMathMatch = {
  index: number;
  raw: string;
  source: string;
};

type InlineMathToken = MarkdownToken & {
  type: typeof INLINE_MATH_TOKEN;
  raw: string;
  text: string;
};

type MathBlockToken = MarkdownToken & {
  type: typeof MATH_BLOCK_TOKEN;
  raw: string;
  text: string;
  singleLine: boolean;
};

type KatexOptions = typeof PAPYRO_KATEX_OPTIONS & {
  displayMode?: boolean;
};

type KatexApi = {
  renderToString: (source: string, options: KatexOptions) => string;
};

type KatexRenderResult = {
  ok: boolean;
  error: string | null;
};

type KatexRenderer = {
  renderKatexElement: (
    element: HTMLElement,
    source: unknown,
    displayMode: boolean,
  ) => KatexRenderResult;
  renderPreviewMath: (root?: unknown) => number;
};

type DomQueryScope = {
  querySelectorAll: (selectors: string) => ArrayLike<Element>;
  matches?: (selectors: string) => boolean;
};

type DocumentOrNode = {
  nodeType?: number;
  ownerDocument?: Document | null;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    papyroMath: {
      setInlineMath: (attributes?: MathAttributes) => ReturnType;
      setMathBlock: (attributes?: MathAttributes) => ReturnType;
    };
  }
}

function normalizeMathSource(source: unknown): string {
  return String(source ?? "").replace(/\r\n?/g, "\n").trim();
}

function ownerDocumentFor(element: unknown): Document | null {
  const candidate = element as DocumentOrNode | null | undefined;
  if (candidate?.nodeType === 9) return candidate as Document;
  if (candidate?.ownerDocument) return candidate.ownerDocument;
  return typeof document === "undefined" ? null : document;
}

function isHTMLElement(element: unknown): element is HTMLElement {
  const elementWindow = (element as Element | null | undefined)?.ownerDocument?.defaultView;
  const HTMLElementConstructor = elementWindow?.HTMLElement ?? globalThis.HTMLElement;
  return typeof HTMLElementConstructor === "function" && element instanceof HTMLElementConstructor;
}

function mathSourceFromElement(element: HTMLElement): string {
  return element.querySelector(".mn-math-source")?.textContent ?? element.dataset.mathSource ?? "";
}

function isRenderedMathState(state: unknown): boolean {
  return state === "rendered" || state === "error" || state === "empty";
}

function nodeViewLanguage(view: EditorView): string {
  return view?.dom?.dataset?.language ?? view?.dom?.ownerDocument?.documentElement?.lang ?? "english";
}

function isEscaped(source: string, index: number): boolean {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function isValidInlineBoundary(source: string, open: number, close: number): boolean {
  const afterOpen = source[open + 1];
  const beforeClose = source[close - 1];
  if (!afterOpen || !beforeClose) return false;
  if (/\s/u.test(afterOpen) || /\s/u.test(beforeClose)) return false;
  if (/\d/u.test(source[open - 1] ?? "") && /\d/u.test(afterOpen)) return false;
  return true;
}

export function findInlineMathToken(source: unknown): InlineMathMatch | null {
  const text = String(source ?? "");
  let cursor = 0;

  while (cursor < text.length) {
    const open = text.indexOf("$", cursor);
    if (open < 0) return null;

    if (text[open - 1] === "$" || text[open + 1] === "$" || isEscaped(text, open)) {
      cursor = open + 1;
      continue;
    }

    let close = text.indexOf("$", open + 1);
    while (
      close >= 0 &&
      (text[close - 1] === "$" || text[close + 1] === "$" || isEscaped(text, close))
    ) {
      close = text.indexOf("$", close + 1);
    }

    if (close < 0) return null;
    if (isValidInlineBoundary(text, open, close)) {
      return {
        index: open,
        raw: text.slice(open, close + 1),
        source: text.slice(open + 1, close),
      };
    }

    cursor = close + 1;
  }

  return null;
}

export function tokenizeInlineMath(source: unknown): InlineMathToken | undefined {
  const token = findInlineMathToken(source);
  if (!token || token.index !== 0) return undefined;

  return {
    type: INLINE_MATH_TOKEN,
    raw: token.raw,
    text: token.source,
  };
}

export function tokenizeMathBlock(source: unknown): MathBlockToken | undefined {
  const text = String(source ?? "");
  const singleLine = /^(?: {0,3})\$\$([^\n]+?)\$\$(?:[ \t]*(?:\n|$))/u.exec(text);
  if (singleLine) {
    const math = normalizeMathSource(singleLine[1]);
    if (!math) return undefined;

    return {
      type: MATH_BLOCK_TOKEN,
      raw: singleLine[0],
      text: math,
      singleLine: true,
    };
  }

  const block = /^(?: {0,3})\$\$[ \t]*\n([\s\S]*?)\n(?: {0,3})\$\$(?:[ \t]*(?:\n|$))/u.exec(text);
  if (!block) return undefined;

  return {
    type: MATH_BLOCK_TOKEN,
    raw: block[0],
    text: normalizeMathSource(block[1]),
    singleLine: false,
  };
}

export function createKatexRenderer({
  katexApi = katex,
  options = PAPYRO_KATEX_OPTIONS,
}: {
  katexApi?: KatexApi;
  options?: typeof PAPYRO_KATEX_OPTIONS;
} = {}): KatexRenderer {
  function renderKatexElement(
    element: HTMLElement,
    source: unknown,
    displayMode: boolean,
  ): KatexRenderResult {
    const math = normalizeMathSource(source);
    element.classList.remove("mn-tiptap-math-error");
    element.dataset.mathState = "rendered";
    element.dataset.mathSource = math;
    element.title = "";

    if (!math) {
      element.dataset.mathState = "empty";
      element.textContent = displayMode ? "$$\n\n$$" : "$$";
      return { ok: false, error: "empty_math" };
    }

    try {
      element.innerHTML = katexApi.renderToString(math, {
        ...options,
        displayMode,
      });
      return { ok: true, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      element.dataset.mathState = "error";
      element.title = message;
      element.classList.add("mn-tiptap-math-error");
      element.textContent = displayMode ? `$$\n${math}\n$$` : `$${math}$`;
      return { ok: false, error: message };
    }
  }

  function renderPreviewMath(root: unknown = ownerDocumentFor(null)): number {
    const documentRef = ownerDocumentFor(root);
    if (!documentRef) return 0;

    const rootScope = root as Partial<DomQueryScope> | null | undefined;
    const scope: DomQueryScope =
      rootScope && typeof rootScope.querySelectorAll === "function"
        ? (rootScope as DomQueryScope)
        : documentRef;
    const previewRoots = scope.matches?.(".mn-preview")
      ? [scope]
      : Array.from(scope.querySelectorAll(".mn-preview"));
    let count = 0;

    for (const previewRoot of previewRoots) {
      for (const element of Array.from(
        previewRoot.querySelectorAll(".mn-math-inline, .mn-math-block"),
      )) {
        if (!isHTMLElement(element)) continue;

        const source = mathSourceFromElement(element);
        const math = normalizeMathSource(source);
        if (
          element.dataset.mathSource === math &&
          isRenderedMathState(element.dataset.mathState)
        ) {
          continue;
        }

        const displayMode = element.classList.contains("mn-math-block");
        renderKatexElement(element, source, displayMode);
        count += 1;
      }
    }

    return count;
  }

  return {
    renderKatexElement,
    renderPreviewMath,
  };
}

const defaultKatexRenderer = createKatexRenderer();

export const renderKatexElement = defaultKatexRenderer.renderKatexElement;
export const renderPreviewMath = defaultKatexRenderer.renderPreviewMath;

function setMathNodeSource(
  view: EditorView,
  getPos: NodeViewRendererProps["getPos"],
  node: ProseMirrorNode,
  source: unknown,
): boolean {
  if (typeof getPos !== "function") return false;

  const pos = getPos();
  if (typeof pos !== "number" || !Number.isSafeInteger(pos)) return false;

  const nextAttrs = {
    ...node.attrs,
    source: normalizeMathSource(source),
  };
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, nextAttrs));
  return true;
}

function createMathNodeView({ displayMode }: { displayMode: boolean }): NodeViewRenderer {
  return ({ editor, getPos, node, view }) => {
    let currentNode = node;
    let editing = false;
    let draft = currentNode.attrs.source ?? "";
    const documentRef = view.dom.ownerDocument;
    const tagName = displayMode ? "div" : "span";
    const root = documentRef.createElement(tagName);
    const preview = documentRef.createElement(tagName);
    const sourceEditor = documentRef.createElement(displayMode ? "textarea" : "input") as
      | HTMLTextAreaElement
      | HTMLInputElement;

    root.className = displayMode ? "mn-tiptap-math-block" : "mn-tiptap-inline-math";
    root.contentEditable = "false";
    root.tabIndex = 0;
    root.setAttribute("role", "button");
    root.setAttribute("aria-label", mathSourceEditorLabel(nodeViewLanguage(view), displayMode));

    preview.className = displayMode ? "mn-tiptap-math-preview" : "mn-tiptap-inline-math-preview";
    sourceEditor.className = displayMode
      ? "mn-tiptap-math-source"
      : "mn-tiptap-inline-math-source";
    sourceEditor.spellcheck = false;
    if (!displayMode) sourceEditor.setAttribute("type", "text");

    const commit = () => {
      if (!editing) return;
      editing = false;
      setMathNodeSource(view, getPos, currentNode, sourceEditor.value);
      render();
    };
    const cancel = () => {
      editing = false;
      draft = currentNode.attrs.source ?? "";
      render();
    };
    const startEditing = () => {
      editing = true;
      draft = currentNode.attrs.source ?? "";
      render();
      sourceEditor.focus();
      sourceEditor.select?.();
    };

    sourceEditor.addEventListener("keydown", (event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key === "Escape") {
        event.preventDefault();
        cancel();
        editor.commands.focus();
        return;
      }
      if ((keyboardEvent.metaKey || keyboardEvent.ctrlKey) && keyboardEvent.key === "Enter") {
        event.preventDefault();
        commit();
        editor.commands.focus();
        return;
      }
      if (!displayMode && keyboardEvent.key === "Enter") {
        event.preventDefault();
        commit();
        editor.commands.focus();
      }
    });
    sourceEditor.addEventListener("blur", commit);
    root.addEventListener("dblclick", (event) => {
      event.preventDefault();
      startEditing();
    });

    function render() {
      root.dataset.mathEditing = editing ? "true" : "false";
      if (editing) {
        sourceEditor.value = draft;
        root.replaceChildren(sourceEditor);
        return;
      }

      renderKatexElement(preview, currentNode.attrs.source, displayMode);
      root.replaceChildren(preview);
    }

    render();

    return {
      dom: root,
      update(updatedNode: ProseMirrorNode) {
        if (updatedNode.type.name !== currentNode.type.name) return false;
        currentNode = updatedNode;
        draft = currentNode.attrs.source ?? "";
        render();
        return true;
      },
      ignoreMutation() {
        return true;
      },
      stopEvent(event: Event) {
        const windowRef = root.ownerDocument.defaultView ?? window;
        return editing && event.target instanceof windowRef.Node && root.contains(event.target);
      },
    };
  };
}

export const PapyroInlineMath = Node.create({
  name: "inlineMath",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      source: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-math-source") ?? "",
        renderHTML: (attributes) => ({
          "data-math-source": attributes.source ?? "",
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-mn-math="inline"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-mn-math": "inline",
        class: "mn-tiptap-inline-math",
      }),
      node.attrs.source || "$$",
    ];
  },

  addNodeView() {
    return createMathNodeView({ displayMode: false });
  },

  markdownTokenName: INLINE_MATH_TOKEN,

  markdownTokenizer: {
    name: INLINE_MATH_TOKEN,
    level: "inline",
    start: (source) => findInlineMathToken(source)?.index ?? -1,
    tokenize: tokenizeInlineMath,
  },

  parseMarkdown: (token: MarkdownToken, helpers: MarkdownParseHelpers) =>
    helpers.createNode("inlineMath", { source: normalizeMathSource(token.text) }),

  renderMarkdown: (node: ProseMirrorNode | { attrs?: MathAttributes }) =>
    `$${normalizeMathSource(node.attrs?.source)}$`,

  addCommands() {
    return {
      setInlineMath:
        (attributes: MathAttributes = {}) =>
        ({ commands }: CommandProps) =>
          commands.insertContent({
            type: this.name,
            attrs: { source: normalizeMathSource(attributes.source) },
          }),
    };
  },
});

export const PapyroMathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  atom: true,
  selectable: true,
  isolating: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      source: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-math-source") ?? "",
        renderHTML: (attributes) => ({
          "data-math-source": attributes.source ?? "",
        }),
      },
      singleLine: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-math-single-line") === "true",
        renderHTML: (attributes) => ({
          "data-math-single-line": attributes.singleLine ? "true" : null,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-mn-math="block"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-mn-math": "block",
        class: "mn-tiptap-math-block",
      }),
      node.attrs.source || "$$",
    ];
  },

  addNodeView() {
    return createMathNodeView({ displayMode: true });
  },

  markdownTokenName: MATH_BLOCK_TOKEN,

  markdownTokenizer: {
    name: MATH_BLOCK_TOKEN,
    level: "block",
    start: "$$",
    tokenize: tokenizeMathBlock,
  },

  parseMarkdown: (token: MarkdownToken, helpers: MarkdownParseHelpers) =>
    helpers.createNode("mathBlock", {
      source: normalizeMathSource(token.text),
      singleLine: (token as Partial<MathBlockToken>).singleLine === true,
    }),

  renderMarkdown: (node: ProseMirrorNode | { attrs?: MathAttributes }) => {
    const source = normalizeMathSource(node.attrs?.source);
    if (node.attrs?.singleLine && source && !source.includes("\n")) {
      return `$$${source}$$`;
    }
    return `$$\n${source}\n$$`;
  },

  addCommands() {
    return {
      setMathBlock:
        (attributes: MathAttributes = {}) =>
        ({ commands }: CommandProps) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              source: normalizeMathSource(attributes.source),
              singleLine: attributes.singleLine === true,
            },
          }),
    };
  },
});

export function createPapyroMathExtensions() {
  return [PapyroInlineMath, PapyroMathBlock];
}
