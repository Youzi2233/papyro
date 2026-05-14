#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "../js/node_modules/ws/wrapper.mjs";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const DEFAULT_FIXTURE = "js/test/fixtures/tiptap-release-smoke.md";
const DEFAULT_TIMEOUT_MS = 120_000;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const fixturePath = resolve(repoRoot, options.fixture);
  if (!existsSync(fixturePath)) {
    throw new Error(`Fixture does not exist: ${fixturePath}`);
  }

  const port = options.port ?? await freePort();
  const smoke = prepareSmokeWorkspace(fixturePath);
  const child = launchDesktop({
    port,
    appDataDir: smoke.appDataDir,
    workspaceDir: smoke.workspaceDir,
    notePath: smoke.notePath,
  });

  try {
    const client = await connectToWebView(port, options.timeoutMs);
    try {
      await runWebViewChecks(client, {
        noteTitle: basename(smoke.notePath),
      });
    } finally {
      await client.close();
    }
  } finally {
    await stopProcess(child);
    rmSync(smoke.root, { recursive: true, force: true });
  }

  console.log("Desktop Tiptap WebView smoke check passed.");
}

function parseArgs(args) {
  const options = {
    fixture: DEFAULT_FIXTURE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    port: null,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--fixture") {
      options.fixture = requireValue(args, ++index, arg);
    } else if (arg === "--port") {
      options.port = Number.parseInt(requireValue(args, ++index, arg), 10);
      if (!Number.isSafeInteger(options.port) || options.port <= 0) {
        throw new Error("--port must be a positive integer");
      }
    } else if (arg === "--timeout-ms") {
      options.timeoutMs = Number.parseInt(requireValue(args, ++index, arg), 10);
      if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0) {
        throw new Error("--timeout-ms must be a positive integer");
      }
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      options.fixture = arg;
    }
  }

  return options;
}

