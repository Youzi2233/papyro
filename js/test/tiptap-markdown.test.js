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
Inline math $e^{i\\pi} + 1 = 0$ remains editable.
![Papyro logo](assets/logo.png "Logo")

> Quote line

> [!NOTE]
> Ship the Tiptap migration in small, tested pieces.

- First item
- Second item

- [ ] Draft task
- [x] Reviewed task

1. Ordered one
2. Ordered two

| Feature | Status |
| --- | :---: |
| Source | Done |
| Table | Next |

$$
x^2 + y^2 = z^2
$$

\`\`\`mermaid
flowchart TD
  A --> B
\`\`\`

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

function collectTaskItems(node, tasks = []) {
  if (!node || typeof node !== "object") return tasks;

  if (node.type === "taskItem") {
    tasks.push({
      checked: node.attrs?.checked ?? false,
      text: node.content?.[0]?.content?.[0]?.text ?? "",
    });
  }

  for (const child of node.content ?? []) {
    collectTaskItems(child, tasks);
  }

  return tasks;
}

function plainText(node) {
  if (!node || typeof node !== "object") return "";
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(plainText).join("");
}

function collectTables(node, tables = []) {
  if (!node || typeof node !== "object") return tables;

  if (node.type === "table") {
    tables.push(
      (node.content ?? []).map((row) =>
        (row.content ?? []).map((cell) => ({
          type: cell.type,
          align: cell.attrs?.align ?? null,
          text: plainText(cell),
        })),
      ),
    );
  }

  for (const child of node.content ?? []) {
    collectTables(child, tables);
  }

  return tables;
}

function collectMath(node, math = []) {
  if (!node || typeof node !== "object") return math;

  if (node.type === "inlineMath" || node.type === "mathBlock") {
    math.push({
      type: node.type,
      source: node.attrs?.source ?? "",
      singleLine: node.attrs?.singleLine ?? false,
    });
  }

  for (const child of node.content ?? []) {
    collectMath(child, math);
  }

  return math;
}

function collectMermaid(node, diagrams = []) {
  if (!node || typeof node !== "object") return diagrams;

  if (node.type === "mermaidBlock") {
    diagrams.push(node.attrs?.source ?? "");
  }

  for (const child of node.content ?? []) {
    collectMermaid(child, diagrams);
  }

  return diagrams;
}

function collectImages(node, images = []) {
  if (!node || typeof node !== "object") return images;

  if (node.type === "image") {
    images.push({
      src: node.attrs?.src ?? "",
      alt: node.attrs?.alt ?? "",
      title: node.attrs?.title ?? "",
    });
  }

  for (const child of node.content ?? []) {
    collectImages(child, images);
  }

  return images;
}

function collectCodeBlocks(node, codeBlocks = []) {
  if (!node || typeof node !== "object") return codeBlocks;

  if (node.type === "codeBlock") {
    codeBlocks.push({
      language: node.attrs?.language ?? null,
      text: plainText(node),
    });
  }

  for (const child of node.content ?? []) {
    collectCodeBlocks(child, codeBlocks);
  }

  return codeBlocks;
}

function collectCallouts(node, callouts = []) {
  if (!node || typeof node !== "object") return callouts;

  if (node.type === "calloutBlock") {
    callouts.push({
      kind: node.attrs?.kind ?? "",
      text: plainText(node),
    });
  }

  for (const child of node.content ?? []) {
    collectCallouts(child, callouts);
  }

  return callouts;
}

test("Tiptap Markdown manager parses the baseline Markdown blocks", () => {
  const doc = parseTiptapMarkdown(markdownFixture);
  const nodeTypes = collectNodeTypes(doc);
  const marks = collectMarks(doc);
  const tasks = collectTaskItems(doc);
  const tables = collectTables(doc);
  const math = collectMath(doc);
  const mermaid = collectMermaid(doc);
  const images = collectImages(doc);
  const codeBlocks = collectCodeBlocks(doc);
  const callouts = collectCallouts(doc);

  assert.deepEqual(doc.content.slice(0, 2).map((node) => node.attrs.level), [1, 2]);
  assert.ok(nodeTypes.includes("paragraph"));
  assert.ok(nodeTypes.includes("blockquote"));
  assert.ok(nodeTypes.includes("calloutBlock"));
  assert.ok(nodeTypes.includes("bulletList"));
  assert.ok(nodeTypes.includes("taskList"));
  assert.ok(nodeTypes.includes("taskItem"));
  assert.ok(nodeTypes.includes("orderedList"));
  assert.ok(nodeTypes.includes("table"));
  assert.ok(nodeTypes.includes("tableRow"));
  assert.ok(nodeTypes.includes("tableHeader"));
  assert.ok(nodeTypes.includes("tableCell"));
  assert.ok(nodeTypes.includes("inlineMath"));
  assert.ok(nodeTypes.includes("mathBlock"));
  assert.ok(nodeTypes.includes("mermaidBlock"));
  assert.ok(nodeTypes.includes("image"));
  assert.ok(nodeTypes.includes("codeBlock"));
  assert.ok(marks.includes("bold"));
  assert.ok(marks.includes("italic"));
  assert.ok(marks.includes("code"));
  assert.ok(marks.includes("strike"));
  assert.ok(marks.includes("link"));
  assert.deepEqual(tasks, [
    { checked: false, text: "Draft task" },
    { checked: true, text: "Reviewed task" },
  ]);
  assert.deepEqual(tables, [
    [
      [
        { type: "tableHeader", align: null, text: "Feature" },
        { type: "tableHeader", align: "center", text: "Status" },
      ],
      [
        { type: "tableCell", align: null, text: "Source" },
        { type: "tableCell", align: "center", text: "Done" },
      ],
      [
        { type: "tableCell", align: null, text: "Table" },
        { type: "tableCell", align: "center", text: "Next" },
      ],
    ],
  ]);
  assert.deepEqual(math, [
    { type: "inlineMath", source: "e^{i\\pi} + 1 = 0", singleLine: false },
    { type: "mathBlock", source: "x^2 + y^2 = z^2", singleLine: false },
  ]);
  assert.deepEqual(mermaid, ["flowchart TD\n  A --> B"]);
  assert.deepEqual(images, [
    { src: "assets/logo.png", alt: "Papyro logo", title: "Logo" },
  ]);
  assert.deepEqual(codeBlocks, [
    {
      language: "rust",
      text: 'fn main() {\n  println!("hi");\n}',
    },
  ]);
  assert.deepEqual(callouts, [
    {
      kind: "NOTE",
      text: "Ship the Tiptap migration in small, tested pieces.",
    },
  ]);
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
  assert.match(output, /\$e\^\{i\\pi\} \+ 1 = 0\$/);
  assert.match(output, /!\[Papyro logo\]\(assets\/logo\.png "Logo"\)/);
  assert.match(output, /^> Quote line/m);
  assert.match(
    output,
    /^> \[!NOTE\]\n> Ship the Tiptap migration in small, tested pieces\./m,
  );
  assert.match(output, /^- First item/m);
  assert.match(output, /^- \[ \] Draft task/m);
  assert.match(output, /^- \[x\] Reviewed task/m);
  assert.match(output, /^1\. Ordered one/m);
  assert.match(output, /^\| Feature | Status \|/m);
  assert.match(output, /^\| ------- | :------: \|/m);
  assert.match(output, /^\| Source  | Done   \|/m);
  assert.match(output, /^\$\$\nx\^2 \+ y\^2 = z\^2\n\$\$/m);
  assert.match(output, /^```mermaid\nflowchart TD\n  A --> B\n```/m);
  assert.match(output, /^```rust\nfn main\(\) \{/m);
});

