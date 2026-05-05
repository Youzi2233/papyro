#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { roundTripTiptapMarkdown } from "../js/src/tiptap-markdown.js";

const DEFAULT_FIXTURE = "js/test/fixtures/tiptap-release-smoke.md";

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
  const failures = checkReleaseFixture(readFileSync(fixturePath, "utf8"));

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
  ]);
  expectEqual(failures, "callout content", collectCallouts(parsed), [
    { kind: "NOTE", text: "Callout content should round-trip through Markdown." },
  ]);
  expectEqual(failures, "round-trip document JSON", reparsed, parsed);

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

  console.log("Tiptap release smoke fixture checker self-test passed.");
}

function assert(condition) {
  if (!condition) {
    throw new Error("Tiptap release smoke fixture checker self-test failed");
  }
}

main();
