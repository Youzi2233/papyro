import { Window } from "happy-dom";

import { installPapyroEditorRuntime } from "./editor-runtime-bootstrap.ts";
import { createPapyroTiptapRuntimeAdapter } from "./editor-runtime-defaults.ts";
import {
  createPapyroMarkdownManager,
  createPapyroTiptapExtensions,
  preparePapyroMarkdownDoc,
  serializeTiptapMarkdown,
} from "./tiptap-markdown.ts";

type SmokeFailureList = string[];
type SmokeDataset = Record<string, string | undefined>;
type SmokeClassList = {
  contains?: (value: string) => boolean;
};
type SmokeDomElement = {
  id?: string;
  className?: unknown;
  dataset?: SmokeDataset;
  classList?: SmokeClassList;
  firstElementChild?: SmokeDomElement | null;
  parentElement?: SmokeDomElement | null;
  querySelector?: (selectors: string) => SmokeDomElement | null;
  querySelectorAll?: (selectors: string) => ArrayLike<SmokeDomElement>;
  appendChild?: (child: unknown) => unknown;
};
type SmokeWindow = Window & {
  papyroEditor?: SmokeFacade;
  happyDOM?: {
    waitUntilComplete?: () => Promise<void>;
  };
  ResizeObserver?: typeof ResizeObserver;
};
type SmokeGlobalRecord = {
  exists: boolean;
  value: unknown;
};
type SmokeGlobalRestoreMap = Map<string, SmokeGlobalRecord>;
type SmokeFacade = {
  describe?: () => {
    name?: string;
    runtimeKind?: string;
    methods?: string[];
  };
  ensureEditor: (options: Record<string, unknown>) => SmokeEditor;
  attachChannel: (tabId: string, channel: { send: (message: unknown) => void }) => unknown;
  handleRustMessage: (tabId: string, message: Record<string, unknown>) => unknown;
};
type SmokeRectInit = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};
type SmokeEditor = {
  isDestroyed?: boolean;
  view?: {
    dom?: SmokeDomElement;
  };
  getJSON: () => SmokeJsonNode;
};
type SmokeMarkdownManager = {
  parse: (markdown: string) => SmokeJsonNode;
};
type SmokeJsonNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: SmokeJsonNode[];
  [key: string]: unknown;
};