test("Tiptap Markdown task lists round trip checked state", () => {
  const markdown = "- [ ] Plan migration\n- [x] Ship source pane";
  const { parsed, serialized, reparsed } = roundTripTiptapMarkdown(markdown);

  assert.deepEqual(collectTaskItems(parsed), [
    { checked: false, text: "Plan migration" },
    { checked: true, text: "Ship source pane" },
  ]);
  assert.equal(serialized, markdown);
  assert.deepEqual(collectTaskItems(reparsed), collectTaskItems(parsed));
});

test("Tiptap Markdown pipe tables round trip headers, cells, and alignment", () => {
  const markdown = [
    "| Feature | Status |",
    "| --- | :---: |",
    "| Source | Done |",
    "| Table | Next |",
  ].join("\n");
  const { parsed, serialized, reparsed } = roundTripTiptapMarkdown(markdown);

  assert.deepEqual(collectTables(parsed), [
    [
      [
        { type: "tableHeader", align: null, text: "Feature" },
        { type: "tableHeader", align: "center", text: "Status" },
      ],
      [
        { type: "tableCell", align: null, text: "Source" },
        { type: "tableCell", align: "center", text: "Done" },
      ],
      [
        { type: "tableCell", align: null, text: "Table" },
        { type: "tableCell", align: "center", text: "Next" },
      ],
    ],
  ]);
  assert.match(serialized, /^\| Feature | Status \|/m);
  assert.match(serialized, /^\| ------- | :------: \|/m);
  assert.deepEqual(collectTables(reparsed), collectTables(parsed));
});

