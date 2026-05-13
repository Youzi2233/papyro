import { Window } from "happy-dom";

import { installPapyroEditorRuntime } from "./editor-runtime-bootstrap.ts";
import { createPapyroTiptapRuntimeAdapter } from "./editor-runtime-defaults.ts";
import {
  createPapyroMarkdownManager,
  createPapyroTiptapExtensions,
  preparePapyroMarkdownDoc,
  serializeTiptapMarkdown,
} from "./tiptap-markdown.js";

export async function checkTiptapRuntimeSmoke(markdown) {
  const failures = [];
  const windowRef = new Window({ url: "http://localhost/" });
  const previousGlobals = installDomGlobals(windowRef);
  const container = windowRef.document.createElement("div");
  container.id = "editor-root";
  windowRef.document.body.appendChild(container);

  const extensions = createPapyroTiptapExtensions();
  const markdownManager = createPapyroMarkdownManager({ extensions });
  let editor = null;

  try {
    const runtime = createPapyroTiptapRuntimeAdapter({
      dom: {
        document: windowRef.document,
      },
      navigation: createSmokeNavigation(),
    });
    const facade = installPapyroEditorRuntime(windowRef, {
      adapters: {
        tiptap: runtime,
      },
    });
    const dioxusMessages = [];

    checkRuntimeFacade(failures, facade);
    editor = facade.ensureEditor({
      tabId: "tab-a",
      containerId: "editor-root",
      instanceId: "smoke-a",
      initialContent: markdown,
      viewMode: "hybrid",
    });
    facade.attachChannel("tab-a", {
      send: (message) => dioxusMessages.push(message),
    });
    facade.handleRustMessage("tab-a", {
      type: "set_preferences",
      language: "Chinese",
      auto_link_paste: false,
    });
    await flushRuntime(windowRef);

    await checkRuntimeBridge(failures, facade, container, editor, dioxusMessages, windowRef);
    checkMountedEditor(failures, editor);
    checkReactIsland(failures, container);
    checkRenderedDom(failures, container);
    checkCodeBlockChrome(failures, container);
    checkRoundTrip(failures, editor, markdownManager);
    checkRegistryLifecycle(failures, facade, container);
    await flushRuntime(windowRef);
    checkComplexTableRuntime(failures, facade, container);
    await flushRuntime(windowRef);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    windowRef.papyroEditor?.handleRustMessage?.("tab-a", {
      type: "destroy",
      instance_id: "smoke-a",
    });
    await flushRuntime(windowRef);
    restoreDomGlobals(previousGlobals);
    windowRef.close?.();
  }

  return failures;
}

async function flushRuntime(windowRef) {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await windowRef.happyDOM?.waitUntilComplete?.();
}

function installDomGlobals(windowRef) {
  const previous = new Map();
  const install = {
    window: windowRef,
    self: windowRef,
    document: windowRef.document,
    navigator: windowRef.navigator,
    HTMLElement: windowRef.HTMLElement,
    HTMLButtonElement: windowRef.HTMLButtonElement,
    HTMLDivElement: windowRef.HTMLDivElement,
    HTMLTableElement: windowRef.HTMLTableElement,
    HTMLTableRowElement: windowRef.HTMLTableRowElement,
    HTMLTableCellElement: windowRef.HTMLTableCellElement,
    Element: windowRef.Element,
    Document: windowRef.Document,
    Node: windowRef.Node,
    DOMParser: windowRef.DOMParser,
    MutationObserver: windowRef.MutationObserver,
    getComputedStyle: windowRef.getComputedStyle.bind(windowRef),
    requestAnimationFrame: (callback) => setTimeout(() => callback(Date.now()), 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    innerHeight: 900,
    innerWidth: 1200,
  };

  if (!windowRef.ResizeObserver) {
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    windowRef.ResizeObserver = ResizeObserver;
    install.ResizeObserver = ResizeObserver;
  }

  if (!windowRef.DOMRect) {
    class DOMRect {
      constructor(x = 0, y = 0, width = 0, height = 0) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.top = y;
        this.left = x;
        this.right = x + width;
        this.bottom = y + height;
      }

      static fromRect(rect = {}) {
        return new DOMRect(
          rect.x ?? 0,
          rect.y ?? 0,
          rect.width ?? 0,
          rect.height ?? 0,
        );
      }
    }
    windowRef.DOMRect = DOMRect;
    install.DOMRect = DOMRect;
  }

  for (const [name, value] of Object.entries(install)) {
    previous.set(name, {
      exists: Object.prototype.hasOwnProperty.call(globalThis, name),
      value: globalThis[name],
    });
    globalThis[name] = value;
  }

  return previous;
}

function restoreDomGlobals(previous) {
  for (const [name, record] of previous.entries()) {
    if (record.exists) {
      globalThis[name] = record.value;
    } else {
      delete globalThis[name];
    }
  }
}

