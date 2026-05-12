import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Editor } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import { Window } from "happy-dom";
import { importBundledModule } from "./helpers/load-esbuild-module.js";

const {
  PAPYRO_UNIQUE_ID_NODE_TYPES,
  createPapyroMarkdownManager,
  createPapyroTiptapExtensions,
  preparePapyroMarkdownDoc,
  parseTiptapMarkdown,
  roundTripTiptapMarkdown,
  serializeTiptapMarkdown,
} = await importBundledModule(
  new URL("../src/tiptap-markdown.js", import.meta.url),
);

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

const releaseSmokeFixture = readFileSync(
  new URL("./fixtures/tiptap-release-smoke.md", import.meta.url),
  "utf8",
);

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
          backgroundColor: cell.attrs?.backgroundColor ?? null,
          colspan: cell.attrs?.colspan ?? 1,
          rowspan: cell.attrs?.rowspan ?? 1,
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

function compactTables(tables) {
  return tables.map((table) =>
    table.map((row) =>
      row.map((cell) => ({
        type: cell.type,
        align: cell.align,
        text: cell.text,
      })),
    ),
  );
}

function installDomGlobals(windowRef) {
  const previous = new Map();
  for (const [name, value] of Object.entries({
    window: windowRef,
    document: windowRef.document,
    navigator: windowRef.navigator,
    HTMLElement: windowRef.HTMLElement,
    Element: windowRef.Element,
    Document: windowRef.Document,
    Node: windowRef.Node,
    DOMParser: windowRef.DOMParser,
    getComputedStyle: windowRef.getComputedStyle.bind(windowRef),
  })) {
    previous.set(name, {
      exists: Object.prototype.hasOwnProperty.call(globalThis, name),
      value: globalThis[name],
    });
    globalThis[name] = value;
  }
  return previous;
}

