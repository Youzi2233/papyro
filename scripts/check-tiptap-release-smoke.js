#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Window } from "../js/node_modules/happy-dom/lib/index.js";
import { importBundledModule } from "../js/test/helpers/load-esbuild-module.js";

const {
  parseTiptapMarkdown,
  roundTripTiptapMarkdown,
  serializeTiptapMarkdown,
} = await importBundledModule(new URL("../js/src/tiptap-markdown.ts", import.meta.url));

const DEFAULT_FIXTURE = "js/test/fixtures/tiptap-release-smoke.md";
const RELEASE_SMOKE_DOCS = [
  {
    path: "docs/tiptap-release-smoke.md",
    snippets: [
      "Editor UI Surface Visual Acceptance",
      "Floating toolbar",
      "Link popover",
      "Color popover",
      "Slash menu",
      "Drag handle and block menu",
      "Table handles",
      "Table cell menu",
      "Image controls",
      "Narrow window",
      "Dark/high-contrast themes",
      "node scripts/check-desktop-tiptap-webview-smoke.js",
      "opaque bounded surfaces",
    ],
  },
  {
    path: "docs/zh-CN/tiptap-release-smoke.md",
    snippets: [
      "编辑器 UI Surface 视觉验收",
      "Floating toolbar",
      "Link popover",
      "Color popover",
      "Slash menu",
      "Drag handle 和 block menu",
      "Table handles",
      "Table cell menu",
      "Image controls",
      "窄窗口",
      "暗色/高对比主题",
      "node scripts/check-desktop-tiptap-webview-smoke.js",
      "不透明 bounded surface",
    ],
  },
];

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  if (args.includes("--self-test")) {
    runSelfTest();
    return;
  }

  const unexpectedOption = args.find((arg) => arg.startsWith("-"));
  if (unexpectedOption) {
    console.error(`Unknown option: ${unexpectedOption}`);
    printUsage();
    process.exitCode = 2;
    return;
  }

  const fixturePath = args[0] ?? DEFAULT_FIXTURE;
  const failures = [
    ...checkReleaseFixture(readFileSync(fixturePath, "utf8")),
    ...checkReleaseSmokeDocs(),
  ];

  if (failures.length > 0) {
    console.error("Tiptap release smoke fixture check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Tiptap release smoke fixture check passed.");
}

function printUsage() {
  console.log(`Usage:
  node scripts/check-tiptap-release-smoke.js
  node scripts/check-tiptap-release-smoke.js <fixture.md>
  node scripts/check-tiptap-release-smoke.js --self-test

Checks that the Tiptap release smoke fixture covers the Markdown structures
that must round-trip before manual desktop QA starts.`);
}

