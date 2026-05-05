import { MarkdownManager } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";

import { createPapyroImageExtensions } from "./tiptap-image.js";
import { createPapyroMathExtensions } from "./tiptap-math.js";
import { createPapyroMermaidExtensions } from "./tiptap-mermaid.js";
import { createPapyroTableExtensions } from "./tiptap-table.js";
import { createPapyroTaskListExtensions } from "./tiptap-task-list.js";

export function createPapyroTiptapExtensions() {
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
    }),
    ...createPapyroTaskListExtensions(),
    ...createPapyroTableExtensions(),
    ...createPapyroMathExtensions(),
    ...createPapyroMermaidExtensions(),
    ...createPapyroImageExtensions(),
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
