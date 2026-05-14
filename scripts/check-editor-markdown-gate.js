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
    retries: process.platform === "win32" ? 2 : 0,
    retryDelayMs: 2_000,
  },
  {
    name: "Markdown style smoke",
    command: process.execPath,
    args: ["scripts/check-markdown-style-smoke.js"],
  },
  {
    name: "Tiptap theme bridge",
    command: process.execPath,
    args: ["scripts/check-tiptap-theme-bridge.js"],
  },
  {
    name: "UI accessibility",
    command: process.execPath,
    args: ["scripts/check-ui-a11y.js"],
  },
  {
    name: "UI contrast",
    command: process.execPath,
    args: ["scripts/check-ui-contrast.js"],
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
  {
    name: "Desktop Tiptap WebView smoke",
    command: process.execPath,
    args: ["scripts/check-desktop-tiptap-webview-smoke.js"],
    optional: true,
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
  "tiptap-chrome-papyro.css",
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
smoke, mounted Tiptap runtime smoke, UI accessibility/contrast checks,
generated bundle sync, and runtime style mirror sync.`);
}

function runStep({
  name,
  command,
  args,
  shell = false,
  optional = false,
  retries = 0,
  retryDelayMs = 0,
}) {
  if (optional && process.env.PAPYRO_DESKTOP_WEBVIEW_SMOKE !== "1") {
    console.log(`=== ${name} (skipped) ===`);
    console.log(`Set PAPYRO_DESKTOP_WEBVIEW_SMOKE=1 to run this desktop-only gate.`);
    return;
  }

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    console.log(`=== ${name}${attempt > 0 ? ` (retry ${attempt}/${retries})` : ""} ===`);
    const result = spawnSync(command, args, {
      cwd: process.cwd(),
      env: process.env,
      shell,
      stdio: "inherit",
    });

    if (!result.error && result.status === 0) {
      return;
    }

    if (result.error) {
      console.error(`${name} failed to start: ${result.error.message}`);
      process.exit(result.status ?? 1);
    }

    if (attempt < retries) {
      console.error(`${name} failed with exit code ${result.status}; retrying.`);
      sleep(retryDelayMs);
      continue;
    }

    console.error(`${name} failed with exit code ${result.status}.`);
    process.exit(result.status ?? 1);
  }
}

function sleep(ms) {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
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