function createSmokeNavigation() {
  return {
    attachPreviewScroll: () => false,
    navigateOutline: () => false,
    syncOutline: () => false,
    scrollEditorToLine: () => false,
    scrollPreviewToHeading: () => false,
    renderPreviewMermaid: () => false,
    renderPreviewMath: () => false,
  };
}

function checkRuntimeFacade(failures, facade) {
  const descriptor = facade?.describe?.();
  if (!Object.isFrozen(facade)) {
    failures.push("runtime facade is not frozen");
  }
  if (descriptor?.name !== "papyro.editor") {
    failures.push("runtime facade descriptor has the wrong name");
  }
  if (descriptor?.runtimeKind !== "tiptap") {
    failures.push("runtime facade did not select the Tiptap adapter");
  }
  if (!descriptor?.methods?.includes?.("handleRustMessage")) {
    failures.push("runtime facade descriptor is missing handleRustMessage");
  }
}

async function checkRuntimeBridge(failures, facade, container, editor, dioxusMessages, windowRef) {
  if (container.firstElementChild?.dataset?.tabId !== "tab-a") {
    failures.push("runtime did not mount a tab-routed root");
  }
  if (container.firstElementChild?.dataset?.language !== "Chinese") {
    failures.push("runtime did not apply Rust language preferences");
  }
  if (editor?.isDestroyed) {
    failures.push("runtime editor is destroyed immediately after facade mount");
  }

  const previousMode = container.firstElementChild?.dataset?.viewMode;
  facade.handleRustMessage("tab-a", {
    type: "set_view_mode",
    mode: "source",
  });
  await flushRuntime(windowRef);

  if (previousMode !== "hybrid" || container.firstElementChild?.dataset?.viewMode !== "source") {
    failures.push("runtime bridge did not apply set_view_mode");
  }

  facade.handleRustMessage("tab-a", { type: "focus" });
  if (windowRef.document.activeElement !== container.querySelector("textarea")) {
    failures.push("runtime bridge did not route focus to the source pane");
  }

  facade.handleRustMessage("tab-a", {
    type: "set_view_mode",
    mode: "hybrid",
  });
  await flushRuntime(windowRef);
}

function checkMountedEditor(failures, editor) {
  if (!editor?.view) {
    failures.push("editor view is not available after mount");
    return;
  }

  if (!editor.view.dom?.classList?.contains("ProseMirror")) {
    failures.push("editor view DOM is missing ProseMirror root class");
  }

  if (!editor.view.dom?.classList?.contains("tiptap")) {
    failures.push("editor view DOM is missing the official Tiptap root class");
  }

  if (editor.isDestroyed) {
    failures.push("editor is destroyed immediately after mount");
  }
}

function checkReactIsland(failures, container) {
  if (!container.querySelector?.(".mn-tiptap-react-root")) {
    failures.push("React editor island did not mount");
  }
}

function checkRenderedDom(failures, dom) {
  if (!dom) return;

  const expectedSelectors = [
    ["h1", "heading"],
    ["h2", "second-level heading"],
    [".mn-tiptap-code-block, pre", "code block"],
    [".mn-tiptap-table, table", "table"],
    [".mn-tiptap-task-list, ul[data-type='taskList']", "task list"],
    [".mn-tiptap-callout, aside[data-mn-callout='block']", "callout"],
    [".mn-tiptap-math-block, div[data-mn-math='block']", "math block"],
    [".mn-tiptap-mermaid-block, div[data-mn-mermaid='block']", "Mermaid block"],
    [".mn-tiptap-image, img", "image"],
  ];

  for (const [selector, label] of expectedSelectors) {
    if (!dom.querySelector?.(selector)) {
      failures.push(`rendered DOM is missing ${label}`);
    }
  }
}

function checkCodeBlockChrome(failures, dom) {
  if (!dom) return;

  const codeBlock = dom.querySelector?.(".mn-tiptap-code-block, pre");
  if (!codeBlock) return;

  const languageButton = codeBlock.querySelector?.(".mn-tiptap-code-language-button");
  if (!languageButton) {
    failures.push("code block language control did not mount");
  }

  if (codeBlock.dataset?.codeLanguage !== "rust") {
    failures.push("code block language chrome did not expose rust");
  }

  if (codeBlock.dataset?.codeLanguageHighlighted !== "rust") {
    failures.push("code block highlighted language did not expose rust");
  }

  const code = codeBlock.querySelector?.("code");
  const className = String(code?.className ?? "");
  if (!className.includes("hljs") || !className.includes("language-rust")) {
    failures.push("code block DOM is missing lowlight language classes");
  }

  if ((codeBlock.querySelectorAll?.("[class*='hljs-']")?.length ?? 0) === 0) {
    failures.push("code block DOM is missing highlighted token spans");
  }
}

