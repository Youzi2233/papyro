#!/usr/bin/env node
import { readFileSync } from "node:fs";

const SOURCE = "apps/desktop/src/main.rs";

const REQUIRED_FILES = [
  ["workspace editor runtime", "assets/editor.js"],
  ["desktop editor runtime", "apps/desktop/assets/editor.js"],
  ["workspace logo", "assets/logo.png"],
  ["desktop logo", "apps/desktop/assets/logo.png"],
  ["workspace favicon", "assets/favicon.ico"],
  ["desktop favicon", "apps/desktop/assets/favicon.ico"],
];

const MIRRORED_FILES = [
  ["assets/editor.js", "apps/desktop/assets/editor.js"],
  ["assets/logo.png", "apps/desktop/assets/logo.png"],
  ["assets/favicon.ico", "apps/desktop/assets/favicon.ico"],
];

const DESKTOP_URL_CONSTANTS = [
  ["FAVICON_SRC", "/assets/favicon.ico"],
  ["BRAND_LOGO_SRC", "/assets/logo.png"],
  ["EDITOR_JS_SRC", "/assets/editor.js"],
];

function main() {
  const failures = [];
  const source = readUtf8(SOURCE, failures);

  checkRequiredFiles(failures);
  checkMirroredFiles(failures);
  checkImageHeaders(failures);
  checkEditorRuntimeBundle(failures);
  checkDesktopSourceUrls(source, failures);

  if (failures.length > 0) {
    console.error("Desktop resource smoke check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Desktop resource smoke check passed.");
}

function checkRequiredFiles(failures) {
  for (const [label, path] of REQUIRED_FILES) {
    const bytes = readBytes(path, failures);
    if (bytes && bytes.length === 0) {
      failures.push(`${label} is empty: ${path}`);
    }
  }
}

function checkMirroredFiles(failures) {
  for (const [source, copy] of MIRRORED_FILES) {
    const sourceBytes = readBytes(source, failures);
    const copyBytes = readBytes(copy, failures);
    if (sourceBytes && copyBytes && !sourceBytes.equals(copyBytes)) {
      failures.push(`${copy} is not in sync with ${source}`);
    }
  }
}

function checkImageHeaders(failures) {
  const png = readBytes("apps/desktop/assets/logo.png", failures);
  if (png && !png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    failures.push("apps/desktop/assets/logo.png is not a valid PNG resource");
  }

  const ico = readBytes("apps/desktop/assets/favicon.ico", failures);
  if (ico && !ico.subarray(0, 4).equals(Buffer.from([0x00, 0x00, 0x01, 0x00]))) {
    failures.push("apps/desktop/assets/favicon.ico is not a valid ICO resource");
  }
}

function checkEditorRuntimeBundle(failures) {
  const bundle = readUtf8("apps/desktop/assets/editor.js", failures);
  if (!bundle) return;

  if (!bundle.includes("papyroEditor")) {
    failures.push("apps/desktop/assets/editor.js does not register the papyroEditor runtime");
  }
}

function checkDesktopSourceUrls(source, failures) {
  if (!source) return;

  for (const [constant, url] of DESKTOP_URL_CONSTANTS) {
    const declaration = new RegExp(
      `const\\s+${constant}:\\s*&str\\s*=\\s*"${escapeRegex(url)}";`,
    );
    if (!declaration.test(source)) {
      failures.push(`${SOURCE} must define ${constant} as the WebView URL ${url}`);
    }
  }

  const forbiddenPatterns = [
    [
      /const\s+(?:FAVICON|BRAND_LOGO_SRC|EDITOR_JS_SRC)\s*:\s*Asset\s*=/,
      "desktop startup resources must not expose Dioxus Asset paths to the WebView",
    ],
    [
      /editor_runtime_head\(&?EDITOR_JS_SRC\.to_string\(\)\)/,
      "editor runtime head must receive /assets/editor.js directly, not a stringified Asset path",
    ],
  ];

  for (const [pattern, message] of forbiddenPatterns) {
    if (pattern.test(source)) {
      failures.push(message);
    }
  }
}

function readUtf8(path, failures) {
  const bytes = readBytes(path, failures);
  return bytes ? bytes.toString("utf8") : null;
}

function readBytes(path, failures) {
  try {
    return readFileSync(path);
  } catch (error) {
    failures.push(`${path} could not be read: ${error.message}`);
    return null;
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

main();
