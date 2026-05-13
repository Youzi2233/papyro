import { mergeAttributes, Node } from "@tiptap/core";

import { mermaidSourceEditorLabel } from "./tiptap-i18n.ts";
import { renderMermaidIntoElement } from "./mermaid-renderer.js";

const MERMAID_TOKEN = "mermaidBlock";
const MERMAID_EDIT_RENDER_DELAY_MS = 220;

function normalizeMermaidSource(source) {
  return String(source ?? "").replace(/\r\n?/g, "\n").trim();
}

function nodeViewLanguage(view) {
  return view?.dom?.dataset?.language ?? view?.dom?.ownerDocument?.documentElement?.lang ?? "english";
}

export function tokenizeMermaidBlock(source) {
  const text = String(source ?? "");
  const match = /^(?: {0,3})(`{3,}|~{3,})[ \t]*mermaid[^\n]*\n([\s\S]*?)\n\1[ \t]*(?:\n|$)/iu.exec(text);
  if (!match) return undefined;

  return {
    type: MERMAID_TOKEN,
    raw: match[0],
    text: normalizeMermaidSource(match[2]),
  };
}

function setMermaidSource(view, getPos, node, source) {
  if (typeof getPos !== "function") return false;

  const pos = getPos();
  if (!Number.isSafeInteger(pos)) return false;

  view.dispatch(
    view.state.tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      source: normalizeMermaidSource(source),
    }),
  );
  return true;
}

function createMermaidNodeView() {
  return ({ editor, getPos, node, view }) => {
    let currentNode = node;
    let editing = false;
    let renderTimer = 0;
    const documentRef = view.dom.ownerDocument;
    const windowRef = documentRef.defaultView ?? window;
    const root = documentRef.createElement("div");
    const preview = documentRef.createElement("div");
    const editorShell = documentRef.createElement("div");
    const sourceEditor = documentRef.createElement("textarea");
    const previewPane = documentRef.createElement("div");

    root.className = "mn-mermaid-block mn-tiptap-mermaid-block";
    root.contentEditable = "false";
    root.tabIndex = 0;
    root.setAttribute("role", "button");
    root.setAttribute("aria-label", mermaidSourceEditorLabel(nodeViewLanguage(view)));

    preview.className = "mn-tiptap-mermaid-preview";
    editorShell.className = "mn-tiptap-mermaid-editor";
    sourceEditor.className = "mn-tiptap-mermaid-source";
    sourceEditor.spellcheck = false;
    previewPane.className = "mn-tiptap-mermaid-preview-pane";

    const schedulePreview = () => {
      windowRef.clearTimeout(renderTimer);
      renderTimer = windowRef.setTimeout(() => {
        void renderMermaidIntoElement(previewPane, sourceEditor.value);
      }, MERMAID_EDIT_RENDER_DELAY_MS);
    };
    const commit = () => {
      if (!editing) return;
      editing = false;
      windowRef.clearTimeout(renderTimer);
      setMermaidSource(view, getPos, currentNode, sourceEditor.value);
      render();
    };
    const cancel = () => {
      editing = false;
      windowRef.clearTimeout(renderTimer);
      render();
    };
    const startEditing = () => {
      editing = true;
      render();
      sourceEditor.focus();
      sourceEditor.select();
    };

    sourceEditor.addEventListener("input", schedulePreview);
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
      }
    });
    sourceEditor.addEventListener("blur", commit);
    root.addEventListener("dblclick", (event) => {
      event.preventDefault();
      startEditing();
    });

    function render() {
      root.dataset.mermaidEditing = editing ? "true" : "false";
      const source = currentNode.attrs.source ?? "";
      if (editing) {
        sourceEditor.value = source;
        editorShell.replaceChildren(sourceEditor, previewPane);
        root.replaceChildren(editorShell);
        void renderMermaidIntoElement(previewPane, source);
        return;
      }

      root.replaceChildren(preview);
      void renderMermaidIntoElement(preview, source);
    }

    render();

    return {
      dom: root,
      update(updatedNode) {
        if (updatedNode.type.name !== currentNode.type.name) return false;
        currentNode = updatedNode;
        render();
        return true;
      },
      destroy() {
        windowRef.clearTimeout(renderTimer);
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

export const PapyroMermaidBlock = Node.create({
  name: "mermaidBlock",
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
        parseHTML: (element) => element.getAttribute("data-mermaid-source") ?? "",
        renderHTML: (attributes) => ({
          "data-mermaid-source": attributes.source ?? "",
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-mn-mermaid="block"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-mn-mermaid": "block",
        class: "mn-mermaid-block mn-tiptap-mermaid-block",
      }),
      node.attrs.source || "",
    ];
  },

  addNodeView() {
    return createMermaidNodeView();
  },

  markdownTokenName: MERMAID_TOKEN,

  markdownTokenizer: {
    name: MERMAID_TOKEN,
    level: "block",
    start: (source) => {
      const match = /(^|\n)( {0,3}(?:`{3,}|~{3,})[ \t]*mermaid\b)/iu.exec(
        String(source ?? ""),
      );
      return match ? match.index + match[1].length : -1;
    },
    tokenize: tokenizeMermaidBlock,
  },

  parseMarkdown: (token, helpers) =>
    helpers.createNode("mermaidBlock", {
      source: normalizeMermaidSource(token.text),
    }),

  renderMarkdown: (node) => `\`\`\`mermaid\n${normalizeMermaidSource(node.attrs?.source)}\n\`\`\``,

  addCommands() {
    return {
      setMermaidBlock:
        (attributes = {}) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { source: normalizeMermaidSource(attributes.source) },
          }),
    };
  },
});

export function createPapyroMermaidExtensions() {
  return [PapyroMermaidBlock];
}