function requireValue(args, index, option) {
  const value = args[index];
  if (!value || value.startsWith("-")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function printUsage() {
  console.log(`Usage:
  node scripts/check-desktop-tiptap-webview-smoke.js
  node scripts/check-desktop-tiptap-webview-smoke.js --fixture js/test/fixtures/tiptap-release-smoke.md
  node scripts/check-desktop-tiptap-webview-smoke.js --port 9223 --timeout-ms 120000

Launches the real Dioxus desktop shell with an isolated workspace/app-data
directory, connects to WebView2 over the Chrome DevTools Protocol, and verifies
that the Tiptap editor runtime mounts and responds inside the desktop WebView.`);
}

function prepareSmokeWorkspace(fixturePath) {
  const stamp = `${process.pid}-${Date.now()}`;
  const root = resolve(repoRoot, "target", "desktop-tiptap-webview-smoke", stamp);
  const workspaceDir = join(root, "workspace");
  const appDataDir = join(root, "app-data");
  const assetsDir = join(workspaceDir, "assets");
  const notePath = join(workspaceDir, "tiptap-smoke.md");

  mkdirSync(assetsDir, { recursive: true });
  mkdirSync(appDataDir, { recursive: true });
  copyFileSync(fixturePath, notePath);
  writeFileSync(join(assetsDir, "example.png"), tinyPng(), "base64");

  return {
    root,
    workspaceDir,
    appDataDir,
    notePath,
  };
}

function tinyPng() {
  return "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
}

function launchDesktop({ port, appDataDir, workspaceDir, notePath }) {
  const command = process.platform === "win32" ? "cargo.exe" : "cargo";
  const child = spawn(
    command,
    ["run", "-p", "papyro-desktop", "--", notePath],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        PAPYRO_APP_DATA_DIR: appDataDir,
        PAPYRO_WORKSPACE: workspaceDir,
        PAPYRO_WEBVIEW2_ADDITIONAL_BROWSER_ARGS: `--remote-debugging-port=${port}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );

  child.stdout?.on("data", (chunk) => process.stdout.write(prefixLines("desktop", chunk)));
  child.stderr?.on("data", (chunk) => process.stderr.write(prefixLines("desktop", chunk)));

  return child;
}

function prefixLines(label, chunk) {
  return String(chunk)
    .split(/(?<=\n)/u)
    .filter(Boolean)
    .map((line) => `[${label}] ${line}`)
    .join("");
}

async function connectToWebView(port, timeoutMs) {
  const endpoint = `http://127.0.0.1:${port}`;
  const target = await waitFor(async () => {
    const response = await fetch(`${endpoint}/json`);
    if (!response.ok) return null;
    const targets = await response.json();
    return targets.find((candidate) =>
      candidate.type === "page" &&
      typeof candidate.webSocketDebuggerUrl === "string"
    ) ?? null;
  }, {
    label: "WebView2 DevTools page target",
    timeoutMs,
    intervalMs: 500,
  });

  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  await client.send("Runtime.enable");
  await client.send("Page.enable");
  return client;
}

async function runWebViewChecks(client, { noteTitle }) {
  await waitForPageReady(client, noteTitle);
  await assertEvaluate(client, "runtime facade is installed and frozen", () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "papyroEditor");
    return Boolean(
      descriptor &&
      descriptor.writable === false &&
      descriptor.configurable === false &&
      Object.isFrozen(window.papyroEditor) &&
      window.papyroEditor.describe?.().runtimeKind === "tiptap"
    );
  });
  await assertEvaluate(client, "active tab opened the smoke fixture", (title) => {
    return document.querySelector(".mn-tab.active .mn-tab-title")?.textContent?.trim() === title;
  }, noteTitle);
  await assertEvaluate(client, "hybrid Tiptap runtime is mounted", () => {
    return Boolean(
      document.querySelector(".mn-tiptap-runtime[data-view-mode='hybrid']") &&
      document.querySelector(".mn-tiptap-react-root") &&
      document.querySelector(".ProseMirror.tiptap")
    );
  });
  await assertEvaluate(client, "fixture blocks render in the editor", () => {
    const root = document.querySelector(".mn-tiptap-runtime[data-view-mode='hybrid']");
    const selectors = [
      "h1",
      "h2",
      "h3",
      ".mn-tiptap-code-block, pre",
      ".mn-tiptap-table, table",
      ".mn-tiptap-task-list, ul[data-type='taskList']",
      ".mn-tiptap-callout, aside[data-mn-callout='block']",
      ".mn-tiptap-math-block, div[data-mn-math='block']",
      ".mn-tiptap-mermaid-block, div[data-mn-mermaid='block']",
      ".mn-tiptap-image, img",
    ];
    return Boolean(root) && selectors.every((selector) => root.querySelector(selector));
  });

  await exerciseSlashMenu(client);
  await exerciseFloatingToolbar(client);
  await exerciseLinkAndColorPopovers(client);
  await exerciseDragContextMenu(client);
  await exerciseImageControls(client);
  await exerciseTableLayer(client);
  await exerciseSourceMode(client);
  await exercisePreviewMode(client);
}

async function waitForPageReady(client, noteTitle) {
  await waitFor(async () => {
    const result = await evaluate(client, (title) => {
      return Boolean(
        window.papyroEditor &&
        !window.__PAPYRO_EDITOR_LOAD_ERROR__ &&
        document.querySelector(".mn-editor") &&
        document.querySelector(".mn-tab.active .mn-tab-title")?.textContent?.trim() === title &&
        document.querySelector(".mn-tiptap-runtime")
      );
    }, noteTitle);
    return result === true;
  }, {
    label: "desktop editor ready",
    timeoutMs: 90_000,
    intervalMs: 500,
  });
}

async function exerciseSlashMenu(client) {
  await assertEvaluate(client, "slash trigger text is inserted through Tiptap commands", () => {
    const editorDom = document.querySelector(".ProseMirror");
    const editor = editorDom?.editor;
    const view = editor?.view ?? null;
    if (!editorDom || !editor || !view?.state) return false;
    if (!view.state.doc.textBetween(0, view.state.doc.content.size, "\n").includes("End of document.")) {
      return false;
    }
    const json = editor.getJSON?.();
    if (!Array.isArray(json?.content)) return false;
    const content = [
      ...json.content,
      { type: "paragraph", content: [{ type: "text", text: "/" }] },
    ];
    if (editor.commands.setContent({ type: "doc", content }) === false) return false;
    editor.commands.focus("end");

    return view.state.doc.textBetween(0, view.state.doc.content.size, "\n").endsWith("\n/");
  });
  await assertEventually(client, "slash command menu opens", () => {
    return Boolean(
      document.querySelector(".tiptap-suggestion-menu") ||
      document.querySelector(".tiptap-slash-card")
    );
  });
  await assertEvaluate(client, "slash command menu uses an opaque bounded card surface", () => {
    return isOpaqueBoundedSurface(document.querySelector(".tiptap-slash-card"));
  });
  await pressKey(client, "ArrowDown");
  await assertEvaluate(client, "slash command menu keeps a visible active item", () => {
    return Boolean(
      document.querySelector(".tiptap-slash-card [data-active-state='on']") ||
      document.querySelector(".tiptap-slash-card [aria-selected='true']")
    );
  });
  await pressKey(client, "Escape");
  await pressKey(client, "Backspace");
}

async function exerciseFloatingToolbar(client) {
  await assertEvaluate(client, "text selection is created through Tiptap", () => {
    const editorDom = document.querySelector(".ProseMirror");
    const editor = editorDom?.editor;
    if (!editor?.state?.doc || !editor.commands?.setTextSelection) return false;

    const targetText = "This paragraph has";
    const targetParagraph = Array
      .from(editorDom.querySelectorAll("p"))
      .find((paragraph) => paragraph.textContent?.includes(targetText));
    targetParagraph?.scrollIntoView({ block: "center", inline: "nearest" });

    let range = null;
    editor.state.doc.descendants((node, pos) => {
      if (
        range ||
        !node.isTextblock ||
        node.type?.name !== "paragraph" ||
        !node.textContent ||
        !node.textContent.includes(targetText)
      ) {
        return !range;
      }
      const textStart = pos + 1 + node.textContent.indexOf(targetText);
      range = {
        from: textStart,
        to: textStart + Math.min(node.textContent.length, 12),
      };
      return false;
    });

    if (!range || range.to <= range.from) return false;
    if (editor.commands.setTextSelection(range) === false) return false;
    editor.commands.focus();
    return !editor.state.selection.empty &&
      editor.state.selection.from === range.from &&
      editor.state.selection.to === range.to;
  });
  await assertEventually(client, "floating toolbar appears for text selection", () => {
    return Boolean(document.querySelector(".tiptap-toolbar[data-variant='floating']"));
  });
  await assertEvaluate(client, "floating toolbar exposes core Notion-like actions", () => {
    const toolbar = document.querySelector(".tiptap-toolbar[data-variant='floating']");
    if (!toolbar) return false;
    const buttons = Array.from(toolbar.querySelectorAll("button:not(:disabled)"));
    const names = buttons.map((button) => button.getAttribute("aria-label") ?? "");
    return isOpaqueBoundedSurface(toolbar) &&
      names.some((name) => /Turn into/u.test(name)) &&
      names.some((name) => /Bold/u.test(name)) &&
      names.some((name) => /Italic/u.test(name));
  });
  await activateFloatingToolbarButton(client, /More options/u);
  await assertEventually(client, "floating toolbar more options opens", () => {
    const toolbars = Array.from(document.querySelectorAll(".tiptap-toolbar[data-variant='floating']"));
    return toolbars.length > 1 && toolbars.some((toolbar) =>
      Array.from(toolbar.querySelectorAll("button:not(:disabled)")).some((button) =>
        /Align center/u.test(button.getAttribute("aria-label") ?? "")
      )
    );
  });
  await activateFloatingToolbarButton(client, /Align center/u);
  await assertEventually(client, "TextAlign center changes editor DOM", () =>
    Boolean(document.querySelector(".ProseMirror [style*='text-align: center']")),
  );
  await pressKey(client, "Escape");
}

async function exerciseLinkAndColorPopovers(client) {
  await createTextSelection(client);
  await clickFloatingToolbarButton(client, /Link/u);
  await assertEventually(client, "link popover opens with an opaque bounded input surface", () => {
    const popover = document.querySelector(".tiptap-popover");
    const card = popover?.querySelector(".tiptap-card") ?? null;
    const input = popover?.querySelector("input.tiptap-link-input") ?? null;
    const buttons = Array.from(popover?.querySelectorAll("button") ?? []);

    return isOpaqueBoundedSurface(card) &&
      input &&
      input.getBoundingClientRect().width >= 120 &&
      buttons.length >= 3 &&
      buttons.every((button) => button.getBoundingClientRect().height >= 24);
  });
  await pressKey(client, "Escape");

  await createTextSelection(client);
  await activateFloatingToolbarButton(client, /Text color/u);
  await assertEventually(client, "color popover opens with grouped opaque color controls", () => {
    const activeCard = document.activeElement?.closest?.(".tiptap-card") ?? null;
    const card = activeCard || document.querySelector(".tiptap-popover .tiptap-card");
    const labels = Array.from(card?.querySelectorAll(".tiptap-card-group-label") ?? []);
    const groups = Array.from(card?.querySelectorAll(".tiptap-card-item-group") ?? []);
    const buttons = Array.from(card?.querySelectorAll("button") ?? []);
    const visibleButtons = buttons.filter((button) => {
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

    return isOpaqueBoundedSurface(card) &&
      labels.length >= 2 &&
      groups.length >= 2 &&
      visibleButtons.length >= 6;
  });
  await pressKey(client, "Escape");
}

async function createTextSelection(client) {
  await assertEvaluate(client, "text selection is available for floating surface smoke", () => {
    const editorDom = document.querySelector(".ProseMirror");
    const editor = editorDom?.editor;
    if (!editor?.state?.doc || !editor.commands?.setTextSelection) return false;

    const targetText = "This paragraph has";
    let range = null;
    editor.state.doc.descendants((node, pos) => {
      if (
        range ||
        !node.isTextblock ||
        node.type?.name !== "paragraph" ||
        !node.textContent ||
        !node.textContent.includes(targetText)
      ) {
        return !range;
      }
      const textStart = pos + 1 + node.textContent.indexOf(targetText);
      range = {
        from: textStart,
        to: textStart + Math.min(node.textContent.length, 12),
      };
      return false;
    });

    if (!range || range.to <= range.from) return false;
    editor.commands.setTextSelection(range.from);
    if (editor.commands.setTextSelection(range) === false) return false;
    editor.commands.focus();
    return !editor.state.selection.empty;
  });
  await assertEventually(client, "floating toolbar is available after text selection", () => {
    return Boolean(document.querySelector(".tiptap-toolbar[data-variant='floating']"));
  });
}

async function exerciseDragContextMenu(client) {
  await moveToSelector(client, ".ProseMirror p");
  await assertEventually(client, "drag handle appears on block hover", () => {
    return Boolean(document.querySelector(".drag-handle"));
  });
  await assertEvaluate(client, "drag handle menu trigger activates", () => {
    const handle = document.querySelector(".mn-tiptap-drag-context-menu-handle");
    const buttons = Array.from(handle?.querySelectorAll("button") ?? []);
    const trigger = buttons.find((button) =>
      /options|drag/u.test(button.getAttribute("aria-label") ?? "")
    ) ?? buttons.at(-1);
    if (!trigger) return false;
    trigger.click();
    return true;
  });
  await assertEventually(client, "drag context menu opens with core official actions", () => {
    const menu = Array
      .from(document.querySelectorAll(".tiptap-menu-content:not(.tiptap-table-menu-content)"))
      .find((candidate) => candidate.querySelector(".tiptap-combobox-list"));
    const panel = menu?.querySelector(".tiptap-combobox-list") ?? null;
    const text = panel?.textContent ?? "";
    const labels = Array.from(panel?.querySelectorAll(".tiptap-button-text") ?? []);

    return isOpaqueBoundedSurface(panel) &&
      /Turn Into/i.test(text) &&
      /Duplicate node|Copy to clipboard|Delete/iu.test(text) &&
      labels.every((label) => {
        const style = getComputedStyle(label);
        return style.whiteSpace === "nowrap" &&
          style.overflow === "hidden" &&
          style.textOverflow === "ellipsis";
      });
  });
  await pressKey(client, "Escape");
}

async function exerciseImageControls(client) {
  await assertEvaluate(client, "image node selection is created through Tiptap", () => {
    const editorDom = document.querySelector(".ProseMirror");
    const editor = editorDom?.editor;
    if (!editor?.state?.doc || !editor.commands?.setNodeSelection) return false;

    let imagePos = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type?.name === "image") {
        imagePos = pos;
        return false;
      }
      return true;
    });

    if (imagePos === null) return false;
    if (editor.commands.setNodeSelection(imagePos) === false) return false;
    editor.commands.focus();
    return editor.state.selection?.node?.type?.name === "image";
  });
  await assertEventually(client, "image floating controls expose official image actions", () => {
    const toolbar = document.querySelector(".tiptap-toolbar[data-variant='floating']");
    if (!toolbar || !isOpaqueBoundedSurface(toolbar)) return false;

    const names = Array
      .from(toolbar.querySelectorAll("button"))
      .map((button) => button.getAttribute("aria-label") ?? button.getAttribute("title") ?? button.textContent ?? "");

    return names.some((name) => /Image align left/u.test(name)) &&
      names.some((name) => /Image align center/u.test(name)) &&
      names.some((name) => /Image align right/u.test(name)) &&
      names.some((name) => /Caption/u.test(name)) &&
      names.some((name) => /Download image/u.test(name)) &&
      names.some((name) => /Replace|Add image/u.test(name)) &&
      names.some((name) => /Delete/u.test(name));
  });
  await pressKey(client, "Escape");
}

