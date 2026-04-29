#!/usr/bin/env node
import { readFileSync } from "node:fs";

const DEFAULT_PATHS = ["assets/main.css", "apps/desktop/assets/main.css"];
const THEMES = [
  { name: "light", selector: ":root" },
  { name: "dark", selector: ':root[data-theme="dark"]' },
  {
    name: "system-dark",
    selector: ':root:not([data-theme="light"]):not([data-theme="dark"])',
  },
];
const CONTRAST_PAIRS = [
  ["--mn-ink", "--mn-bg", 7],
  ["--mn-ink", "--mn-surface", 7],
  ["--mn-ink-2", "--mn-surface", 4.5],
  ["--mn-ink-3", "--mn-surface", 4.5],
  ["--mn-editor-ink", "--mn-editor-bg", 7],
  ["--mn-accent", "--mn-surface", 4.5],
  ["--mn-danger", "--mn-surface", 4.5],
  ["--mn-warning", "--mn-surface", 4.5],
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

  const paths = args.length > 0 ? args : DEFAULT_PATHS;
  const failures = paths.flatMap((path) =>
    checkCssText(readFileSync(path, "utf8")).map((failure) => `${path}: ${failure}`),
  );

  if (failures.length > 0) {
    console.error("UI contrast check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("UI contrast check passed.");
}

function printUsage() {
  console.log(`Usage:
  node scripts/check-ui-contrast.js
  node scripts/check-ui-contrast.js <css-file>...
  node scripts/check-ui-contrast.js --self-test

Checks key Papyro color tokens for minimum text contrast in light and dark
themes.`);
}

function checkCssText(source) {
  const failures = [];
  for (const theme of THEMES) {
    const tokens = parseCustomProperties(ruleBlock(source, theme.selector));
    for (const [foreground, background, minimum] of CONTRAST_PAIRS) {
      const foregroundColor = resolveColor(tokens, foreground);
      const backgroundColor = resolveColor(tokens, background);
      const contrast = contrastRatio(foregroundColor, backgroundColor);
      if (contrast < minimum) {
        failures.push(
          `${theme.name} ${foreground} on ${background} contrast ${contrast.toFixed(
            2,
          )} is below ${minimum}`,
        );
      }
    }
  }
  return failures;
}

function ruleBlock(source, selector) {
  const selectorIndex = source.indexOf(selector);
  if (selectorIndex < 0) {
    throw new Error(`Missing CSS selector ${selector}`);
  }

  const openIndex = source.indexOf("{", selectorIndex);
  if (openIndex < 0) {
    throw new Error(`Missing CSS block for ${selector}`);
  }

  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
    } else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openIndex + 1, index);
      }
    }
  }

  throw new Error(`Unclosed CSS block for ${selector}`);
}

function parseCustomProperties(block) {
  const tokens = new Map();
  const declarationPattern = /(--[\w-]+)\s*:\s*([^;]+);/g;
  for (const match of block.matchAll(declarationPattern)) {
    tokens.set(match[1], match[2].trim());
  }
  return tokens;
}

function resolveColor(tokens, name, seen = new Set()) {
  if (seen.has(name)) {
    throw new Error(`Circular CSS variable reference for ${name}`);
  }

  const value = tokens.get(name);
  if (!value) {
    throw new Error(`Missing CSS variable ${name}`);
  }

  const variable = value.match(/^var\((--[\w-]+)\)$/);
  if (variable) {
    seen.add(name);
    return resolveColor(tokens, variable[1], seen);
  }

  const normalized = normalizeHex(value);
  if (!normalized) {
    throw new Error(`${name} must resolve to a hex color, got ${value}`);
  }
  return normalized;
}

function normalizeHex(value) {
  const hex = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(hex)) {
    return hex;
  }
  if (/^#[0-9a-f]{3}$/.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return null;
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(hex) {
  const [red, green, blue] = [1, 3, 5].map((offset) =>
    channelLuminance(parseInt(hex.slice(offset, offset + 2), 16)),
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function channelLuminance(value) {
  const channel = value / 255;
  return channel <= 0.03928
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function runSelfTest() {
  const passing = `
:root {
  --mn-bg: #ffffff;
  --mn-surface: #ffffff;
  --mn-ink: #111111;
  --mn-ink-2: #333333;
  --mn-ink-3: #555555;
  --mn-editor-bg: #ffffff;
  --mn-editor-ink: var(--mn-ink);
  --mn-accent: #005f5f;
  --mn-danger: #9b2f2f;
  --mn-warning: #815000;
}
:root[data-theme="dark"] {
  --mn-bg: #111111;
  --mn-surface: #181818;
  --mn-ink: #f6f6f6;
  --mn-ink-2: #d6d6d6;
  --mn-ink-3: #b8b8b8;
  --mn-editor-bg: #111111;
  --mn-editor-ink: #f6f6f6;
  --mn-accent: #7dd8d8;
  --mn-danger: #ff9a9a;
  --mn-warning: #e3b66e;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]):not([data-theme="dark"]) {
    --mn-bg: #111111;
    --mn-surface: #181818;
    --mn-ink: #f6f6f6;
    --mn-ink-2: #d6d6d6;
    --mn-ink-3: #b8b8b8;
    --mn-editor-bg: #111111;
    --mn-editor-ink: #f6f6f6;
    --mn-accent: #7dd8d8;
    --mn-danger: #ff9a9a;
    --mn-warning: #e3b66e;
  }
}`;
  assert(checkCssText(passing).length === 0);

  const failing = passing.replace("--mn-ink-3: #555555;", "--mn-ink-3: #cccccc;");
  const failures = checkCssText(failing);
  assert(failures.length === 1);
  assert(failures[0].includes("--mn-ink-3"));

  console.log("UI contrast checker self-test passed.");
}

function assert(condition) {
  if (!condition) {
    throw new Error("UI contrast checker self-test failed");
  }
}

main();
