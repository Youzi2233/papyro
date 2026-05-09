#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const STEPS = [
  {
    name: "npm test",
    command: "npm",
    args: ["--prefix", "js", "test"],
    shell: process.platform === "win32",
  },
  {
    name: "npm run build",
    command: "npm",
    args: ["--prefix", "js", "run", "build"],
    shell: process.platform === "win32",
  },
  {
    name: "Markdown style smoke",
    command: process.execPath,
    args: ["scripts/check-markdown-style-smoke.js"],
  },
  {
    name: "Tiptap release smoke",
    command: process.execPath,
    args: ["scripts/check-tiptap-release-smoke.js"],
  },
  {
    name: "Tiptap runtime smoke",
    command: process.execPath,
    args: ["scripts/check-tiptap-runtime-smoke.js"],
  },
  {
    name: "Desktop resource smoke",
    command: process.execPath,
    args: ["scripts/check-desktop-resource-smoke.js"],
  },
];

const BUNDLE_COPIES = [
  ["assets/editor.js", "apps/desktop/assets/editor.js"],
  ["assets/editor.js", "apps/mobile/assets/editor.js"],
];

const TIPTAP_STYLE_MODULES = [
  "tiptap-chrome.css",
  "tiptap-chrome-code.css",
  "tiptap-chrome-base.css",
  "tiptap-chrome-command.css",
  "tiptap-chrome-table.css",
  "tiptap-chrome-block.css",
];

const RUNTIME_STYLE_COPIES = [
  ["assets/styles/markdown.css", "apps/desktop/assets/styles/markdown.css"],
  ["assets/styles/markdown.css", "apps/mobile/assets/styles/markdown.css"],
  ...TIPTAP_STYLE_MODULES.flatMap((file) => [
    [`assets/styles/${file}`, `apps/desktop/assets/styles/${file}`],
    [`assets/styles/${file}`, `apps/mobile/assets/styles/${file}`],
  ]),
];

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  const unexpectedOption = args.find((arg) => arg.startsWith("-"));
  if (unexpectedOption) {
    console.error(`Unknown option: ${unexpectedOption}`);
    printUsage();
    process.exitCode = 2;
    return;
  }

  for (const step of STEPS) {
    runStep(step);
  }

  checkMirroredCopies("editor.js bundle sync", BUNDLE_COPIES);
  checkMirroredCopies("Tiptap runtime style sync", RUNTIME_STYLE_COPIES);
  console.log("Editor Markdown gate passed.");
}

function printUsage() {
  console.log(`Usage:
  node scripts/check-editor-markdown-gate.js

Runs the minimum pre-commit gate for Tiptap/editor/Markdown changes:
JS tests, editor bundle build, Markdown style smoke, Markdown round-trip
smoke, mounted Tiptap runtime smoke, generated bundle sync, and runtime
style mirror sync.`);
}

function runStep({ name, command, args, shell = false }) {
  console.log(`=== ${name} ===`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    shell,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`${name} failed to start: ${result.error.message}`);
    process.exit(result.status ?? 1);
  }

  if (result.status !== 0) {
    console.error(`${name} failed with exit code ${result.status}.`);
    process.exit(result.status ?? 1);
  }
}

function checkMirroredCopies(name, copies) {
  console.log(`=== ${name} ===`);
  for (const [source, copy] of copies) {
    const sourceBytes = readFileSync(source);
    const copyBytes = readFileSync(copy);
    if (!sourceBytes.equals(copyBytes)) {
      console.error(`${source} and ${copy} differ.`);
      process.exit(1);
    }
  }
}

main();
