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
import { join, relative, sep } from "node:path";

const DEFAULT_TOP_COUNT = 15;
const DEFAULT_FILE_LINE_LIMIT = 2500;
const WARNING_RATIO = 0.8;

const includedExtensions = new Set([
  ".css",
  ".js",
  ".md",
  ".rs",
  ".toml",
]);
const excludedDirs = new Set([
  ".git",
  "node_modules",
  "target",
]);
const generatedFiles = new Set([
  "assets/editor.js",
  "apps/desktop/assets/editor.js",
  "apps/mobile/assets/editor.js",
]);

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

  const topCount = parsePositiveInteger(
    process.env.PAPYRO_LINE_REPORT_TOP,
    DEFAULT_TOP_COUNT,
    "PAPYRO_LINE_REPORT_TOP",
  );
  const lineLimit = parsePositiveInteger(
    process.env.PAPYRO_FILE_LINE_LIMIT,
    DEFAULT_FILE_LINE_LIMIT,
    "PAPYRO_FILE_LINE_LIMIT",
  );

  if (topCount === null || lineLimit === null) {
    process.exitCode = 2;
    return;
  }

  const files = analyzeFiles(process.cwd());
  const result = validateLineBudget(files, lineLimit);

  printReport(files, topCount, lineLimit, result);
  process.exitCode = result.errors.length > 0 ? 1 : 0;
}

function printUsage() {
  console.log(`Usage:
  node scripts/report-file-lines.js
  node scripts/report-file-lines.js --self-test

Environment:
  PAPYRO_LINE_REPORT_TOP     Number of largest files to print. Default: ${DEFAULT_TOP_COUNT}
  PAPYRO_FILE_LINE_LIMIT     Max non-generated lines per tracked file. Default: ${DEFAULT_FILE_LINE_LIMIT}

The script tracks .css, .js, .md, .rs, and .toml files while excluding generated
editor bundles, target, node_modules, and .git.`);
}

function parsePositiveInteger(value, fallback, name) {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || String(parsed) !== value) {
    console.error(`${name} must be a positive integer.`);
    return null;
  }

  return parsed;
}

function analyzeFiles(root) {
  return collectFiles(root, root)
    .map((file) => ({
      file,
      lines: lineCount(join(root, file)),
    }))
    .sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file));
}

function extensionOf(path) {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index);
}

function normalized(path) {
  return path.split(sep).join("/");
}

function collectFiles(root, dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      if (!excludedDirs.has(entry)) {
        collectFiles(root, path, files);
      }
      continue;
    }

    const rel = normalized(relative(root, path));
    if (generatedFiles.has(rel)) continue;
    if (!includedExtensions.has(extensionOf(entry))) continue;

    files.push(rel);
  }

  return files;
}

function lineCount(path) {
  const content = readFileSync(path, "utf8");
  if (content.length === 0) return 0;
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines.length;
}

function validateLineBudget(files, lineLimit) {
  const warningLimit = Math.floor(lineLimit * WARNING_RATIO);
  return {
    warnings: files.filter(
      (item) => item.lines >= warningLimit && item.lines <= lineLimit,
    ),
    errors: files.filter((item) => item.lines > lineLimit),
  };
}

function printReport(files, topCount, lineLimit, result) {
  const totalLines = files.reduce((sum, file) => sum + file.lines, 0);

  console.log(`Tracked files: ${files.length}`);
  console.log(`Tracked lines: ${totalLines}`);
  console.log(`File line budget: ${lineLimit}`);
  console.log(`Top ${topCount} largest files:`);
  for (const item of files.slice(0, topCount)) {
    console.log(formatItem(item));
  }

  if (result.warnings.length > 0) {
    console.log("\nFiles near the line budget:");
    for (const item of result.warnings) {
      console.log(formatItem(item));
    }
  }

  if (result.errors.length > 0) {
    console.error("\nFile line budget failed:");
    for (const item of result.errors) {
      console.error(`${formatItem(item)} exceeds ${lineLimit}`);
    }
    return;
  }

  console.log("\nFile line budget passed.");
}

function formatItem(item) {
  return `${String(item.lines).padStart(5, " ")}  ${item.file}`;
}

function runSelfTest() {
  const root = mkdtempSync(join(tmpdir(), "papyro-line-report-"));

  try {
    writeFileSync(join(root, "small.rs"), "one\ntwo\n", "utf8");
    writeFileSync(join(root, "large.rs"), "1\n2\n3\n4\n5\n", "utf8");
    writeFileSync(join(root, "ignored.txt"), "not tracked\n", "utf8");

    mkdirSync(join(root, ".git"));
    writeFileSync(join(root, ".git", "ignored.rs"), "1\n2\n3\n4\n5\n6\n", "utf8");

    mkdirSync(join(root, "assets"));
    writeFileSync(join(root, "assets", "editor.js"), "1\n2\n3\n4\n5\n6\n", "utf8");

    const files = analyzeFiles(root);
    assert(
      files.map((item) => item.file).join(",") === "large.rs,small.rs",
      "tracks expected files and skips generated or excluded paths",
    );

    assert(
      validateLineBudget(files, 5).errors.length === 0,
      "accepts files at the line limit",
    );
    assert(
      validateLineBudget(files, 4).errors.some((item) => item.file === "large.rs"),
      "fails files over the line limit",
    );

    console.log("File line report self-test passed.");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function assert(condition, message) {
  if (!condition) {
    console.error(`File line report self-test failed: ${message}`);
    process.exitCode = 1;
    throw new Error(message);
  }
}

main();
