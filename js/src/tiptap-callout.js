import { mergeAttributes, Node } from "@tiptap/core";

import { normalizeCalloutKind } from "./tiptap-markdown-snippets.js";

const CALLOUT_TOKEN = "calloutBlock";
const CALLOUT_KIND_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/iu;

function calloutKindFromMarker(marker) {
  const match = /^\s*\[!([a-z][a-z0-9_-]{0,31})\]\s*$/iu.exec(String(marker ?? ""));
  return match ? normalizeCalloutKind(match[1]) : "";
}

function readBlockquoteLine(source, offset) {
  if (offset >= source.length) return null;

  const lineEnd = source.indexOf("\n", offset);
  const end = lineEnd < 0 ? source.length : lineEnd;
  const rawLine = source.slice(offset, end);
  const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
  const match = /^(?: {0,3})> ?(.*)$/u.exec(line);
  if (!match) return null;

  return {
    text: match[1],
    nextOffset: lineEnd < 0 ? end : end + 1,
  };
}

function readCalloutBlock(source) {
  const text = String(source ?? "");
  const firstLine = readBlockquoteLine(text, 0);
  if (!firstLine) return null;

  const kind = calloutKindFromMarker(firstLine.text);
  if (!kind) return null;

  const bodyLines = [];
  let offset = firstLine.nextOffset;
  while (offset < text.length) {
    const line = readBlockquoteLine(text, offset);
    if (!line) break;
    bodyLines.push(line.text);
    offset = line.nextOffset;
  }

  const body = bodyLines.join("\n").trim();
  return {
    kind,
    body,
    raw: text.slice(0, offset),
  };
}

export function tokenizeCalloutBlock(source, _tokens, lexer) {
  const parsed = readCalloutBlock(source);
  if (!parsed) return undefined;

  return {
    type: CALLOUT_TOKEN,
    raw: parsed.raw,
    kind: parsed.kind,
    text: parsed.body,
    tokens: parsed.body ? lexer.blockTokens(parsed.body) : [],
  };
}

export const PapyroCalloutBlock = Node.create({
  name: "calloutBlock",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      kind: {
        default: "NOTE",
        parseHTML: (element) => normalizeCalloutKind(element.getAttribute("data-callout-kind")),
        renderHTML: (attributes) => ({
          "data-callout-kind": normalizeCalloutKind(attributes.kind).toLowerCase(),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'aside[data-mn-callout="block"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const kind = normalizeCalloutKind(node.attrs.kind);
    return [
      "aside",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-mn-callout": "block",
        "data-callout-kind": kind.toLowerCase(),
        class: "mn-tiptap-callout",
      }),
      ["div", { class: "mn-tiptap-callout-header", contenteditable: "false" }, ["span", { class: "mn-tiptap-callout-badge" }, kind]],
      ["div", { class: "mn-tiptap-callout-content" }, 0],
    ];
  },

  markdownTokenName: CALLOUT_TOKEN,

  markdownTokenizer: {
    name: CALLOUT_TOKEN,
    level: "block",
    start: (source) => {
      const match = /(^|\n) {0,3}> ?\[![a-z][a-z0-9_-]{0,31}\]/iu.exec(String(source ?? ""));
      return match ? match.index + match[1].length : -1;
    },
    tokenize: tokenizeCalloutBlock,
  },

  parseMarkdown: (token, helpers) => {
    const kind = normalizeCalloutKind(token.kind);
    if (!CALLOUT_KIND_PATTERN.test(kind)) return null;

    const content = token.tokens?.length
      ? helpers.parseBlockChildren?.(token.tokens) ?? helpers.parseChildren(token.tokens)
      : [helpers.createNode("paragraph", {}, [])];

    return helpers.createNode("calloutBlock", { kind }, content);
  },

  renderMarkdown: (node, helpers) => {
    const kind = normalizeCalloutKind(node.attrs?.kind);
    const content = Array.isArray(node.content) ? helpers.renderChildren(node.content, "\n") : "";
    const lines = content.trim() ? content.split("\n") : ["Callout text"];

    return [`> [!${kind}]`, ...lines.map((line) => (line.trim() ? `> ${line}` : ">"))].join("\n");
  },

  addCommands() {
    return {
      setCalloutBlock:
        (attributes = {}) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              kind: normalizeCalloutKind(attributes.kind),
            },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: String(attributes.text ?? "Callout text") }],
              },
            ],
          }),
    };
  },
});

export function createPapyroCalloutExtensions() {
  return [PapyroCalloutBlock];
}
