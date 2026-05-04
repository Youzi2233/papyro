import test from "node:test";
import assert from "node:assert/strict";

import {
  createPapyroMarkdownManager,
  parseTiptapMarkdown,
  roundTripTiptapMarkdown,
  serializeTiptapMarkdown,
} from "../src/tiptap-markdown.js";

const markdownFixture = `# Papyro Guide

## 编辑器运行时

Papyro 支持本地 Markdown 笔记，也要稳定处理中文内容。

A paragraph with **bold**, *italic*, \`inline code\`, ~~strike~~, and [docs](https://example.com).

> Quote line

- First item
- Second item

1. Ordered one
2. Ordered two

\`\`\`rust
fn main() {
  println!("hi");
}
\`\`\`
`;

function collectNodeTypes(node, types = []) {
  if (!node || typeof node !== "object") return types;

  if (typeof node.type === "string") {
    types.push(node.type);
  }

  for (const child of node.content ?? []) {
    collectNodeTypes(child, types);
  }

  return types;
}

function collectMarks(node, marks = []) {
  if (!node || typeof node !== "object") return marks;

  for (const mark of node.marks ?? []) {
    marks.push(mark.type);
  }

  for (const child of node.content ?? []) {
    collectMarks(child, marks);
  }

  return marks;
}

test("Tiptap Markdown manager parses the baseline Markdown blocks", () => {
  const doc = parseTiptapMarkdown(markdownFixture);
  const nodeTypes = collectNodeTypes(doc);
  const marks = collectMarks(doc);

  assert.deepEqual(doc.content.slice(0, 2).map((node) => node.attrs.level), [1, 2]);
  assert.ok(nodeTypes.includes("paragraph"));
  assert.ok(nodeTypes.includes("blockquote"));
  assert.ok(nodeTypes.includes("bulletList"));
  assert.ok(nodeTypes.includes("orderedList"));
  assert.ok(nodeTypes.includes("codeBlock"));
  assert.ok(marks.includes("bold"));
  assert.ok(marks.includes("italic"));
  assert.ok(marks.includes("code"));
  assert.ok(marks.includes("strike"));
  assert.ok(marks.includes("link"));
});

test("Tiptap Markdown serialization keeps semantic Markdown output", () => {
  const manager = createPapyroMarkdownManager();
  const output = serializeTiptapMarkdown(parseTiptapMarkdown(markdownFixture, manager), manager);

  assert.match(output, /^# Papyro Guide/m);
  assert.match(output, /^## 编辑器运行时/m);
  assert.match(output, /Papyro 支持本地 Markdown 笔记/);
  assert.match(output, /\*\*bold\*\*/);
  assert.match(output, /\*italic\*/);
  assert.match(output, /`inline code`/);
  assert.match(output, /~~strike~~/);
  assert.match(output, /\[docs\]\(https:\/\/example\.com\)/);
  assert.match(output, /^> Quote line/m);
  assert.match(output, /^- First item/m);
  assert.match(output, /^1\. Ordered one/m);
  assert.match(output, /^```rust\nfn main\(\) \{/m);
});

test("Tiptap Markdown round trip is stable at the document JSON level", () => {
  const { parsed, serialized, reparsed } = roundTripTiptapMarkdown(markdownFixture);

  assert.equal(serialized.endsWith("\n"), false);
  assert.deepEqual(reparsed, parsed);
});