async function exerciseTableLayer(client) {
  await assertEvaluate(client, "official table layer is present", () => {
    return Boolean(
      document.querySelector(".ProseMirror table") &&
      document.querySelector("[data-content-type='table'] .table-selection-overlay-container")
    );
  });
  await clickSelector(client, ".ProseMirror table td, .ProseMirror table th");
  await assertEventually(client, "official table overlay responds to selection", () => {
    return Boolean(
      document.querySelector(".tiptap-table-selection-overlay") ||
      document.querySelector(".tiptap-table-handle-menu") ||
      document.querySelector(".tiptap-table-extend-row-column-button")
    );
  });
  const resizeBaseline = await evaluate(client, () => {
    const cell = document.querySelector(".ProseMirror table td, .ProseMirror table th");
    if (!cell) return null;
    cell.scrollIntoView({ block: "center", inline: "center" });
    const rect = cell.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const contentChildren = Array
      .from(cell.children)
      .filter((child) => !child.classList.contains("column-resize-handle"));
    return {
      point: {
        x: Math.max(rect.left + 1, rect.right - 2),
        y: rect.top + Math.min(Math.max(rect.height / 2, 1), rect.height - 1),
      },
      height: rect.height,
      contentChildCount: contentChildren.length,
      contentTags: contentChildren.map((child) => child.tagName),
      text: cell.textContent,
    };
  });
  if (!resizeBaseline) {
    throw new Error("Unable to resolve a table cell baseline for resize smoke");
  }
  await movePoint(client, resizeBaseline.point);
  await assertEventually(client, "table column resize handle appears near a cell edge", () => {
    return Boolean(document.querySelector(".ProseMirror table .column-resize-handle"));
  });
  await assertEvaluate(client, "table resize chrome does not inflate cell layout", (baseline) => {
    const cell = document.querySelector(".ProseMirror table td, .ProseMirror table th");
    const handle = cell?.querySelector(":scope > .column-resize-handle");
    const contentChildren = cell
      ? Array.from(cell.children).filter((child) => !child.classList.contains("column-resize-handle"))
      : [];
    const firstContent = contentChildren.at(0) ?? null;
    if (!cell || !handle || !firstContent) {
      throw new Error(JSON.stringify({
        hasCell: Boolean(cell),
        hasHandle: Boolean(handle),
        hasFirstContent: Boolean(firstContent),
        childClasses: cell ? Array.from(cell.children).map((child) => child.className || child.tagName) : [],
      }));
    }

    const cellStyle = getComputedStyle(cell);
    const handleStyle = getComputedStyle(handle);
    const contentStyle = getComputedStyle(firstContent);
    const rect = cell.getBoundingClientRect();
    const contentTags = contentChildren.map((child) => child.tagName);

    const checks = {
      cellPosition: cellStyle.position,
      handlePosition: handleStyle.position,
      handleDisplay: handleStyle.display,
      handleLineHeight: handleStyle.lineHeight,
      handleMinHeight: handleStyle.minHeight,
      handleContain: handleStyle.contain,
      contentTag: firstContent.tagName,
      contentChildCount: contentChildren.length,
      contentTags,
      contentMarginTop: contentStyle.marginTop,
      contentMarginBottom: contentStyle.marginBottom,
      baselineContentChildCount: baseline.contentChildCount,
      baselineContentTags: baseline.contentTags,
      baselineHeight: baseline.height,
      currentHeight: rect.height,
      heightDelta: Math.abs(rect.height - baseline.height),
      textStable: cell.textContent === baseline.text,
    };

    const passed = checks.cellPosition === "relative" &&
      checks.handlePosition === "absolute" &&
      checks.handleDisplay === "block" &&
      checks.handleLineHeight === "0px" &&
      checks.handleMinHeight === "0px" &&
      checks.contentMarginTop === "0px" &&
      checks.contentMarginBottom === "0px" &&
      checks.contentChildCount === checks.baselineContentChildCount &&
      checks.contentTags.join("|") === checks.baselineContentTags.join("|") &&
      checks.textStable &&
      checks.heightDelta < 1;

    if (!passed) {
      throw new Error(JSON.stringify(checks));
    }

    return true;
  }, resizeBaseline);
  await clickSelector(client, ".expandable-menu-button");
  await assertEventually(client, "official table cell menu opens with an opaque bounded surface", () => {
    const root = document.querySelector(".tiptap-menu-content.tiptap-table-menu-content");
    const panel = root?.querySelector(":scope > .tiptap-combobox-list");
    if (!root || !panel) return false;

    const rootStyle = getComputedStyle(root);
    const panelStyle = getComputedStyle(panel);
    const rect = panel.getBoundingClientRect();
    const buttons = Array.from(panel.querySelectorAll(".tiptap-button"));
    const labels = Array.from(panel.querySelectorAll(".tiptap-button-text"));

    return rootStyle.overflow === "visible" &&
      Number.parseInt(rootStyle.zIndex, 10) >= 50 &&
      panelStyle.backgroundColor !== "rgba(0, 0, 0, 0)" &&
      panelStyle.backgroundColor !== "transparent" &&
      panelStyle.overflowX === "hidden" &&
      panelStyle.overflowY === "auto" &&
      rect.width >= 180 &&
      rect.width <= Math.min(288, window.innerWidth - 24) + 1 &&
      rect.height > 32 &&
      buttons.every((button) => getComputedStyle(button).justifyContent === "flex-start") &&
      labels.every((label) => {
        const style = getComputedStyle(label);
        return style.whiteSpace === "nowrap" &&
          style.overflow === "hidden" &&
          style.textOverflow === "ellipsis";
      });
  });
  await pressKey(client, "Escape");
}

