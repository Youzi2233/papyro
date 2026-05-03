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
import { extname, join, relative, sep } from "node:path";

const DEFAULT_PATHS = [
  "assets/main.css",
  "assets/styles/markdown.css",
  "apps/desktop/assets/main.css",
  "apps/desktop/assets/styles/markdown.css",
  "apps/mobile/assets/main.css",
  "js/src/editor-theme.js",
  "crates/ui/src",
];
const COLOR_PATTERN = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|color-mix\([^)]*\)/g;
const SPACING_PATTERN =
  /\b(?:padding|margin|gap|row-gap|column-gap|border-radius|width|height|min-width|max-width|min-height|max-height)\s*:\s*([^;]+);/g;
const SELECTOR_PATTERN = /^\s*([^@{}][^{]+)\s*\{/gm;
const COMPONENT_SELECTOR_PATTERN = /\.mn-[A-Za-z0-9_-]+/g;
const EXCLUDED_DIRS = new Set([".git", "node_modules", "target"]);
const SCANNED_EXTENSIONS = new Set([".css", ".js", ".rs"]);

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

  const strict = args.includes("--strict");
  const paths = args.filter((arg) => arg !== "--strict");
  const scanPaths = paths.length > 0 ? paths : DEFAULT_PATHS;
  const report = analyzePaths(scanPaths);

  printReport(report);
  if (strict && report.risks.length > 0) {
    process.exitCode = 1;
  }
}

function printUsage() {
  console.log(`Usage:
  node scripts/report-ui-tokens.js
  node scripts/report-ui-tokens.js <path>...
  node scripts/report-ui-tokens.js --strict
  node scripts/report-ui-tokens.js --self-test

Reports raw color values, one-off spacing values, and repeated component
selectors so UI redesign work can migrate toward CSS tokens and primitives.
The default mode reports only. --strict exits with code 1 when risks exist.`);
}

function analyzePaths(paths) {
  const files = paths.flatMap((path) => collectFiles(path));
  const colorFindings = [];
  const spacingFindings = [];
  const selectorCounts = new Map();

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    colorFindings.push(...findRawColors(file, source));
    spacingFindings.push(...findSpacing(file, source));
    for (const selector of componentSelectors(source)) {
      selectorCounts.set(selector, (selectorCounts.get(selector) ?? 0) + 1);
    }
  }

  const repeatedSelectors = [...selectorCounts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([selector, count]) => ({ selector, count }));

  const riskyColors = colorFindings.filter((finding) => finding.risk !== "allowed");
  const riskySpacing = spacingFindings.filter((finding) => finding.risk !== "allowed");

  return {
    files,
    colorFindings,
    spacingFindings,
    repeatedSelectors,
    risks: [...riskyColors, ...riskySpacing],
  };
}

function collectFiles(path) {
  const stat = statSync(path);
  if (stat.isFile()) {
    return SCANNED_EXTENSIONS.has(extname(path)) ? [path] : [];
  }

  const files = [];
  for (const entry of readdirSync(path).sort()) {
    if (EXCLUDED_DIRS.has(entry)) continue;
    const child = join(path, entry);
    const childStat = statSync(child);
    if (childStat.isDirectory()) {
      files.push(...collectFiles(child));
    } else if (SCANNED_EXTENSIONS.has(extname(child))) {
      files.push(child);
    }
  }
  return files;
}

function findRawColors(file, source) {
  const findings = [];
  for (const [lineIndex, line] of source.split(/\r?\n/).entries()) {
    for (const match of line.matchAll(COLOR_PATTERN)) {
      findings.push({
        kind: "color",
        file: normalized(file),
        line: lineIndex + 1,
        value: match[0],
        risk: colorRisk(file, line),
      });
    }
  }
  return findings;
}

function colorRisk(file, line) {
  if (isCssThemeLine(line)) {
    return "allowed";
  }
  if (normalized(file).endsWith("js/src/editor-theme.js") && line.includes("var(")) {
    return "fallback";
  }
  if (line.includes("DEFAULT_TAG_COLOR") || line.includes("normalized_tag_color")) {
    return "data";
  }
  return "component";
}

function isCssThemeLine(line) {
  return /^\s*--mn-[\w-]+\s*:/.test(line);
}