function checkRegistryLifecycle(failures, facade, container) {
  const firstEditor = facade.ensureEditor({
    tabId: "tab-b",
    containerId: "editor-root",
    instanceId: "smoke-b-1",
    initialContent: "# Registry lifecycle",
    viewMode: "hybrid",
  });
  const reusedEditor = facade.ensureEditor({
    tabId: "tab-b",
    containerId: "editor-root",
    instanceId: "smoke-b-2",
    viewMode: "preview",
  });

  if (firstEditor !== reusedEditor) {
    failures.push("runtime registry did not reuse an existing tab editor");
  }
  if (container.firstElementChild?.dataset?.viewMode !== "preview") {
    failures.push("runtime registry reuse did not update view mode");
  }

  const destroyResult = facade.handleRustMessage("tab-b", {
    type: "destroy",
    instance_id: "smoke-b-2",
  });
  if (destroyResult !== "destroyed") {
    failures.push("runtime registry destroy did not return destroyed");
  }
  if (!firstEditor.isDestroyed) {
    failures.push("runtime registry destroy did not destroy the editor");
  }

  facade.ensureEditor({
    tabId: "tab-a",
    containerId: "editor-root",
    instanceId: "smoke-a",
    viewMode: "hybrid",
  });
}

function checkRoundTrip(failures, editor, markdownManager) {
  const serialized = serializeTiptapMarkdown(editor.getJSON(), markdownManager);
  const reparsed = markdownManager.parse(serialized);
  const editorJson = preparePapyroMarkdownDoc(editor.getJSON());

  if (stableStringify(reparsed) !== stableStringify(editorJson)) {
    failures.push("mounted editor JSON changed after Markdown round-trip");
  }

  const codeBlock = findNode(editorJson, "codeBlock");
  if (codeBlock?.attrs?.language !== "rust") {
    failures.push("code block language did not survive mounted parse");
  }

  const table = findNode(editorJson, "table");
  if (!table) {
    failures.push("table did not survive mounted parse");
  }

}

function stableStringify(value) {
  return JSON.stringify(sortJson(value));
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;

  const entries = Object.keys(value)
      .sort()
      .flatMap((key) => {
        if (key === "rel" && value[key] === "noopener noreferrer nofollow") return [];
        if (key === "target" && (value[key] === null || value[key] === "_blank")) return [];
        if (key === "class" && value[key] === null) return [];
        if (key === "start" && value[key] === 1) return [];
        if ((key === "colspan" || key === "rowspan") && value[key] === 1) return [];
        if (value[key] === null || value[key] === undefined) return [];
        const sortedValue = sortJson(value[key]);
        if (
          sortedValue &&
          typeof sortedValue === "object" &&
          !Array.isArray(sortedValue) &&
          Object.keys(sortedValue).length === 0
        ) {
          return [];
        }
        return [[key, sortedValue]];
      });

  return Object.fromEntries(entries);
}

function findNode(node, type) {
  if (!node || typeof node !== "object") return null;
  if (node.type === type) return node;
  for (const child of node.content ?? []) {
    const found = findNode(child, type);
    if (found) return found;
  }
  return null;
}

function findComplexTable(node) {
  let found = null;
  walkJson(node, (child) => {
    if (found || child?.type !== "table") return;
    const rows = child.content ?? [];
    const complex = rows.some((row) =>
      (row.content ?? []).some((cell) => {
        const attrs = cell.attrs ?? {};
        return attrs.backgroundColor || Number(attrs.colspan ?? 1) > 1;
      }),
    );
    if (complex) found = child;
  });
  return found;
}

function checkComplexTableRuntime(failures, facade, container) {
  let editor = null;

  try {
    editor = facade.ensureEditor({
      tabId: "tab-complex-table",
      containerId: "editor-root",
      instanceId: "smoke-table",
      initialContent:
        '<table><tbody><tr><th data-cell-background="rgba(245, 158, 11, 0.16)" style="text-align: center; background-color: rgba(245, 158, 11, 0.16)">Feature</th><th>Status</th></tr><tr><td style="text-align: right">Source</td><td data-cell-background="rgba(59, 130, 246, 0.14)" colspan="2" style="background-color: rgba(59, 130, 246, 0.14)">Done</td></tr></tbody></table>',
      viewMode: "hybrid",
    });
    const complexTable = findComplexTable(editor.getJSON());
    if (!complexTable) {
      failures.push("complex table attributes did not survive mounted HTML parse");
    }
    if (!container.querySelector?.(".mn-tiptap-runtime[data-tab-id='tab-complex-table']")) {
      failures.push("complex table runtime did not route through the facade");
    }
  } catch (error) {
    failures.push(`complex table runtime smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    facade.handleRustMessage("tab-complex-table", {
      type: "destroy",
      instance_id: "smoke-table",
    });
  }
}

function walkJson(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const child of node.content ?? []) {
    walkJson(child, visit);
  }
}