test("Tiptap Markdown math round trips inline, display, and single-line syntax", () => {
  const markdown = [
    "Inline $a^2 + b^2 = c^2$ math.",
    "",
    "$$",
    "\\int_0^1 x^2 dx",
    "$$",
    "",
    "$$E = mc^2$$",
  ].join("\n");
  const { parsed, serialized, reparsed } = roundTripTiptapMarkdown(markdown);

  assert.deepEqual(collectMath(parsed), [
    { type: "inlineMath", source: "a^2 + b^2 = c^2", singleLine: false },
    { type: "mathBlock", source: "\\int_0^1 x^2 dx", singleLine: false },
    { type: "mathBlock", source: "E = mc^2", singleLine: true },
  ]);
  assert.match(serialized, /\$a\^2 \+ b\^2 = c\^2\$/);
  assert.match(serialized, /^\$\$\n\\int_0\^1 x\^2 dx\n\$\$/m);
  assert.match(serialized, /^\$\$E = mc\^2\$\$/m);
  assert.deepEqual(collectMath(reparsed), collectMath(parsed));
});

test("Tiptap Markdown Mermaid round trips fenced diagram blocks", () => {
  const markdown = "```mermaid\nflowchart TD\n  Start --> Finish\n```";
  const { parsed, serialized, reparsed } = roundTripTiptapMarkdown(markdown);

  assert.deepEqual(collectMermaid(parsed), ["flowchart TD\n  Start --> Finish"]);
  assert.equal(serialized, markdown);
  assert.deepEqual(collectMermaid(reparsed), collectMermaid(parsed));
});

test("Tiptap Markdown images round trip local URLs, alt text, and titles", () => {
  const markdown = '![Pasted image](../assets/pasted image.png "Screenshot")';
  const { parsed, serialized, reparsed } = roundTripTiptapMarkdown(markdown);

  assert.deepEqual(collectImages(parsed), [
    {
      src: "../assets/pasted image.png",
      alt: "Pasted image",
      title: "Screenshot",
    },
  ]);
  assert.equal(serialized, markdown);
  assert.deepEqual(collectImages(reparsed), collectImages(parsed));
});

test("Tiptap Markdown code blocks round trip language metadata and text", () => {
  const markdown = [
    "```ts",
    "const answer: number = 42;",
    "console.log(answer);",
    "```",
  ].join("\n");
  const { parsed, serialized, reparsed } = roundTripTiptapMarkdown(markdown);

  assert.deepEqual(collectCodeBlocks(parsed), [
    {
      language: "ts",
      text: "const answer: number = 42;\nconsole.log(answer);",
    },
  ]);
  assert.equal(serialized, markdown);
  assert.deepEqual(collectCodeBlocks(reparsed), collectCodeBlocks(parsed));
});

test("Tiptap Markdown callouts round trip as Markdown admonitions", () => {
  const markdown = [
    "> [!WARNING]",
    "> Confirm migrations with automated checks.",
    "> Keep Markdown files portable.",
  ].join("\n");
  const { parsed, serialized, reparsed } = roundTripTiptapMarkdown(markdown);

  assert.deepEqual(collectCallouts(parsed), [
    {
      kind: "WARNING",
      text: "Confirm migrations with automated checks.\nKeep Markdown files portable.",
    },
  ]);
  assert.equal(serialized, markdown);
  assert.deepEqual(collectCallouts(reparsed), collectCallouts(parsed));
});

test("Tiptap Markdown round trip is stable at the document JSON level", () => {
  const { parsed, serialized, reparsed } = roundTripTiptapMarkdown(markdownFixture);

  assert.equal(serialized.endsWith("\n"), false);
  assert.deepEqual(reparsed, parsed);
});