function restoreDomGlobals(previous) {
  for (const [name, record] of previous.entries()) {
    if (record.exists) {
      globalThis[name] = record.value;
    } else {
      delete globalThis[name];
    }
  }
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

function collectNodeAttrs(node, type, attrs = []) {
  if (!node || typeof node !== "object") return attrs;

  if (node.type === type) {
    attrs.push(node.attrs ?? {});
  }

  for (const child of node.content ?? []) {
    collectNodeAttrs(child, type, attrs);
  }

  return attrs;
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
  assert.deepEqual(compactTables(tables), [
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

test("Tiptap extension chain includes official runtime helpers after StarterKit", () => {
  const extensions = createPapyroTiptapExtensions();
  const names = extensions.map((extension) => extension.name);

  assert.equal(names[0], "starterKit");
  assert.equal(names[1], "nodeRange");
  assert.equal(names[2], "trailingNode");
  assert.equal(names[3], "uniqueID");
  assert.ok(names.includes("codeBlock"));
  assert.ok(names.includes("tableKit"));

  const starterKit = extensions.find((extension) => extension.name === "starterKit");
  assert.equal(starterKit.options?.trailingNode, false);

  const nodeRange = extensions.find((extension) => extension.name === "nodeRange");
  assert.equal(nodeRange.options?.key, "Mod");

  const trailingNode = extensions.find((extension) => extension.name === "trailingNode");
  assert.equal(trailingNode.options?.node, "paragraph");
  assert.deepEqual(trailingNode.options?.notAfter, ["paragraph"]);

  const uniqueID = extensions.find((extension) => extension.name === "uniqueID");
  assert.deepEqual(uniqueID.options?.types, [...PAPYRO_UNIQUE_ID_NODE_TYPES]);
});

test("Tiptap runtime helpers keep node IDs out of persisted Markdown", async () => {
  const windowRef = new Window({ url: "http://localhost/" });
  const previousGlobals = installDomGlobals(windowRef);
  const root = windowRef.document.createElement("div");
  windowRef.document.body.appendChild(root);
  const extensions = createPapyroTiptapExtensions();
  const manager = createPapyroMarkdownManager({ extensions });
  let editor = null;

  try {
    editor = new Editor({
      element: root,
      extensions: [...extensions, Markdown],
      content: "# Stable IDs\n\nBody",
      contentType: "markdown",
      injectCSS: false,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const json = editor.getJSON();
    const headingAttrs = collectNodeAttrs(json, "heading");
    const paragraphAttrs = collectNodeAttrs(json, "paragraph");
    assert.equal(typeof headingAttrs[0]?.id, "string");
    assert.equal(typeof paragraphAttrs[0]?.id, "string");

    const serialized = serializeTiptapMarkdown(json, manager);
    assert.equal(serialized, "# Stable IDs\n\nBody");
    assert.doesNotMatch(serialized, /data-id|[0-9a-f]{8}-[0-9a-f]{4}/i);

    const normalized = preparePapyroMarkdownDoc(json);
    assert.equal(normalized.content.at(-1).type, "paragraph");
    assert.equal(normalized.content.at(-1).content?.[0]?.text, "Body");
    assert.equal(normalized.content.some((node) => node.attrs?.id), false);
  } finally {
    editor?.destroy?.();
    restoreDomGlobals(previousGlobals);
    windowRef.close?.();
  }
});

test("Tiptap release smoke fixture preserves editor-critical block semantics", () => {
  const { parsed, serialized, reparsed } = roundTripTiptapMarkdown(releaseSmokeFixture);
  const nodeTypes = collectNodeTypes(parsed);
  const marks = collectMarks(parsed);
  const tasks = collectTaskItems(parsed);
  const tables = collectTables(parsed);
  const math = collectMath(parsed);
  const mermaid = collectMermaid(parsed);
  const images = collectImages(parsed);
  const codeBlocks = collectCodeBlocks(parsed);
  const callouts = collectCallouts(parsed);

  assert.deepEqual(
    parsed.content
      .filter((node) => node.type === "heading")
      .map((node) => node.attrs.level),
    [1, 2, 3, 2],
  );
  assert.ok(nodeTypes.includes("paragraph"));
  assert.ok(nodeTypes.includes("bulletList"));
  assert.ok(nodeTypes.includes("orderedList"));
  assert.ok(nodeTypes.includes("taskList"));
  assert.ok(nodeTypes.includes("table"));
  assert.ok(nodeTypes.includes("inlineMath"));
  assert.ok(nodeTypes.includes("mathBlock"));
  assert.ok(nodeTypes.includes("mermaidBlock"));
  assert.ok(nodeTypes.includes("image"));
  assert.ok(nodeTypes.includes("calloutBlock"));
  assert.ok(marks.includes("bold"));
  assert.ok(marks.includes("italic"));
  assert.ok(marks.includes("code"));
  assert.ok(marks.includes("strike"));
  assert.ok(marks.includes("link"));
  assert.deepEqual(tasks, [
    { checked: false, text: "Unchecked task" },
    { checked: true, text: "Checked task" },
  ]);
  assert.deepEqual(compactTables(tables), [
    [
      [
        { type: "tableHeader", align: "left", text: "Name" },
        { type: "tableHeader", align: "right", text: "Count" },
        { type: "tableHeader", align: "center", text: "Status" },
      ],
      [
        { type: "tableCell", align: "left", text: "Alpha" },
        { type: "tableCell", align: "right", text: "12" },
        { type: "tableCell", align: "center", text: "Ready" },
      ],
      [
        { type: "tableCell", align: "left", text: "Beta" },
        { type: "tableCell", align: "right", text: "3" },
        { type: "tableCell", align: "center", text: "Draft" },
      ],
    ],
  ]);
  assert.deepEqual(math, [
    { type: "inlineMath", source: "a^2 + b^2 = c^2", singleLine: false },
    { type: "mathBlock", source: "\\int_0^1 x^2 dx = \\frac{1}{3}", singleLine: false },
  ]);
  assert.deepEqual(mermaid, [
    'flowchart LR\n    source["Source"] --> hybrid["Hybrid"]\n    hybrid --> preview["Preview"]',
  ]);
  assert.deepEqual(images, [
    { src: "assets/example.png", alt: "Local image", title: "" },
  ]);
  assert.deepEqual(codeBlocks, [
    {
      language: "rust",
      text: 'fn main() {\n    println!("hello tiptap");\n}',
    },
    {
      language: "javascript",
      text: 'const message = "hello papyro";\nconsole.log(message);',
    },
    {
      language: "markdown",
      text: "# Nested Markdown\n\n- It stays inside the code fence.",
    },
    {
      language: "plaintext",
      text: "plain text should not be highlighted",
    },
    {
      language: "custom-lang",
      text: "safe custom language ids should survive",
    },
    {
      language: null,
      text: "language-less fences stay automatic",
    },
  ]);
  assert.deepEqual(callouts, [
    {
      kind: "NOTE",
      text: "Callout content should round-trip through Markdown.",
    },
  ]);
  assert.deepEqual(reparsed, parsed);
  assert.match(serialized, /^# Tiptap Smoke/m);
  assert.match(serialized, /^### Nested Heading/m);
  assert.match(serialized, /中文输入法测试/);
  assert.match(serialized, /^\| Name  | Count | Status \|/m);
  assert.match(serialized, /^\$\$\n\\int_0\^1 x\^2 dx = \\frac\{1\}\{3\}\n\$\$/m);
  assert.match(serialized, /^```mermaid\nflowchart LR/m);
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

  assert.deepEqual(compactTables(collectTables(parsed)), [
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
  assert.deepEqual(compactTables(collectTables(reparsed)), compactTables(collectTables(parsed)));
});

test("Tiptap Markdown preserves styled table cells through the HTML table fallback", () => {
  const windowRef = new Window({ url: "http://localhost/" });
  const previousGlobals = installDomGlobals(windowRef);

  try {
    const doc = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  attrs: {
                    align: "center",
                    backgroundColor: "rgba(245, 158, 11, 0.16)",
                    colspan: 1,
                    rowspan: 1,
                    colwidth: null,
                  },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Feature" }] }],
                },
                {
                  type: "tableHeader",
                  attrs: {
                    align: null,
                    backgroundColor: null,
                    colspan: 1,
                    rowspan: 1,
                    colwidth: null,
                  },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Status" }] }],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  attrs: {
                    align: "right",
                    backgroundColor: null,
                    colspan: 1,
                    rowspan: 1,
                    colwidth: null,
                  },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Source" }] }],
                },
                {
                  type: "tableCell",
                  attrs: {
                    align: null,
                    backgroundColor: "rgba(59, 130, 246, 0.14)",
                    colspan: 2,
                    rowspan: 1,
                    colwidth: null,
                  },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Done" }] }],
                },
              ],
            },
          ],
        },
      ],
    };

    const serialized = serializeTiptapMarkdown(doc);
    const reparsedTables = collectTables(parseTiptapMarkdown(serialized));

    assert.match(serialized, /^<table><tbody><tr><th /);
    assert.match(serialized, /data-cell-background="rgba\(245, 158, 11, 0\.16\)"/);
    assert.match(serialized, /colspan="2"/);
    assert.deepEqual(reparsedTables, [
      [
        [
          {
            type: "tableHeader",
            align: "center",
            backgroundColor: "rgba(245, 158, 11, 0.16)",
            colspan: 1,
            rowspan: 1,
            text: "Feature",
          },
          {
            type: "tableHeader",
            align: null,
            backgroundColor: null,
            colspan: 1,
            rowspan: 1,
            text: "Status",
          },
        ],
        [
          {
            type: "tableCell",
            align: "right",
            backgroundColor: null,
            colspan: 1,
            rowspan: 1,
            text: "Source",
          },
          {
            type: "tableCell",
            align: null,
            backgroundColor: "rgba(59, 130, 246, 0.14)",
            colspan: 2,
            rowspan: 1,
            text: "Done",
          },
        ],
      ],
    ]);
  } finally {
    restoreDomGlobals(previousGlobals);
    windowRef.close?.();
  }
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
    "",
    "```plaintext",
    "plain text",
    "```",
    "",
    "```custom-lang",
    "safe custom language",
    "```",
    "",
    "```",
    "automatic language",
    "```",
  ].join("\n");
  const { parsed, serialized, reparsed } = roundTripTiptapMarkdown(markdown);

  assert.deepEqual(collectCodeBlocks(parsed), [
    {
      language: "ts",
      text: "const answer: number = 42;\nconsole.log(answer);",
    },
    {
      language: "plaintext",
      text: "plain text",
    },
    {
      language: "custom-lang",
      text: "safe custom language",
    },
    {
      language: null,
      text: "automatic language",
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
