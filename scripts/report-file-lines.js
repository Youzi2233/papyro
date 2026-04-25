#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = process.cwd();
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

function extensionOf(path) {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index);
}

function normalized(path) {
  return path.split(sep).join("/");
}

function collectFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      if (!excludedDirs.has(entry)) {
        collectFiles(path, files);
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

const files = collectFiles(root)
  .map((file) => ({
    file,
    lines: lineCount(join(root, file)),
  }))
  .sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file));

const topCount = Number.parseInt(process.env.PAPYRO_LINE_REPORT_TOP || "15", 10);
const totalLines = files.reduce((sum, file) => sum + file.lines, 0);

console.log(`Tracked files: ${files.length}`);
console.log(`Tracked lines: ${totalLines}`);
console.log(`Top ${topCount} largest files:`);
for (const item of files.slice(0, topCount)) {
  console.log(`${String(item.lines).padStart(5, " ")}  ${item.file}`);
}
