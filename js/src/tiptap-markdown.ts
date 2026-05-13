import { MarkdownManager } from "@tiptap/markdown";
import type { AnyExtension, JSONContent } from "@tiptap/core";
import { NodeRange } from "@tiptap/extension-node-range";
import { TextAlign } from "@tiptap/extension-text-align";
import { UniqueID } from "@tiptap/extension-unique-id";
import { TrailingNode } from "@tiptap/extensions/trailing-node";
import { StarterKit } from "@tiptap/starter-kit";

import { createPapyroCalloutExtensions } from "./tiptap-callout.ts";
import { createPapyroCodeBlockExtensions } from "./tiptap-code-block.js";
import { UiState } from "./components/tiptap-extension/ui-state-extension.ts";
import { createPapyroImageExtensions } from "./tiptap-image.ts";
import { createPapyroMathExtensions } from "./tiptap-math.ts";
import { createPapyroMermaidExtensions } from "./tiptap-mermaid.ts";
import { createPapyroTableExtensions } from "./tiptap-table.ts";
import { createPapyroTaskListExtensions } from "./tiptap-task-list.ts";
import { createPapyroTextStyleExtensions } from "./tiptap-text-style.ts";

type PapyroJsonContent = JSONContent & {
  attrs?: Record<string, unknown>;
  content?: PapyroJsonContent[];
};

export type PapyroTiptapExtensionOptions = Readonly<{
  codeBlockNodeViewRenderer?: unknown;
}>;

export type PapyroMarkdownManagerOptions = Readonly<{
  extensions?: AnyExtension[];
}>;

export type PapyroMarkdownParser = Pick<MarkdownManager, "parse">;
export type PapyroMarkdownSerializer = Pick<MarkdownManager, "serialize">;
export type PapyroMarkdownManager = PapyroMarkdownParser & PapyroMarkdownSerializer;

export type PapyroMarkdownRoundTrip = Readonly<{
  parsed: JSONContent;
  serialized: string;
  reparsed: JSONContent;
}>;

export const PAPYRO_UNIQUE_ID_NODE_TYPES: readonly string[] = Object.freeze([
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

function cloneWithoutPapyroRuntimeAttrs(
  node: PapyroJsonContent | unknown,
): PapyroJsonContent | unknown {
  if (!node || typeof node !== "object" || Array.isArray(node)) return node;

  const next: PapyroJsonContent = { ...(node as PapyroJsonContent) };
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
    next.content = next.content.map((child) =>
      cloneWithoutPapyroRuntimeAttrs(child),
    ) as PapyroJsonContent[];
  }

  return next;
}

function isEmptyParagraph(node: PapyroJsonContent | undefined): boolean {
  return node?.type === "paragraph" && (!Array.isArray(node.content) || node.content.length === 0);
}

export function preparePapyroMarkdownDoc(doc: JSONContent): JSONContent {
  const normalized = cloneWithoutPapyroRuntimeAttrs(doc);
  const normalizedDoc = normalized as PapyroJsonContent | null;
  if (!normalizedDoc || typeof normalizedDoc !== "object" || normalizedDoc.type !== "doc") {
    return normalized as JSONContent;
  }

  const content = Array.isArray(normalizedDoc.content) ? [...normalizedDoc.content] : [];
  if (content.length > 1 && isEmptyParagraph(content[content.length - 1])) {
    content.pop();
  }

  return {
    ...normalizedDoc,
    ...(content.length > 0 ? { content } : {}),
  };
}

export function createPapyroTiptapExtensions({
  codeBlockNodeViewRenderer = null,
}: PapyroTiptapExtensionOptions = {}): AnyExtension[] {
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
    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),
    TrailingNode.configure({
      node: "paragraph",
      notAfter: ["paragraph"],
    }),
    UniqueID.configure({
      types: [...PAPYRO_UNIQUE_ID_NODE_TYPES],
    }),
    UiState,
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

export function createPapyroMarkdownManager({
  extensions,
}: PapyroMarkdownManagerOptions = {}): MarkdownManager {
  return new MarkdownManager({
    extensions: extensions ?? createPapyroTiptapExtensions(),
    indentation: {
      style: "space",
      size: 2,
    },
  });
}

export function parseTiptapMarkdown(
  markdown: unknown,
  manager: PapyroMarkdownParser = createPapyroMarkdownManager(),
): JSONContent {
  return manager.parse(String(markdown ?? ""));
}

export function serializeTiptapMarkdown(
  doc: JSONContent,
  manager: PapyroMarkdownSerializer = createPapyroMarkdownManager(),
): string {
  return manager.serialize(preparePapyroMarkdownDoc(doc));
}

export function roundTripTiptapMarkdown(
  markdown: unknown,
  manager: PapyroMarkdownManager = createPapyroMarkdownManager(),
): PapyroMarkdownRoundTrip {
  const parsed = parseTiptapMarkdown(markdown, manager);
  const serialized = serializeTiptapMarkdown(parsed, manager);

  return {
    parsed,
    serialized,
    reparsed: parseTiptapMarkdown(serialized, manager),
  };
}
