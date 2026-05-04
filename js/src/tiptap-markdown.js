import { MarkdownManager } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";

export function createPapyroTiptapExtensions() {
  return [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3, 4, 5, 6],
      },
      link: {
        openOnClick: false,
        autolink: false,
      },
    }),
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
