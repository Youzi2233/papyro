import { MarkdownManager } from "@tiptap/markdown";
import { NodeRange } from "@tiptap/extension-node-range";
import { UniqueID } from "@tiptap/extension-unique-id";
import { TrailingNode } from "@tiptap/extensions/trailing-node";
import { StarterKit } from "@tiptap/starter-kit";

import { createPapyroCalloutExtensions } from "./tiptap-callout.js";
import { createPapyroCodeBlockExtensions } from "./tiptap-code-block.js";
import { createPapyroImageExtensions } from "./tiptap-image.js";
import { createPapyroMathExtensions } from "./tiptap-math.js";
import { createPapyroMermaidExtensions } from "./tiptap-mermaid.js";
import { createPapyroTableExtensions } from "./tiptap-table.js";
import { createPapyroTaskListExtensions } from "./tiptap-task-list.js";
import { createPapyroTextStyleExtensions } from "./tiptap-text-style.js";

export const PAPYRO_UNIQUE_ID_NODE_TYPES = Object.freeze([
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "taskList",
  "codeBlock",
  "table",
  "calloutBlock",
  "mathBlock",
  "mermaidBlock",
]);

function cloneWithoutPapyroRuntimeAttrs(node) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return node;

  const next = { ...node };
  if (next.attrs && typeof next.attrs === "object") {
    const attrs = { ...next.attrs };
    delete attrs.id;

    if (Object.keys(attrs).length > 0) {
      next.attrs = attrs;
    } else {
      delete next.attrs;
    }
  }

  if (Array.isArray(next.content)) {
    next.content = next.content.map(cloneWithoutPapyroRuntimeAttrs);
  }

  return next;
}

function isEmptyParagraph(node) {
  return node?.type === "paragraph" && (!Array.isArray(node.content) || node.content.length === 0);
}

export function preparePapyroMarkdownDoc(doc) {
  const normalized = cloneWithoutPapyroRuntimeAttrs(doc);
  if (!normalized || typeof normalized !== "object" || normalized.type !== "doc") {
    return normalized;
  }

  const content = Array.isArray(normalized.content) ? [...normalized.content] : [];
  if (content.length > 1 && isEmptyParagraph(content.at(-1))) {
    content.pop();
  }

  return {
    ...normalized,
    ...(content.length > 0 ? { content } : {}),
  };
}

export function createPapyroTiptapExtensions({
  codeBlockNodeViewRenderer = null,
} = {}) {
  return [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3, 4, 5, 6],
      },
      link: {
        openOnClick: false,
        autolink: false,
        linkOnPaste: false,
      },
      codeBlock: false,
      trailingNode: false,
    }),
    NodeRange.configure({
      key: "Mod",
    }),
    TrailingNode.configure({
      node: "paragraph",
      notAfter: ["paragraph"],
    }),
    UniqueID.configure({
      types: PAPYRO_UNIQUE_ID_NODE_TYPES,
    }),
    ...createPapyroCodeBlockExtensions({
      nodeViewRenderer: codeBlockNodeViewRenderer,
    }),
    ...createPapyroTaskListExtensions(),
    ...createPapyroTableExtensions(),
    ...createPapyroTextStyleExtensions(),
    ...createPapyroMathExtensions(),
    ...createPapyroMermaidExtensions(),
    ...createPapyroImageExtensions(),
    ...createPapyroCalloutExtensions(),
  ];
}

export function createPapyroMarkdownManager({ extensions } = {}) {
  return new MarkdownManager({
    extensions: extensions ?? createPapyroTiptapExtensions(),
    indentation: {
      style: "space",
      size: 2,
    },
  });
}

export function parseTiptapMarkdown(markdown, manager = createPapyroMarkdownManager()) {
  return manager.parse(markdown ?? "");
}

export function serializeTiptapMarkdown(doc, manager = createPapyroMarkdownManager()) {
  return manager.serialize(preparePapyroMarkdownDoc(doc));
}

export function roundTripTiptapMarkdown(markdown, manager = createPapyroMarkdownManager()) {
  const parsed = parseTiptapMarkdown(markdown, manager);
  const serialized = serializeTiptapMarkdown(parsed, manager);

  return {
    parsed,
    serialized,
    reparsed: parseTiptapMarkdown(serialized, manager),
  };
}