async function exerciseSourceMode(client) {
  await setStatusMode(client, "source");
  await assertEventually(client, "source pane is visible", () => {
    const runtime = document.querySelector(".mn-tiptap-runtime[data-view-mode='source']");
    const textarea = document.querySelector(".mn-tiptap-source-pane");
    return Boolean(runtime && textarea && !textarea.hidden && textarea.value.includes("# Tiptap Smoke"));
  });
  await assertEvaluate(client, "source pane edits sync back to Tiptap", () => {
    const textarea = document.querySelector(".mn-tiptap-source-pane");
    if (!textarea) return false;
    textarea.value += "\n\nDesktop WebView smoke marker.";
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
    return textarea.value.includes("Desktop WebView smoke marker.");
  });
  await setStatusMode(client, "hybrid");
  await assertEventually(client, "source edits render in hybrid mode", () => {
    return Boolean(
      document.querySelector(".mn-tiptap-runtime[data-view-mode='hybrid']") &&
      document.querySelector(".ProseMirror")?.textContent?.includes("Desktop WebView smoke marker.")
    );
  });
}

async function exercisePreviewMode(client) {
  await setStatusMode(client, "preview");
  await assertEventually(client, "Rust preview renders desktop content", () => {
    const preview = document.querySelector(".mn-preview");
    return Boolean(
      preview &&
      preview.querySelector("h1") &&
      preview.textContent?.includes("Tiptap Smoke")
    );
  });
  await setStatusMode(client, "hybrid");
}

