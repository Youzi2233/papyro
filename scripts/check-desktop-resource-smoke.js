#!/usr/bin/env node
import { readFileSync } from "node:fs";

const DESKTOP_SOURCE = "apps/desktop/src/main.rs";
const MOBILE_SOURCE = "apps/mobile/src/main.rs";
const APP_DESKTOP_SOURCE = "crates/app/src/desktop.rs";
const TOOL_WINDOWS_SOURCE = "crates/app/src/desktop_tool_windows.rs";
const HEADER_SOURCE = "crates/ui/src/components/header/mod.rs";
const SIDEBAR_SOURCE = "crates/ui/src/components/sidebar/mod.rs";
const SETTINGS_SOURCE = "crates/ui/src/components/settings/mod.rs";

const REQUIRED_FILES = [
  ["workspace editor runtime", "assets/editor.js"],
  ["desktop editor runtime", "apps/desktop/assets/editor.js"],
  ["mobile editor runtime", "apps/mobile/assets/editor.js"],
  ["workspace logo", "assets/logo.png"],
  ["desktop logo", "apps/desktop/assets/logo.png"],
  ["mobile logo", "apps/mobile/assets/logo.png"],
  ["workspace favicon", "assets/favicon.ico"],
  ["desktop favicon", "apps/desktop/assets/favicon.ico"],
  ["mobile favicon", "apps/mobile/assets/favicon.ico"],
];

const MIRRORED_FILES = [
  ["assets/editor.js", "apps/desktop/assets/editor.js"],
  ["assets/editor.js", "apps/mobile/assets/editor.js"],
  ["assets/logo.png", "apps/desktop/assets/logo.png"],
  ["assets/logo.png", "apps/mobile/assets/logo.png"],
  ["assets/favicon.ico", "apps/desktop/assets/favicon.ico"],
  ["assets/favicon.ico", "apps/mobile/assets/favicon.ico"],
];

const DESKTOP_URL_CONSTANTS = [
  ["FAVICON_SRC", "/assets/favicon.ico"],
  ["BRAND_LOGO_SRC", "/assets/logo.png"],
  ["EDITOR_JS_SRC", "/assets/editor.js"],
];

const TOOL_WINDOW_URL_CONSTANTS = [
  ["TOOL_WINDOW_FAVICON", "/assets/favicon.ico"],
  ["TOOL_WINDOW_EDITOR_JS_SRC", "/assets/editor.js"],
];

function main() {
  const failures = [];
  const desktopSource = readUtf8(DESKTOP_SOURCE, failures);
  const appDesktopSource = readUtf8(APP_DESKTOP_SOURCE, failures);
  const toolWindowSource = readUtf8(TOOL_WINDOWS_SOURCE, failures);
  const mobileSource = readUtf8(MOBILE_SOURCE, failures);

  checkRequiredFiles(failures);
  checkMirroredFiles(failures);
  checkImageHeaders(failures);
  checkEditorRuntimeBundle(failures);
  checkDesktopSourceUrls(desktopSource, failures);
  checkAppDesktopEmbeddedResources(appDesktopSource, failures);
  checkToolWindowSourceUrls(toolWindowSource, failures);
  checkLogoSurfaceBindings(
    {
      desktopSource,
      appDesktopSource,
      toolWindowSource,
      mobileSource,
      headerSource: readUtf8(HEADER_SOURCE, failures),
      sidebarSource: readUtf8(SIDEBAR_SOURCE, failures),
      settingsSource: readUtf8(SETTINGS_SOURCE, failures),
    },
    failures,
  );

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
  for (const path of ["apps/desktop/assets/logo.png", "apps/mobile/assets/logo.png"]) {
    const png = readBytes(path, failures);
    if (
      png &&
      !png
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
      failures.push(`${path} is not a valid PNG resource`);
    }
  }

  for (const path of ["apps/desktop/assets/favicon.ico", "apps/mobile/assets/favicon.ico"]) {
    const ico = readBytes(path, failures);
    if (ico && !ico.subarray(0, 4).equals(Buffer.from([0x00, 0x00, 0x01, 0x00]))) {
      failures.push(`${path} is not a valid ICO resource`);
    }
  }
}

