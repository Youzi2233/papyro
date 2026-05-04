import { Editor } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";

import { createTiptapRuntimeAdapter } from "./editor-runtime.js";
import { createMarkdownSyncController } from "./markdown-sync-controller.js";
import {
  createPapyroMarkdownManager,
  createPapyroTiptapExtensions,
} from "./tiptap-markdown.js";

function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new TypeError(`Tiptap runtime dependency must be a function: ${name}`);
  }
  return value;
}

function requireObject(value, name) {
  if (!value || typeof value !== "object") {
    throw new TypeError(`Tiptap runtime dependency must be an object: ${name}`);
  }
  return value;
}

function defaultDocument() {
  return typeof document === "undefined" ? null : document;
}

function defaultEditorOptions(initialContent, extensions) {
  return {
    element: null,
    extensions: [...extensions, Markdown],
    content: initialContent ?? "",
    contentType: "markdown",
    injectCSS: false,
    editable: true,
    editorProps: {
      attributes: {
        class: "mn-tiptap-editor",
      },
    },
  };
}

function createEntry({ editor, dom, instanceId, viewMode, markdownSync }) {
  return {
    editor,
    dom,
    instanceId,
    dioxus: null,
    suppressChange: false,
    viewMode: viewMode ?? "hybrid",
    markdownSync,
  };
}

export function createTiptapEditorRuntime({
  registry,
  dom = {},
  editorConstructor = Editor,
  extensionsFactory = createPapyroTiptapExtensions,
  markdownManagerFactory = createPapyroMarkdownManager,
  markdownSyncFactory = createMarkdownSyncController,
  navigation,
} = {}) {
  const runtimeRegistry = requireObject(registry, "registry");
  const documentRef = dom.document ?? defaultDocument();
  const createElement = dom.createElement ?? ((tagName) => documentRef?.createElement?.(tagName));
  const TiptapEditor = requireFunction(editorConstructor, "editorConstructor");
  const createExtensions = requireFunction(extensionsFactory, "extensionsFactory");
  const createMarkdownManager = requireFunction(
    markdownManagerFactory,
    "markdownManagerFactory",
  );
  const createMarkdownSync = requireFunction(markdownSyncFactory, "markdownSyncFactory");

  const controls = requireObject(navigation, "navigation");
  const attachPreviewScroll = requireFunction(
    controls.attachPreviewScroll,
    "navigation.attachPreviewScroll",
  );
  const navigateOutline = requireFunction(controls.navigateOutline, "navigation.navigateOutline");
  const syncOutline = requireFunction(controls.syncOutline, "navigation.syncOutline");
  const scrollEditorToLine = requireFunction(
    controls.scrollEditorToLine,
    "navigation.scrollEditorToLine",
  );
  const scrollPreviewToHeading = requireFunction(
    controls.scrollPreviewToHeading,
    "navigation.scrollPreviewToHeading",
  );
  const renderPreviewMermaid = requireFunction(
    controls.renderPreviewMermaid,
    "navigation.renderPreviewMermaid",
  );

  function ensureEditor({ tabId, containerId, instanceId = "", initialContent, viewMode }) {
    const container = documentRef?.getElementById?.(containerId) ?? null;
    if (!container) throw new Error(`Editor container not found: ${containerId}`);

    const existing = runtimeRegistry.get(tabId);
    if (existing) {
      if (existing.dom.parentElement !== container) {
        container.replaceChildren(existing.dom);
      }
      existing.dom.dataset.tabId = tabId;
      existing.instanceId = instanceId;
      existing.viewMode = viewMode ?? existing.viewMode ?? "hybrid";
      existing.dom.dataset.viewMode = existing.viewMode;
      return existing.editor;
    }

    const root = createElement("div");
    if (!root) throw new Error("Unable to create Tiptap editor root");
    root.className = "mn-tiptap-runtime";
    root.dataset.tabId = tabId;
    root.dataset.viewMode = viewMode ?? "hybrid";
    container.replaceChildren(root);

    const extensions = createExtensions();
    const markdownManager = createMarkdownManager({ extensions });
    const markdownSync = createMarkdownSync({
      initialMarkdown: initialContent ?? "",
      manager: markdownManager,
    });
    const editor = new TiptapEditor(defaultEditorOptions(markdownSync.markdown, extensions));
    if (typeof editor.on === "function") {
      editor.on("update", ({ editor: updatedEditor } = {}) => {
        const targetEditor = updatedEditor ?? editor;
        const entry = runtimeRegistry.get(tabId);
        if (!entry || entry.suppressChange) return;
        const markdown = entry.markdownSync.setFromEditor(targetEditor);
        entry.dioxus?.send?.({
          type: "content_changed",
          tab_id: tabId,
          content: markdown,
        });
      });
    }
    editor.mount?.(root);

    runtimeRegistry.set(
      tabId,
      createEntry({
        editor,
        dom: root,
        instanceId,
        viewMode,
        markdownSync,
      }),
    );

    return editor;
  }

  return createTiptapRuntimeAdapter({
    ensureEditor,

    attachChannel(tabId, dioxus) {
      const entry = runtimeRegistry.get(tabId);
      if (!entry) return;

      entry.dioxus = dioxus;
      syncOutline(tabId, entry.viewMode);
    },

    handleRustMessage(tabId, message) {
      const entry = runtimeRegistry.get(tabId);
      if (!entry) return;

      if (message.type === "set_view_mode") {
        entry.viewMode = message.mode ?? "hybrid";
        entry.dom.dataset.viewMode = entry.viewMode;
        syncOutline(tabId, entry.viewMode);
      } else if (message.type === "set_content") {
        const result = entry.markdownSync.setMarkdown(message.content ?? "");
        if (result.ok) {
          entry.suppressChange = true;
          try {
            entry.editor.commands?.setContent?.(entry.markdownSync.markdown, {
              contentType: "markdown",
            });
          } finally {
            entry.suppressChange = false;
          }
        } else {
          entry.dioxus?.send?.({
            type: "runtime_error",
            tab_id: tabId,
            message: result.error.message,
          });
        }
      } else if (message.type === "insert_markdown") {
        entry.editor.commands?.insertContent?.(message.markdown ?? "", {
          contentType: "markdown",
        });
      } else if (message.type === "focus") {
        entry.editor.commands?.focus?.();
      } else if (message.type === "destroy") {
        let released = null;
        if (typeof runtimeRegistry.unregister === "function") {
          released = runtimeRegistry.unregister(tabId);
        } else {
          released = runtimeRegistry.get(tabId);
          runtimeRegistry.delete(tabId);
        }
        released?.editor?.destroy?.();
      }
    },

    attachPreviewScroll,
    navigateOutline,
    syncOutline,
    scrollEditorToLine,
    scrollPreviewToHeading,
    renderPreviewMermaid,
  });
}