async function setStatusMode(client, mode) {
  await clickSelector(client, ".mn-status-mode .mn-select-trigger");
  await assertEventually(client, "status mode menu opens", () => {
    return Boolean(document.querySelector(".mn-status-mode .mn-select-menu"));
  });
  await clickStatusModeOption(client, mode);
}

async function moveToSelector(client, selector) {
  const point = await evaluate(client, (targetSelector) => {
    const element = document.querySelector(targetSelector);
    if (!element) return null;
    return pointForElement(element);

    function pointForElement(target) {
      target.scrollIntoView?.({ block: "center", inline: "center" });
      const rect = target.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const left = Math.max(0, Math.min(rect.left, viewportWidth - 1));
      const right = Math.max(1, Math.min(rect.right, viewportWidth));
      const top = Math.max(0, Math.min(rect.top, viewportHeight - 1));
      const bottom = Math.max(1, Math.min(rect.bottom, viewportHeight));
      return {
        x: left + Math.max(1, Math.min((right - left) / 2, right - left - 1)),
        y: top + Math.max(1, Math.min((bottom - top) / 2, bottom - top - 1)),
      };
    }
  }, selector);
  if (!point) {
    throw new Error(`Unable to move to missing selector: ${selector}`);
  }
  await movePoint(client, point);
}