function checkEditorRuntimeBundle(failures) {
  const bundle = readUtf8("apps/desktop/assets/editor.js", failures);
  if (!bundle) return;

  if (!bundle.includes("papyroEditor")) {
    failures.push("apps/desktop/assets/editor.js does not register the papyroEditor runtime");
  }
  if (!bundle.includes("papyro.editor")) {
    failures.push("apps/desktop/assets/editor.js does not expose the editor facade name");
  }
  if (!bundle.includes("protocolVersion")) {
    failures.push("apps/desktop/assets/editor.js does not expose the editor protocol version");
  }
  if (!bundle.includes("runtimeKind")) {
    failures.push("apps/desktop/assets/editor.js does not expose the editor runtime kind");
  }
  if (!bundle.includes("describe")) {
    failures.push("apps/desktop/assets/editor.js does not expose the editor facade descriptor");
  }
}

function checkDesktopSourceUrls(source, failures) {
  if (!source) return;

  for (const [constant, url] of DESKTOP_URL_CONSTANTS) {
    requireUrlConstant(source, DESKTOP_SOURCE, constant, url, failures);
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

  requireSourcePattern(
    source,
    DESKTOP_SOURCE,
    /use_context_provider\(papyro_app::desktop::desktop_brand_logo_src\);/,
    "desktop root must provide the embedded logo data URL to shared UI components",
    failures,
  );
  requireSourcePattern(
    source,
    DESKTOP_SOURCE,
    /RuntimeAsset\s*\{[\s\S]*?relative_path:\s*"assets\/logo\.png"[\s\S]*?include_bytes!\("\.\.\/assets\/logo\.png"\)/,
    "desktop startup must embed logo.png for runtime asset mirroring",
    failures,
  );
  requireSourcePattern(
    source,
    DESKTOP_SOURCE,
    /RuntimeAsset\s*\{[\s\S]*?relative_path:\s*"assets\/favicon\.ico"[\s\S]*?include_bytes!\("\.\.\/assets\/favicon\.ico"\)/,
    "desktop startup must embed favicon.ico for runtime asset mirroring",
    failures,
  );
  requireSourcePattern(
    source,
    DESKTOP_SOURCE,
    /RuntimeAsset\s*\{[\s\S]*?relative_path:\s*"assets\/editor\.js"[\s\S]*?include_bytes!\("\.\.\/assets\/editor\.js"\)/,
    "desktop startup must embed editor.js for runtime asset mirroring",
    failures,
  );
  requireSourcePattern(
    source,
    DESKTOP_SOURCE,
    /contents_dir\.join\("Resources"\)/,
    "desktop startup must mirror runtime assets to the macOS Contents/Resources directory",
    failures,
  );
  requireSourcePattern(
    source,
    DESKTOP_SOURCE,
    /roots\.push\(exe_dir\.to_path_buf\(\)\)/,
    "desktop startup must keep executable-adjacent assets as a fallback",
    failures,
  );
  requireSourcePattern(
    source,
    DESKTOP_SOURCE,
    /desktop_editor_runtime_head\(\s*EDITOR_JS_SRC\s*,?\s*\)/,
    "desktop startup must use the shared inline editor runtime head",
    failures,
  );
}

function checkAppDesktopEmbeddedResources(source, failures) {
  if (!source) return;

  requireSourcePattern(
    source,
    APP_DESKTOP_SOURCE,
    /include_str!\("\.\.\/\.\.\/\.\.\/assets\/editor\.js"\)/,
    "shared desktop helper must embed the generated editor runtime source",
    failures,
  );
  requireSourcePattern(
    source,
    APP_DESKTOP_SOURCE,
    /include_bytes!\("\.\.\/\.\.\/\.\.\/assets\/logo\.png"\)/,
    "shared desktop helper must embed the logo bytes",
    failures,
  );
  requireSourcePattern(
    source,
    APP_DESKTOP_SOURCE,
    /data:image\/png;base64,/,
    "shared desktop helper must expose the logo as a PNG data URL",
    failures,
  );
  requireSourcePattern(
    source,
    APP_DESKTOP_SOURCE,
    /data-papyro-editor-runtime="inline"/,
    "desktop editor runtime head must inline the editor runtime",
    failures,
  );
  requireSourcePattern(
    source,
    APP_DESKTOP_SOURCE,
    /external-fallback/,
    "desktop editor runtime head must keep /assets/editor.js as an external fallback",
    failures,
  );
  requireSourcePattern(
    source,
    APP_DESKTOP_SOURCE,
    /fn\s+inline_script_body\(/,
    "desktop editor runtime head must escape inline script bodies",
    failures,
  );
  requireSourcePattern(
    source,
    APP_DESKTOP_SOURCE,
    /document\.createElement\("script"\)/,
    "desktop editor runtime fallback must be created after inline registration fails",
    failures,
  );
}

function checkToolWindowSourceUrls(source, failures) {
  if (!source) return;

  for (const [constant, url] of TOOL_WINDOW_URL_CONSTANTS) {
    requireUrlConstant(source, TOOL_WINDOWS_SOURCE, constant, url, failures);
  }

  requireSourcePattern(
    source,
    TOOL_WINDOWS_SOURCE,
    /use_context_provider\(crate::desktop::desktop_brand_logo_src\);/,
    "tool windows must provide the embedded logo data URL to shared UI components",
    failures,
  );
  requireSourcePattern(
    source,
    TOOL_WINDOWS_SOURCE,
    /desktop_editor_runtime_head\(TOOL_WINDOW_EDITOR_JS_SRC\)/,
    "document tool window editor runtime head must use the shared inline helper",
    failures,
  );
  requireSourcePattern(
    source,
    TOOL_WINDOWS_SOURCE,
    /<link rel="icon" href="\{TOOL_WINDOW_FAVICON\}">/,
    "tool windows must use the WebView favicon URL",
    failures,
  );
}

function checkLogoSurfaceBindings(sources, failures) {
  const {
    desktopSource,
    appDesktopSource,
    toolWindowSource,
    mobileSource,
    headerSource,
    sidebarSource,
    settingsSource,
  } = sources;

  if (mobileSource) {
    requireUrlConstant(mobileSource, MOBILE_SOURCE, "BRAND_LOGO_SRC", "/assets/logo.png", failures);
    requireSourcePattern(
      mobileSource,
      MOBILE_SOURCE,
      /use_context_provider\(\|\|\s+BRAND_LOGO_SRC\.to_string\(\)\);/,
      "mobile root must provide the WebView logo URL to shared UI components",
      failures,
    );
  }

  if (headerSource) {
    checkSharedLogoConsumer(headerSource, HEADER_SOURCE, "mn-brand-logo", failures);
  }
  if (sidebarSource) {
    checkSharedLogoConsumer(sidebarSource, SIDEBAR_SOURCE, "mn-sidebar-brand-logo", failures);
  }
  if (settingsSource) {
    requireSourcePattern(
      settingsSource,
      SETTINGS_SOURCE,
      /try_use_context::<String>\(\)\.unwrap_or_else\(\|\|\s+"\/assets\/logo\.png"\.to_string\(\)\)/,
      "settings About logo must fall back to the WebView logo URL",
      failures,
    );
    requireSourcePattern(
      settingsSource,
      SETTINGS_SOURCE,
      /class:\s*"mn-about-logo"[\s\S]*?src:\s*brand_logo_src/,
      "settings About logo must bind to the shared logo URL",
      failures,
    );
  }

  for (const [path, source] of [
    [DESKTOP_SOURCE, desktopSource],
    [APP_DESKTOP_SOURCE, appDesktopSource],
    [TOOL_WINDOWS_SOURCE, toolWindowSource],
    [MOBILE_SOURCE, mobileSource],
    [HEADER_SOURCE, headerSource],
    [SIDEBAR_SOURCE, sidebarSource],
    [SETTINGS_SOURCE, settingsSource],
  ]) {
    if (!source) continue;
    if (/\\assets\\(?:logo\.png|editor\.js|favicon\.ico)/i.test(source)) {
      failures.push(`${path} must not use Windows-style asset paths for WebView resources`);
    }
  }
}

function checkSharedLogoConsumer(source, path, className, failures) {
  requireSourcePattern(
    source,
    path,
    /try_use_context::<String>\(\)\.unwrap_or_else\(\|\|\s+"\/assets\/logo\.png"\.to_string\(\)\)/,
    `${path} must fall back to the WebView logo URL`,
    failures,
  );
  requireSourcePattern(
    source,
    path,
    new RegExp(`class:\\s*"${escapeRegex(className)}"[\\s\\S]*?src:\\s*brand_logo_src`),
    `${path} must bind ${className} to the shared logo URL`,
    failures,
  );
  requireSourcePattern(
    source,
    path,
    /alt:\s*"Papyro logo"/,
    `${path} must keep an accessible Papyro logo label`,
    failures,
  );
}

function requireUrlConstant(source, path, constant, url, failures) {
  const declaration = new RegExp(
    `const\\s+${constant}:\\s*&str\\s*=\\s*"${escapeRegex(url)}";`,
  );
  if (!declaration.test(source)) {
    failures.push(`${path} must define ${constant} as the WebView URL ${url}`);
  }
}

function requireSourcePattern(source, path, pattern, message, failures) {
  if (!pattern.test(source)) {
    failures.push(`${message}: ${path}`);
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
