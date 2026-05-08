import { MarkdownManager } from "@tiptap/markdown";
import { NodeRange } from "@tiptap/extension-node-range";
import { StarterKit } from "@tiptap/starter-kit";

import { createPapyroCalloutExtensions } from "./tiptap-callout.js";
import { createPapyroCodeBlockExtensions } from "./tiptap-code-block.js";
import { createPapyroImageExtensions } from "./tiptap-image.js";
import { createPapyroMathExtensions } from "./tiptap-math.js";
import { createPapyroMermaidExtensions } from "./tiptap-mermaid.js";
import { createPapyroTableExtensions } from "./tiptap-table.js";
import { createPapyroTaskListExtensions } from "./tiptap-task-list.js";
import { createPapyroTextStyleExtensions } from "./tiptap-text-style.js";

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
    }),
    NodeRange.configure({
      key: "Mod",
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
  return manager.serialize(doc);
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