async function clickSelector(client, selector) {
  const point = await evaluate(client, (targetSelector) => {
    const element = document.querySelector(targetSelector);
    if (!element) return null;
    return pointForElement(element);

    function pointForElement(target) {
      target.scrollIntoView?.({ block: "center", inline: "center" });
      const rects = Array.from(target.getClientRects?.() ?? []);
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const rect = rects.find((candidate) =>
        candidate.width > 0 &&
        candidate.height > 0 &&
        candidate.bottom > 0 &&
        candidate.right > 0 &&
        candidate.top < viewportHeight &&
        candidate.left < viewportWidth
      ) ?? target.getBoundingClientRect();
      const left = Math.max(0, Math.min(rect.left, viewportWidth - 1));
      const right = Math.max(1, Math.min(rect.right, viewportWidth));
      const top = Math.max(0, Math.min(rect.top, viewportHeight - 1));
      const bottom = Math.max(1, Math.min(rect.bottom, viewportHeight));
      return {
        x: left + Math.max(1, Math.min((right - left) / 2, right - left - 1)),
        y: top + Math.max(1, Math.min((bottom - top) / 2, bottom - top - 1)),
      };
    }
  }, selector);
  if (!point) {
    throw new Error(`Unable to click missing selector: ${selector}`);
  }
  await clickPoint(client, point);
}

async function clickFloatingToolbarButton(client, labelPatternSource) {
  const point = await evaluate(client, (patternSource) => {
    const pattern = new RegExp(patternSource, "u");
    const toolbars = Array.from(document.querySelectorAll(".tiptap-toolbar[data-variant='floating']"));
    const button = toolbars
      .flatMap((toolbar) => Array.from(toolbar.querySelectorAll("button:not(:disabled)")))
      .find((candidate) => pattern.test(candidate.getAttribute("aria-label") ?? ""));
    if (!button) return null;
    return pointForElement(button);

    function pointForElement(target) {
      target.scrollIntoView?.({ block: "center", inline: "center" });
      const rects = Array.from(target.getClientRects?.() ?? []);
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const rect = rects.find((candidate) =>
        candidate.width > 0 &&
        candidate.height > 0 &&
        candidate.bottom > 0 &&
        candidate.right > 0 &&
        candidate.top < viewportHeight &&
        candidate.left < viewportWidth
      ) ?? target.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const left = Math.max(0, Math.min(rect.left, viewportWidth - 1));
      const right = Math.max(1, Math.min(rect.right, viewportWidth));
      const top = Math.max(0, Math.min(rect.top, viewportHeight - 1));
      const bottom = Math.max(1, Math.min(rect.bottom, viewportHeight));
      return {
        x: left + Math.max(1, Math.min((right - left) / 2, right - left - 1)),
        y: top + Math.max(1, Math.min((bottom - top) / 2, bottom - top - 1)),
      };
    }
  }, labelPatternSource.source);
  if (!point) {
    throw new Error(`Unable to click floating toolbar button: ${labelPatternSource}`);
  }
  await clickPoint(client, point);
}

async function activateFloatingToolbarButton(client, labelPatternSource) {
  const clicked = await evaluate(client, (patternSource) => {
    const pattern = new RegExp(patternSource, "u");
    const toolbars = Array.from(document.querySelectorAll(".tiptap-toolbar[data-variant='floating']"));
    const button = toolbars
      .flatMap((toolbar) => Array.from(toolbar.querySelectorAll("button:not(:disabled)")))
      .find((candidate) => pattern.test(candidate.getAttribute("aria-label") ?? ""));
    if (!button) return false;
    button.scrollIntoView?.({ block: "center", inline: "center" });
    button.click();
    return true;
  }, labelPatternSource.source);
  if (!clicked) {
    throw new Error(`Unable to activate floating toolbar button: ${labelPatternSource}`);
  }
}

