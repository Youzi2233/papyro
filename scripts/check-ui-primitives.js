#!/usr/bin/env node
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize, sep } from "node:path";

const DEFAULT_PATHS = ["crates/ui/src/components", "crates/ui/src/layouts"];
const DEFAULT_EXCLUDED_SEGMENTS = ["components", "primitives"];
const RAW_CONTROL_PATTERN =
  /(?:^|[^\w:])(?<control>button|input|select|textarea)\s*\{/;

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
    console.error("UI primitive usage check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("UI primitive usage check passed.");
}

function printUsage() {
  console.log(`Usage:
  node scripts/check-ui-primitives.js
  node scripts/check-ui-primitives.js <path>...
  node scripts/check-ui-primitives.js --self-test

Checks product UI components for raw Dioxus controls that should be wrapped by
Papyro primitives. The shared primitives folder is intentionally skipped.`);
}

function scanRustFiles(paths) {
  const failures = [];
  for (const path of paths) {
    for (const file of rustFiles(path)) {
      if (isExcludedPrimitivePath(file)) {
        continue;
      }
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

function isExcludedPrimitivePath(file) {
  const segments = normalize(file).split(sep);
  const start = indexOfSubsequence(segments, DEFAULT_EXCLUDED_SEGMENTS);
  return (
    start >= 0 &&
    DEFAULT_EXCLUDED_SEGMENTS.every(
      (segment, index) => segments[start + index] === segment,
    )
  );
}

function indexOfSubsequence(items, subsequence) {
  for (let index = 0; index <= items.length - subsequence.length; index += 1) {
    if (subsequence.every((item, offset) => items[index + offset] === item)) {
      return index;
    }
  }
  return -1;
}

function scanFile(file) {
  return scanText(readFileSync(file, "utf8")).map(
    (failure) => `${file}:${failure.line}: ${failure.message}`,
  );
}

function scanText(source) {
  const failures = [];
  const lines = source.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const match = line.match(RAW_CONTROL_PATTERN);
    if (!match) {
      continue;
    }
    failures.push({
      line: index + 1,
      message: `wrap raw ${match.groups.control} in a UI primitive`,
    });
  }
  return failures;
}

function runSelfTest() {
  assert(scanText('Button { label: "Save".to_string() }').length === 0);
  const rawButtonFailures = scanText(`rsx! {
    button {
      "Save"
    }
  }`);
  assert(rawButtonFailures.length === 1);
  assert(rawButtonFailures[0].line === 2);
  assert(rawButtonFailures[0].message.includes("raw button"));

  const rawInputFailures = scanText(`input {
    r#type: "text",
  }`);
  assert(rawInputFailures.length === 1);
  assert(rawInputFailures[0].message.includes("raw input"));

  const inlineRawButtonFailures = scanText('rsx! { button { "Save" } }');
  assert(inlineRawButtonFailures.length === 1);
  assert(inlineRawButtonFailures[0].line === 1);

  const dir = mkdtempSync(join(tmpdir(), "papyro-ui-primitives-"));
  try {
    const productDir = join(dir, "components", "sidebar");
    const primitiveDir = join(dir, "components", "primitives");
    readdirOrCreate(productDir);
    readdirOrCreate(primitiveDir);
    writeFileSync(
      join(productDir, "bad.rs"),
      `rsx! {
        button { "x" }
      }`,
    );
    writeFileSync(
      join(primitiveDir, "allowed.rs"),
      `rsx! {
        button { "x" }
      }`,
    );
    const failures = scanRustFiles([join(dir, "components")]);
    assert(failures.length === 1);
    assert(failures[0].includes("bad.rs:2"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log("UI primitive usage checker self-test passed.");
}

function readdirOrCreate(path) {
  try {
    readdirSync(path);
  } catch {
    mkdirSync(path, { recursive: true });
  }
}

function assert(condition) {
  if (!condition) {
    throw new Error("UI primitive usage checker self-test failed");
  }
}

main();