export async function checkTiptapRuntimeSmoke(markdown: string): Promise<SmokeFailureList> {
  const failures: SmokeFailureList = [];
  const windowRef = new Window({ url: "http://localhost/" }) as SmokeWindow;
  const previousGlobals = installDomGlobals(windowRef);
  const container = windowRef.document.createElement("div") as unknown as SmokeDomElement;
  container.id = "editor-root";
  const appendToBody = windowRef.document.body.appendChild.bind(
    windowRef.document.body,
  ) as unknown as (child: unknown) => unknown;
  appendToBody(container);

  const extensions = createPapyroTiptapExtensions();
  const markdownManager = createPapyroMarkdownManager({ extensions });
  let editor: SmokeEditor | null = null;

  try {
    const createRuntimeAdapter = createPapyroTiptapRuntimeAdapter as unknown as (
      options: Record<string, unknown>,
    ) => Record<string, unknown>;
    const runtime = createRuntimeAdapter({
      dom: {
        document: windowRef.document,
      },
      navigation: createSmokeNavigation(),
    });
    const facade = installPapyroEditorRuntime(windowRef as unknown as Record<string, unknown>, {
      adapters: {
        tiptap: runtime,
      },
    }) as SmokeFacade;
    const dioxusMessages: unknown[] = [];

    checkRuntimeFacade(failures, facade);
    editor = facade.ensureEditor({
      tabId: "tab-a",
      containerId: "editor-root",
      instanceId: "smoke-a",
      initialContent: markdown,
      viewMode: "hybrid",
    });
    facade.attachChannel("tab-a", {
      send: (message: unknown) => dioxusMessages.push(message),
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

async function flushRuntime(windowRef: SmokeWindow) {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await windowRef.happyDOM?.waitUntilComplete?.();
}

function installDomGlobals(windowRef: SmokeWindow): SmokeGlobalRestoreMap {
  const previous: SmokeGlobalRestoreMap = new Map();
  const install: Record<string, unknown> = {
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
    requestAnimationFrame: (callback: FrameRequestCallback) =>
      setTimeout(() => callback(Date.now()), 0),
    cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
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

  const windowRecord = windowRef as unknown as Record<string, unknown>;
  if (!windowRecord.DOMRect) {
    class SmokeDOMRect {
      x: number;
      y: number;
      width: number;
      height: number;
      top: number;
      left: number;
      right: number;
      bottom: number;

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

      static fromRect(rect: SmokeRectInit = {}) {
        return new SmokeDOMRect(
          rect.x ?? 0,
          rect.y ?? 0,
          rect.width ?? 0,
          rect.height ?? 0,
        );
      }
    }
    windowRecord.DOMRect = SmokeDOMRect;
    install.DOMRect = SmokeDOMRect;
  }

  for (const [name, value] of Object.entries(install)) {
    previous.set(name, {
      exists: Object.prototype.hasOwnProperty.call(globalThis, name),
      value: (globalThis as unknown as Record<string, unknown>)[name],
    });
    (globalThis as unknown as Record<string, unknown>)[name] = value;
  }

  return previous;
}

function restoreDomGlobals(previous: SmokeGlobalRestoreMap) {
  for (const [name, record] of previous.entries()) {
    if (record.exists) {
      (globalThis as unknown as Record<string, unknown>)[name] = record.value;
    } else {
      delete (globalThis as unknown as Record<string, unknown>)[name];
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

function checkRuntimeFacade(failures: SmokeFailureList, facade: SmokeFacade) {
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

async function checkRuntimeBridge(
  failures: SmokeFailureList,
  facade: SmokeFacade,
  container: SmokeDomElement,
  editor: SmokeEditor | null,
  _dioxusMessages: unknown[],
  windowRef: SmokeWindow,
) {
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
  if (
    (windowRef.document.activeElement as unknown) !==
    (container.querySelector?.("textarea") as unknown)
  ) {
    failures.push("runtime bridge did not route focus to the source pane");
  }

  facade.handleRustMessage("tab-a", {
    type: "set_view_mode",
    mode: "hybrid",
  });
  await flushRuntime(windowRef);
}

function checkMountedEditor(failures: SmokeFailureList, editor: SmokeEditor | null) {
  if (!editor?.view) {
    failures.push("editor view is not available after mount");
    return;
  }

  if (!editor.view.dom?.classList?.contains?.("ProseMirror")) {
    failures.push("editor view DOM is missing ProseMirror root class");
  }

  if (!editor.view.dom?.classList?.contains?.("tiptap")) {
    failures.push("editor view DOM is missing the official Tiptap root class");
  }

  if (editor.isDestroyed) {
    failures.push("editor is destroyed immediately after mount");
  }
}

function checkReactIsland(failures: SmokeFailureList, container: SmokeDomElement) {
  if (!container.querySelector?.(".mn-tiptap-react-root")) {
    failures.push("React editor island did not mount");
  }
}

function checkRenderedDom(failures: SmokeFailureList, dom: SmokeDomElement | null | undefined) {
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

function checkCodeBlockChrome(failures: SmokeFailureList, dom: SmokeDomElement | null | undefined) {
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

function checkRegistryLifecycle(
  failures: SmokeFailureList,
  facade: SmokeFacade,
  container: SmokeDomElement,
) {
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

function checkRoundTrip(
  failures: SmokeFailureList,
  editor: SmokeEditor | null,
  markdownManager: SmokeMarkdownManager,
) {
  if (!editor) {
    failures.push("mounted editor is not available for Markdown round-trip");
    return;
  }
  const serialized = serializeTiptapMarkdown(editor.getJSON(), markdownManager as never);
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

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
      .sort()
      .flatMap((key) => {
        if (key === "rel" && record[key] === "noopener noreferrer nofollow") return [];
        if (key === "target" && (record[key] === null || record[key] === "_blank")) return [];
        if (key === "class" && record[key] === null) return [];
        if (key === "start" && record[key] === 1) return [];
        if ((key === "colspan" || key === "rowspan") && record[key] === 1) return [];
        if (record[key] === null || record[key] === undefined) return [];
        const sortedValue = sortJson(record[key]);
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

function findNode(node: SmokeJsonNode | null | undefined, type: string): SmokeJsonNode | null {
  if (!node || typeof node !== "object") return null;
  if (node.type === type) return node;
  for (const child of node.content ?? []) {
    const found = findNode(child, type);
    if (found) return found;
  }
  return null;
}

function findComplexTable(node: SmokeJsonNode | null | undefined): SmokeJsonNode | null {
  let found: SmokeJsonNode | null = null;
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

function checkComplexTableRuntime(
  failures: SmokeFailureList,
  facade: SmokeFacade,
  container: SmokeDomElement,
) {
  let editor: SmokeEditor | null = null;

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

function walkJson(
  node: SmokeJsonNode | null | undefined,
  visit: (node: SmokeJsonNode) => void,
) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const child of node.content ?? []) {
    walkJson(child, visit);
  }
}