async function clickStatusModeOption(client, mode) {
  const point = await evaluate(client, (targetMode) => {
    const options = Array.from(document.querySelectorAll(".mn-status-mode .mn-select-option"));
    const option = options.find((candidate) => {
      const value = candidate.textContent?.toLowerCase() ?? "";
      return value.includes(targetMode);
    }) ?? options.at(targetMode === "source" ? 0 : targetMode === "hybrid" ? 1 : 2);
    if (!option) return null;
    return pointForElement(option);

    function pointForElement(target) {
      target.scrollIntoView?.({ block: "center", inline: "center" });
      const rect = target.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const left = Math.max(0, Math.min(rect.left, viewportWidth - 1));
      const right = Math.max(1, Math.min(rect.right, viewportWidth));
      const top = Math.max(0, Math.min(rect.top, viewportHeight - 1));
      const bottom = Math.max(1, Math.min(rect.bottom, viewportHeight));
      return {
        x: left + Math.max(1, Math.min((right - left) / 2, right - left - 1)),
        y: top + Math.max(1, Math.min((bottom - top) / 2, bottom - top - 1)),
      };
    }
  }, mode);
  if (!point) {
    throw new Error(`Unable to click status mode option: ${mode}`);
  }
  await clickPoint(client, point);
}

async function clickPoint(client, point) {
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
  });
}

async function movePoint(client, point) {
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: point.x,
    y: point.y,
    button: "none",
  });
}

async function pressKey(client, key) {
  await keyCombo(client, key);
}

async function keyCombo(client, code, modifiers = {}) {
  const key = keyForCode(code);
  const params = {
    key,
    code,
    windowsVirtualKeyCode: virtualKeyCode(code, key),
    nativeVirtualKeyCode: virtualKeyCode(code, key),
    modifiers: modifierMask(modifiers),
  };
  await client.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    ...params,
  });
  await client.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    ...params,
  });
}

function keyForCode(code) {
  if (code === "KeyA") return "a";
  if (code === "Enter") return "Enter";
  return code;
}

function virtualKeyCode(code, key) {
  if (code === "KeyA") return 65;
  if (code === "ArrowDown") return 40;
  if (code === "Enter") return 13;
  if (code === "End") return 35;
  if (code === "Escape") return 27;
  if (code === "Backspace") return 8;
  return key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0;
}

function modifierMask({ altKey = false, ctrlKey = false, metaKey = false, shiftKey = false } = {}) {
  return Number(altKey) | (Number(ctrlKey) << 1) | (Number(metaKey) << 2) | (Number(shiftKey) << 3);
}

async function assertEventually(client, label, fn, timeoutMs = 10_000) {
  try {
    await waitFor(async () => {
      try {
        return await evaluate(client, fn);
      } catch {
        return false;
      }
    }, {
      label,
      timeoutMs,
      intervalMs: 250,
    });
  } catch (error) {
    const snapshot = await debugDomSnapshot(client).catch(() => null);
    if (snapshot) {
      throw new Error(`${error.message}\n${snapshot}`);
    }
    throw error;
  }
}

async function debugDomSnapshot(client) {
  return await evaluate(client, () => {
    const selection = window.getSelection?.();
    const anchor = selection?.anchorNode;
    const anchorElement = anchor?.nodeType === Node.ELEMENT_NODE
      ? anchor
      : anchor?.parentElement;
    const menu = document.querySelector(".tiptap-suggestion-menu, .tiptap-slash-card");
    const editor = document.querySelector(".ProseMirror");
    const activeElement = document.activeElement;
    const toolbars = Array.from(document.querySelectorAll(".tiptap-toolbar[data-variant='floating']"));
    const toolbarLabels = toolbars.map((toolbar) =>
      Array.from(toolbar.querySelectorAll("button"))
        .map((button) => button.getAttribute("aria-label") ?? button.textContent?.trim() ?? "")
        .filter(Boolean)
        .join("|")
    ).join(" / ");
    const cards = Array.from(document.querySelectorAll(".tiptap-card"))
      .map((card) => {
        const rect = card.getBoundingClientRect();
        const style = getComputedStyle(card);
        return [
          `card=${card.className}`,
          `rect=${Math.round(rect.width)}x${Math.round(rect.height)}@${Math.round(rect.left)},${Math.round(rect.top)}`,
          `bg=${style.backgroundColor}`,
          `labels=${Array.from(card.querySelectorAll(".tiptap-card-group-label")).map((label) => label.textContent?.trim() ?? "").join("|")}`,
          `groups=${card.querySelectorAll(".tiptap-card-item-group").length}`,
          `buttons=${card.querySelectorAll("button").length}`,
          `text="${(card.textContent ?? "").slice(0, 100)}"`,
        ].join(" ");
      })
      .join("\n");
    const menus = Array.from(document.querySelectorAll(".tiptap-menu-content"))
      .map((content) => {
        const rect = content.getBoundingClientRect();
        const style = getComputedStyle(content);
        const panel = content.querySelector(".tiptap-combobox-list");
        const panelRect = panel?.getBoundingClientRect();
        const panelStyle = panel ? getComputedStyle(panel) : null;
        return [
          `menu=${content.className}`,
          `rect=${Math.round(rect.width)}x${Math.round(rect.height)}@${Math.round(rect.left)},${Math.round(rect.top)}`,
          `bg=${style.backgroundColor}`,
          `panel=${panel ? `${Math.round(panelRect.width)}x${Math.round(panelRect.height)} bg=${panelStyle.backgroundColor}` : "none"}`,
          `labels=${Array.from(content.querySelectorAll(".tiptap-button-text")).map((label) => label.textContent?.trim() ?? "").join("|")}`,
          `text="${(content.textContent ?? "").slice(0, 160)}"`,
        ].join(" ");
      })
      .join("\n");
    return [
      `active=${activeElement?.tagName ?? "none"}.${activeElement?.className ?? ""}`,
      `selection="${selection?.toString?.() ?? ""}"`,
      `anchor=${anchorElement?.tagName ?? "none"}.${anchorElement?.className ?? ""}`,
      `menu=${menu ? `${menu.tagName}.${menu.className}` : "none"}`,
      `toolbars="${toolbarLabels}"`,
      cards,
      menus,
      `editorText="${(editor?.textContent ?? "").slice(-160)}"`,
    ].join("\n");
  });
}