function findSpacing(file, source) {
  const findings = [];
  for (const [lineIndex, line] of source.split(/\r?\n/).entries()) {
    for (const match of line.matchAll(SPACING_PATTERN)) {
      const value = match[1].trim();
      if (!containsLiteralLength(value)) continue;
      findings.push({
        kind: "spacing",
        file: normalized(file),
        line: lineIndex + 1,
        value: `${match[0].split(":")[0]}: ${value}`,
        risk: spacingRisk(line, value),
      });
    }
  }
  return findings;
}

function containsLiteralLength(value) {
  if (value.includes("var(") || value.includes("calc(")) return false;
  return /(?:^|\s)-?\d*\.?\d+(?:px|rem|em|vh|vw|%)\b/.test(value);
}

function spacingRisk(line, value) {
  if (/^\s*--mn-[\w-]+\s*:/.test(line)) {
    return "allowed";
  }
  if (/^(0|0\s+0|100%|100vh|100vw|1px|auto)$/.test(value)) {
    return "allowed";
  }
  return "component";
}

function componentSelectors(source) {
  const selectors = [];
  for (const match of source.matchAll(SELECTOR_PATTERN)) {
    const selectorText = match[1];
    for (const selectorMatch of selectorText.matchAll(COMPONENT_SELECTOR_PATTERN)) {
      selectors.push(selectorMatch[0]);
    }
  }
  return selectors;
}

function printReport(report) {
  const colorSummary = summarizeByRisk(report.colorFindings);
  const spacingSummary = summarizeByRisk(report.spacingFindings);

  console.log(`Scanned files: ${report.files.length}`);
  console.log(`Raw color values: ${report.colorFindings.length}`);
  printSummary(colorSummary);
  console.log(`Literal spacing values: ${report.spacingFindings.length}`);
  printSummary(spacingSummary);

  printTop("Top raw color risks", report.colorFindings.filter((item) => item.risk !== "allowed"));
  printTop(
    "Top spacing risks",
    report.spacingFindings.filter((item) => item.risk !== "allowed"),
  );

  if (report.repeatedSelectors.length > 0) {
    console.log("\nRepeated component selectors:");
    for (const item of report.repeatedSelectors.slice(0, 20)) {
      console.log(`  ${String(item.count).padStart(3, " ")}  ${item.selector}`);
    }
  }

  if (report.risks.length === 0) {
    console.log("\nUI token audit found no migration risks.");
  } else {
    console.log(`\nUI token audit found ${report.risks.length} migration risks.`);
  }
}

function summarizeByRisk(findings) {
  const summary = new Map();
  for (const finding of findings) {
    summary.set(finding.risk, (summary.get(finding.risk) ?? 0) + 1);
  }
  return [...summary.entries()].sort((left, right) => right[1] - left[1]);
}

function printSummary(summary) {
  if (summary.length === 0) {
    console.log("  none");
    return;
  }
  for (const [risk, count] of summary) {
    console.log(`  ${risk}: ${count}`);
  }
}

function printTop(title, findings) {
  if (findings.length === 0) return;
  console.log(`\n${title}:`);
  for (const finding of findings.slice(0, 20)) {
    console.log(`  ${finding.file}:${finding.line}  ${finding.risk}  ${finding.value}`);
  }
}

function normalized(path) {
  return path.split(sep).join("/");
}

function runSelfTest() {
  const root = mkdtempSync(join(tmpdir(), "papyro-ui-token-report-"));

  try {
    mkdirSync(join(root, "assets"), { recursive: true });
    const css = `
:root {
  --mn-bg: #ffffff;
  --mn-shadow: 0 1px 2px rgba(0, 0, 0, .12);
}
.mn-button { color: #123456; padding: 7px 9px; }
.mn-button:hover { color: var(--mn-bg); }
.mn-button:focus-visible { outline: 1px solid currentColor; }
`;
    writeFileSync(join(root, "assets", "main.css"), css, "utf8");
    const report = analyzePaths([join(root, "assets")]);
    assert(report.colorFindings.length === 3);
    assert(report.colorFindings.filter((item) => item.risk === "allowed").length === 2);
    assert(report.colorFindings.some((item) => item.risk === "component"));
    assert(report.spacingFindings.some((item) => item.risk === "component"));
    assert(report.repeatedSelectors.some((item) => item.selector === ".mn-button"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  console.log("UI token report self-test passed.");
}

function assert(condition) {
  if (!condition) {
    throw new Error("UI token report self-test failed");
  }
}

main();