function checkReleaseFixture(markdown) {
  const failures = [];
  const { parsed, serialized, reparsed } = roundTripTiptapMarkdown(markdown);
  const nodeTypes = collectNodeTypes(parsed);
  const marks = collectMarks(parsed);

  expectEqual(
    failures,
    "heading levels",
    headings(parsed).map((node) => node.attrs?.level),
    [1, 2, 3, 2],
  );
  expectIncludes(failures, "Chinese paragraph", serialized, "中文输入法测试");
  for (const mark of ["bold", "italic", "code", "strike", "link"]) {
    expectIncludes(failures, `${mark} mark`, marks, mark);
  }
  for (const type of [
    "paragraph",
    "bulletList",
    "orderedList",
    "taskList",
    "taskItem",
    "calloutBlock",
    "codeBlock",
    "table",
    "inlineMath",
    "mathBlock",
    "mermaidBlock",
    "image",
  ]) {
    expectIncludes(failures, `node type ${type}`, nodeTypes, type);
  }
  expectEqual(failures, "task states", collectTaskItems(parsed), [
    { checked: false, text: "Unchecked task" },
    { checked: true, text: "Checked task" },
  ]);
  expectEqual(failures, "table alignments", tableAlignments(parsed), [
    ["left", "right", "center"],
    ["left", "right", "center"],
    ["left", "right", "center"],
  ]);
  expectEqual(failures, "math sources", collectMath(parsed), [
    { type: "inlineMath", source: "a^2 + b^2 = c^2" },
    { type: "mathBlock", source: "\\int_0^1 x^2 dx = \\frac{1}{3}" },
  ]);
  expectEqual(failures, "Mermaid source", collectMermaid(parsed), [
    'flowchart LR\n    source["Source"] --> hybrid["Hybrid"]\n    hybrid --> preview["Preview"]',
  ]);
  expectEqual(failures, "image syntax", collectImages(parsed), [
    { src: "assets/example.png", alt: "Local image" },
  ]);
  expectEqual(failures, "code block language", collectCodeBlocks(parsed), [
    { language: "rust", text: 'fn main() {\n    println!("hello tiptap");\n}' },
    { language: "javascript", text: 'const message = "hello papyro";\nconsole.log(message);' },
    { language: "markdown", text: "# Nested Markdown\n\n- It stays inside the code fence." },
    { language: "plaintext", text: "plain text should not be highlighted" },
    { language: "custom-lang", text: "safe custom language ids should survive" },
    { language: null, text: "language-less fences stay automatic" },
  ]);
  expectEqual(failures, "callout content", collectCallouts(parsed), [
    { kind: "NOTE", text: "Callout content should round-trip through Markdown." },
  ]);
  expectEqual(failures, "round-trip document JSON", reparsed, parsed);
  checkComplexTableFallback(failures);

  return failures;
}

function checkReleaseSmokeDocs() {
  const failures = [];

  for (const doc of RELEASE_SMOKE_DOCS) {
    const source = readFileSync(doc.path, "utf8");
    for (const snippet of doc.snippets) {
      expectIncludes(failures, `${doc.path} release UI acceptance`, source, snippet);
    }
  }

  return failures;
}

function headings(node) {
  const found = [];
  walk(node, (child) => {
    if (child.type === "heading") found.push(child);
  });
  return found;
}

function collectNodeTypes(node) {
  const types = [];
  walk(node, (child) => {
    if (typeof child.type === "string") types.push(child.type);
  });
  return types;
}

function collectMarks(node) {
  const marks = [];
  walk(node, (child) => {
    for (const mark of child.marks ?? []) {
      marks.push(mark.type);
    }
  });
  return marks;
}

function collectTaskItems(node) {
  const tasks = [];
  walk(node, (child) => {
    if (child.type !== "taskItem") return;
    tasks.push({
      checked: child.attrs?.checked ?? false,
      text: plainText(child),
    });
  });
  return tasks;
}

function tableAlignments(node) {
  const tables = [];
  walk(node, (child) => {
    if (child.type !== "table") return;
    tables.push(
      (child.content ?? []).map((row) =>
        (row.content ?? []).map((cell) => cell.attrs?.align ?? null),
      ),
    );
  });
  return tables[0] ?? [];
}

function complexTableCells(node) {
  const complexTables = [];
  walk(node, (child) => {
    if (child.type !== "table") return;
    const rows = (child.content ?? []).map((row) =>
      (row.content ?? []).map((cell) => ({
        type: cell.type,
        align: cell.attrs?.align ?? null,
        backgroundColor: cell.attrs?.backgroundColor ?? null,
        colspan: cell.attrs?.colspan ?? 1,
        text: plainText(cell),
      })),
    );
    if (
      rows.some((row) =>
        row.some((cell) => cell.backgroundColor || cell.colspan > 1),
      )
    ) {
      complexTables.push(rows);
    }
  });
  return complexTables[0] ?? [];
}