async function assertEvaluate(client, label, fn, ...args) {
  const result = await evaluate(client, fn, ...args);
  if (result !== true) {
    try {
      const snapshot = await debugDomSnapshot(client);
      throw new Error(`${label} failed\n${snapshot}`);
    } catch (error) {
      if (error.message.startsWith(`${label} failed`)) {
        throw error;
      }
      throw new Error(`${label} failed`);
    }
  }
}

async function evaluate(client, fn, ...args) {
  const expression = `(() => {
    const isOpaqueBoundedSurface = ${isOpaqueBoundedSurfaceSource()};
    return (${fn.toString()})(...${JSON.stringify(args)});
  })()`;
  const response = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (response.exceptionDetails) {
    const text = response.exceptionDetails.exception?.description ??
      response.exceptionDetails.text ??
      "evaluation failed";
    throw new Error(text);
  }
  return response.result?.value;
}

function isOpaqueBoundedSurfaceSource() {
  return `(element) => {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const background = style.backgroundColor;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    return rect.width >= 24 &&
      rect.height >= 24 &&
      rect.left >= -1 &&
      rect.top >= -1 &&
      rect.right <= viewportWidth + 1 &&
      rect.bottom <= viewportHeight + 1 &&
      background !== "rgba(0, 0, 0, 0)" &&
      background !== "transparent" &&
      style.visibility !== "hidden" &&
      style.display !== "none";
  }`;
}

async function waitFor(operation, { label, timeoutMs, intervalMs }) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const value = await operation();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(intervalMs);
  }

  const suffix = lastError ? `: ${lastError.message}` : "";
  throw new Error(`Timed out waiting for ${label}${suffix}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (port) {
          resolve(port);
        } else {
          reject(new Error("Unable to allocate a local port"));
        }
      });
    });
  });
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn(
        "taskkill.exe",
        ["/PID", String(child.pid), "/T", "/F"],
        { stdio: "ignore", windowsHide: true },
      );
      killer.on("close", resolve);
      killer.on("error", resolve);
    });
    return;
  }

  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(3000).then(() => child.kill("SIGKILL")),
  ]);
}

class CdpClient {
  #socket;
  #nextId = 1;
  #pending = new Map();

  static connect(url) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.once("open", () => resolve(new CdpClient(socket)));
      socket.once("error", reject);
    });
  }

  constructor(socket) {
    this.#socket = socket;
    socket.on("message", (message) => this.#handleMessage(message));
    socket.on("close", () => this.#rejectAll(new Error("CDP socket closed")));
    socket.on("error", (error) => this.#rejectAll(error));
  }

  send(method, params = {}) {
    const id = this.#nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#socket.send(payload, (error) => {
        if (!error) return;
        this.#pending.delete(id);
        reject(error);
      });
    });
  }

  close() {
    return new Promise((resolve) => {
      if (this.#socket.readyState === WebSocket.CLOSED) {
        resolve();
        return;
      }
      this.#socket.once("close", resolve);
      this.#socket.close();
    });
  }

  #handleMessage(message) {
    const parsed = JSON.parse(String(message));
    if (!parsed.id) return;
    const pending = this.#pending.get(parsed.id);
    if (!pending) return;
    this.#pending.delete(parsed.id);
    if (parsed.error) {
      pending.reject(new Error(parsed.error.message ?? "CDP command failed"));
    } else {
      pending.resolve(parsed.result ?? {});
    }
  }

  #rejectAll(error) {
    for (const pending of this.#pending.values()) {
      pending.reject(error);
    }
    this.#pending.clear();
  }
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
