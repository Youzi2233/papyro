#!/usr/bin/env node
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

const DEFAULT_PATHS = ["crates/ui/src"];
const ARIA_LABEL_TYPO = /\baria_label\s*:/g;

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

  const scanPaths = args.length > 0 ? args : DEFAULT_PATHS;
  const failures = scanRustFiles(scanPaths);

  if (failures.length > 0) {
    console.error("UI accessibility check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("UI accessibility check passed.");
}

function printUsage() {
  console.log(`Usage:
  node scripts/check-ui-a11y.js
  node scripts/check-ui-a11y.js <path>...
  node scripts/check-ui-a11y.js --self-test

Checks Dioxus RSX for accessibility attribute typos that compile but do not
produce the intended DOM attributes.`);
}

function scanRustFiles(paths) {
  const failures = [];
  for (const path of paths) {
    for (const file of rustFiles(path)) {
      failures.push(...scanFile(file));
    }
  }
  return failures;
}

function rustFiles(path) {
  const stat = statSync(path);
  if (stat.isFile()) {
    return extname(path) === ".rs" ? [path] : [];
  }

  const files = [];
  for (const entry of readdirSync(path).sort()) {
    const child = join(path, entry);
    const childStat = statSync(child);
    if (childStat.isDirectory()) {
      files.push(...rustFiles(child));
    } else if (extname(child) === ".rs") {
      files.push(child);
    }
  }
  return files;
}

function scanFile(file) {
  return scanText(readFileSync(file, "utf8")).map(
    (line) => `${file}:${line}: use "aria-label" instead of aria_label`,
  );
}

function scanText(source) {
  const failures = [];
  const lines = source.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (ARIA_LABEL_TYPO.test(line)) {
      failures.push(index + 1);
    }
    ARIA_LABEL_TYPO.lastIndex = 0;
  }
  return failures;
}

function runSelfTest() {
  assert(scanText('span { "aria-label": "Close tab" }').length === 0);
  assert(scanText('span { aria_label: "Close tab" }')[0] === 1);

  const dir = mkdtempSync(join(tmpdir(), "papyro-ui-a11y-"));
  try {
    writeFileSync(join(dir, "good.rs"), 'rsx! { span { "aria-label": "A" } }');
    writeFileSync(join(dir, "bad.rs"), 'rsx! { span { aria_label: "A" } }');
    const failures = scanRustFiles([dir]);
    assert(failures.length === 1);
    assert(failures[0].includes("bad.rs:1"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log("UI accessibility checker self-test passed.");
}

function assert(condition) {
  if (!condition) {
    throw new Error("UI accessibility checker self-test failed");
  }
}

main();
