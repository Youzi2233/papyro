import { mergeAttributes, Node } from "@tiptap/core";
import katex from "katex";

const INLINE_MATH_TOKEN = "inlineMath";
const MATH_BLOCK_TOKEN = "mathBlock";

function normalizeMathSource(source) {
  return String(source ?? "").replace(/\r\n?/g, "\n").trim();
}

function isEscaped(source, index) {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function isValidInlineBoundary(source, open, close) {
  const afterOpen = source[open + 1];
  const beforeClose = source[close - 1];
  if (!afterOpen || !beforeClose) return false;
  if (/\s/u.test(afterOpen) || /\s/u.test(beforeClose)) return false;
  if (/\d/u.test(source[open - 1] ?? "") && /\d/u.test(afterOpen)) return false;
  return true;
}

export function findInlineMathToken(source) {
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

export function tokenizeInlineMath(source) {
  const token = findInlineMathToken(source);
  if (!token || token.index !== 0) return undefined;

  return {
    type: INLINE_MATH_TOKEN,
    raw: token.raw,
    text: token.source,
  };
}

export function tokenizeMathBlock(source) {
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

export function renderKatexElement(element, source, displayMode) {
  const math = normalizeMathSource(source);
  element.classList.remove("mn-tiptap-math-error");
  element.dataset.mathState = "rendered";
  element.dataset.mathSource = math;

  if (!math) {
    element.dataset.mathState = "empty";
    element.textContent = displayMode ? "$$\n\n$$" : "$$";
    return { ok: false, error: "empty_math" };
  }

  try {
    element.innerHTML = katex.renderToString(math, {
      displayMode,
      output: "mathml",
      throwOnError: true,
      strict: "ignore",
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

function setMathNodeSource(editor, getPos, node, source) {
  if (typeof getPos !== "function") return false;

  const pos = getPos();
  if (!Number.isSafeInteger(pos)) return false;

  const nextAttrs = {
    ...node.attrs,
    source: normalizeMathSource(source),
  };
  editor.view.dispatch(editor.view.state.tr.setNodeMarkup(pos, undefined, nextAttrs));
  return true;
}

function createMathNodeView({ displayMode }) {
  return ({ editor, getPos, node }) => {
    let currentNode = node;
    let editing = false;
    let draft = currentNode.attrs.source ?? "";
    const documentRef = editor.view.dom.ownerDocument;
    const tagName = displayMode ? "div" : "span";
    const root = documentRef.createElement(tagName);
    const preview = documentRef.createElement(tagName);
    const sourceEditor = documentRef.createElement(displayMode ? "textarea" : "input");

    root.className = displayMode ? "mn-tiptap-math-block" : "mn-tiptap-inline-math";
    root.contentEditable = "false";
    root.tabIndex = 0;
    root.setAttribute("role", "button");
    root.setAttribute("aria-label", displayMode ? "Edit display math source" : "Edit inline math source");

    preview.className = displayMode ? "mn-tiptap-math-preview" : "mn-tiptap-inline-math-preview";
    sourceEditor.className = displayMode
      ? "mn-tiptap-math-source"
      : "mn-tiptap-inline-math-source";
    sourceEditor.spellcheck = false;
    if (!displayMode) sourceEditor.type = "text";

    const commit = () => {
      if (!editing) return;
      editing = false;
      setMathNodeSource(editor, getPos, currentNode, sourceEditor.value);
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
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
        editor.commands.focus();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        commit();
        editor.commands.focus();
        return;
      }
      if (!displayMode && event.key === "Enter") {
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
      update(updatedNode) {
        if (updatedNode.type.name !== currentNode.type.name) return false;
        currentNode = updatedNode;
        draft = currentNode.attrs.source ?? "";
        render();
        return true;
      },
      ignoreMutation() {
        return true;
      },
      stopEvent(event) {
        return editing && root.contains(event.target);
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

  parseMarkdown: (token, helpers) =>
    helpers.createNode("inlineMath", { source: normalizeMathSource(token.text) }),

  renderMarkdown: (node) => `$${normalizeMathSource(node.attrs?.source)}$`,

  addCommands() {
    return {
      setInlineMath:
        (attributes = {}) =>
        ({ commands }) =>
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

  parseMarkdown: (token, helpers) =>
    helpers.createNode("mathBlock", {
      source: normalizeMathSource(token.text),
      singleLine: token.singleLine === true,
    }),

  renderMarkdown: (node) => {
    const source = normalizeMathSource(node.attrs?.source);
    if (node.attrs?.singleLine && source && !source.includes("\n")) {
      return `$$${source}$$`;
    }
    return `$$\n${source}\n$$`;
  },

  addCommands() {
    return {
      setMathBlock:
        (attributes = {}) =>
        ({ commands }) =>
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