function complexTableFixtureDoc() {
  return {
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
}

function checkComplexTableFallback(failures) {
  const windowRef = new Window({ url: "http://localhost/" });
  const previousGlobals = installDomGlobals(windowRef);

  try {
    const serialized = serializeTiptapMarkdown(complexTableFixtureDoc());
    expectIncludes(
      failures,
      "complex table fallback background",
      serialized,
      'data-cell-background="rgba(245, 158, 11, 0.16)"',
    );
    expectIncludes(failures, "complex table fallback colspan", serialized, 'colspan="2"');
    expectEqual(failures, "complex table fallback cells", complexTableCells(parseTiptapMarkdown(serialized)), [
      [
        {
          type: "tableHeader",
          align: "center",
          backgroundColor: "rgba(245, 158, 11, 0.16)",
          colspan: 1,
          text: "Feature",
        },
        {
          type: "tableHeader",
          align: null,
          backgroundColor: null,
          colspan: 1,
          text: "Status",
        },
      ],
      [
        {
          type: "tableCell",
          align: "right",
          backgroundColor: null,
          colspan: 1,
          text: "Source",
        },
        {
          type: "tableCell",
          align: null,
          backgroundColor: "rgba(59, 130, 246, 0.14)",
          colspan: 2,
          text: "Done",
        },
      ],
    ]);
  } finally {
    restoreDomGlobals(previousGlobals);
    windowRef.close?.();
  }
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

function collectMath(node) {
  const math = [];
  walk(node, (child) => {
    if (child.type !== "inlineMath" && child.type !== "mathBlock") return;
    math.push({
      type: child.type,
      source: child.attrs?.source ?? "",
    });
  });
  return math;
}

function collectMermaid(node) {
  const diagrams = [];
  walk(node, (child) => {
    if (child.type === "mermaidBlock") {
      diagrams.push(child.attrs?.source ?? "");
    }
  });
  return diagrams;
}

function collectImages(node) {
  const images = [];
  walk(node, (child) => {
    if (child.type !== "image") return;
    images.push({
      src: child.attrs?.src ?? "",
      alt: child.attrs?.alt ?? "",
    });
  });
  return images;
}

function collectCodeBlocks(node) {
  const codeBlocks = [];
  walk(node, (child) => {
    if (child.type !== "codeBlock") return;
    codeBlocks.push({
      language: child.attrs?.language ?? null,
      text: plainText(child),
    });
  });
  return codeBlocks;
}

function collectCallouts(node) {
  const callouts = [];
  walk(node, (child) => {
    if (child.type !== "calloutBlock") return;
    callouts.push({
      kind: child.attrs?.kind ?? "",
      text: plainText(child),
    });
  });
  return callouts;
}

function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const child of node.content ?? []) {
    walk(child, visit);
  }
}

function plainText(node) {
  if (!node || typeof node !== "object") return "";
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(plainText).join("");
}

function expectIncludes(failures, label, haystack, needle) {
  if (!haystack.includes(needle)) {
    failures.push(`${label} missing ${JSON.stringify(needle)}`);
  }
}

function expectEqual(failures, label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(`${label} changed`);
  }
}

function runSelfTest() {
  const fixture = readFileSync(DEFAULT_FIXTURE, "utf8");
  assert(checkReleaseFixture(fixture).length === 0);

  const missingTable = fixture.replace(/\n\| Name \|[\s\S]*?\| Beta \| 3 \| Draft \|\n/u, "\n");
  assert(checkReleaseFixture(missingTable).some((failure) => failure.includes("node type table")));

  const missingChinese = fixture.replace("中文输入法测试", "IME smoke");
  assert(
    checkReleaseFixture(missingChinese).some((failure) => failure.includes("Chinese paragraph")),
  );
  assert(checkReleaseSmokeDocs().length === 0);

  console.log("Tiptap release smoke fixture checker self-test passed.");
}

function assert(condition) {
  if (!condition) {
    throw new Error("Tiptap release smoke fixture checker self-test failed");
  }
}

main();
