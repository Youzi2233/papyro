import { Editor } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";

import { createTiptapRuntimeAdapter } from "./editor-runtime.js";
import { createMarkdownSyncController } from "./markdown-sync-controller.js";
import { createTiptapBlockActionController } from "./tiptap-block-actions.js";
import { createTiptapBlockActionMenuController } from "./tiptap-block-action-menu.js";
import { createTiptapBlockHandleController } from "./tiptap-block-handle.js";
import { createTiptapFormatCommandController } from "./tiptap-format-commands.js";
import { createTiptapFormatToolbarController } from "./tiptap-format-toolbar.js";
import { createTiptapModeController } from "./tiptap-mode-controller.js";
import { createTiptapPasteController } from "./tiptap-paste-controller.js";
import { createTiptapPreferencesController } from "./tiptap-preferences-controller.js";
import { createTiptapSlashCommandController } from "./tiptap-slash-commands.js";
import { createTiptapSlashMenuController } from "./tiptap-slash-menu.js";
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

function defaultEditorOptions(initialContent, extensions, viewMode, tabId, registry) {
  return {
    element: null,
    extensions: [...extensions, Markdown],
    content: initialContent ?? "",
    contentType: "markdown",
    injectCSS: false,
    editable: viewMode === "hybrid",
    editorProps: {
      attributes: {
        class: "mn-tiptap-editor",
      },
      handleKeyDown: (_view, event) => {
        const entry = registry.get(tabId);
        return entry?.slashMenu?.handleKeyDown(event) ?? false;
      },
      handlePaste: (view, event, slice) => {
        const entry = registry.get(tabId);
        return entry?.pasteController?.handlePaste({ view, event, slice }) ?? false;
      },
    },
  };
}

function createEntry({
  editor,
  dom,
  instanceId,
  modeController,
  markdownSync,
  blockHandle,
  formatCommands,
  formatToolbar,
  pasteController,
  preferencesController,
  slashCommands,
  slashMenu,
}) {
  return {
    editor,
    dom,
    instanceId,
    dioxus: null,
    suppressChange: false,
    viewMode: modeController.mode,
    modeController,
    markdownSync,
    blockHandle,
    formatCommands,
    formatToolbar,
    pasteController,
    preferences: preferencesController.preferences,
    preferencesController,
    slashCommands,
    slashMenu,
  };
}

export function createTiptapEditorRuntime({
  registry,
  dom = {},
  editorConstructor = Editor,
  extensionsFactory = createPapyroTiptapExtensions,
  markdownManagerFactory = createPapyroMarkdownManager,
  markdownSyncFactory = createMarkdownSyncController,
  modeControllerFactory = createTiptapModeController,
  blockActionControllerFactory = createTiptapBlockActionController,
  blockActionMenuControllerFactory = createTiptapBlockActionMenuController,
  blockHandleControllerFactory = createTiptapBlockHandleController,
  formatCommandControllerFactory = createTiptapFormatCommandController,
  formatToolbarControllerFactory = createTiptapFormatToolbarController,
  pasteControllerFactory = createTiptapPasteController,
  preferencesControllerFactory = createTiptapPreferencesController,
  slashCommandControllerFactory = createTiptapSlashCommandController,
  slashMenuControllerFactory = createTiptapSlashMenuController,
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
  const createModeController = requireFunction(
    modeControllerFactory,
    "modeControllerFactory",
  );
  const createBlockActionController = requireFunction(
    blockActionControllerFactory,
    "blockActionControllerFactory",
  );
  const createBlockActionMenuController = requireFunction(
    blockActionMenuControllerFactory,
    "blockActionMenuControllerFactory",
  );
  const createBlockHandleController = requireFunction(
    blockHandleControllerFactory,
    "blockHandleControllerFactory",
  );
  const createFormatCommandController = requireFunction(
    formatCommandControllerFactory,
    "formatCommandControllerFactory",
  );
  const createFormatToolbarController = requireFunction(
    formatToolbarControllerFactory,
    "formatToolbarControllerFactory",
  );
  const createPasteController = requireFunction(
    pasteControllerFactory,
    "pasteControllerFactory",
  );
  const createPreferencesController = requireFunction(
    preferencesControllerFactory,
    "preferencesControllerFactory",
  );
  const createSlashCommandController = requireFunction(
    slashCommandControllerFactory,
    "slashCommandControllerFactory",
  );
  const createSlashMenuController = requireFunction(
    slashMenuControllerFactory,
    "slashMenuControllerFactory",
  );

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
      existing.modeController.apply(existing, viewMode ?? existing.viewMode);
      existing.blockHandle.refresh();
      existing.formatToolbar.refresh(existing.editor);
      return existing.editor;
    }

    const root = createElement("div");
    if (!root) throw new Error("Unable to create Tiptap editor root");
    root.className = "mn-tiptap-runtime";
    root.dataset.tabId = tabId;
    container.replaceChildren(root);

    const extensions = createExtensions();
    const markdownManager = createMarkdownManager({ extensions });
    const markdownSync = createMarkdownSync({
      initialMarkdown: initialContent ?? "",
      manager: markdownManager,
    });
    const modeController = createModeController(viewMode);
    const blockActions = createBlockActionController();
    const blockActionMenu = createBlockActionMenuController({
      commandController: blockActions,
      dom: {
        document: documentRef,
      },
    });
    const blockHandle = createBlockHandleController({
      menu: blockActionMenu,
      dom: {
        document: documentRef,
      },
    });
    const formatCommands = createFormatCommandController();
    const formatToolbar = createFormatToolbarController({
      commandController: formatCommands,
      dom: {
        document: documentRef,
      },
    });
    const pasteController = createPasteController();
    const preferencesController = createPreferencesController();
    const slashCommands = createSlashCommandController();
    const slashMenu = createSlashMenuController({
      commandController: slashCommands,
      dom: {
        document: documentRef,
      },
    });
    const editor = new TiptapEditor(
      defaultEditorOptions(
        markdownSync.markdown,
        extensions,
        modeController.mode,
        tabId,
        runtimeRegistry,
      ),
    );
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
        entry.blockHandle.refresh();
        entry.slashMenu.refresh(targetEditor);
        entry.formatToolbar.refresh(targetEditor);
      });
      editor.on("selectionUpdate", ({ editor: updatedEditor } = {}) => {
        const targetEditor = updatedEditor ?? editor;
        const entry = runtimeRegistry.get(tabId);
        entry?.blockHandle?.refresh();
        entry?.slashMenu?.refresh(targetEditor);
        entry?.formatToolbar?.refresh(targetEditor);
      });
      editor.on("blur", () => {
        const entry = runtimeRegistry.get(tabId);
        entry?.blockHandle?.close();
        entry?.slashMenu?.close();
        entry?.formatToolbar?.close();
      });
    }
    editor.mount?.(root);

    const entry = createEntry({
      editor,
      dom: root,
      instanceId,
      modeController,
      markdownSync,
      blockHandle,
      formatCommands,
      formatToolbar,
      pasteController,
      preferencesController,
      slashCommands,
      slashMenu,
    });
    modeController.apply(entry, modeController.mode);
    preferencesController.attach(entry);
    blockHandle.attach({ editor, root, entry });
    formatToolbar.attach({ editor, root, entry });
    pasteController.attach({ editor, root, entry });
    slashMenu.attach({ editor, root, entry });
    runtimeRegistry.set(tabId, entry);

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
        entry.modeController.apply(entry, message.mode);
        entry.blockHandle.refresh();
        entry.formatToolbar.refresh(entry.editor);
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
      } else if (message.type === "set_preferences") {
        entry.preferencesController.apply(entry, message);
      } else if (message.type === "run_slash_command") {
        const result = entry.slashCommands.run(message.command_id ?? message.commandId, {
          editor: entry.editor,
          entry,
          message,
          tabId,
        });
        if (!result.ok) {
          entry.dioxus?.send?.({
            type: "runtime_error",
            tab_id: tabId,
            message: result.error,
          });
        }
      } else if (message.type === "run_format_command") {
        const result = entry.formatCommands.run(message.command_id ?? message.commandId, {
          editor: entry.editor,
          entry,
          message,
          tabId,
        });
        if (!result.ok) {
          entry.dioxus?.send?.({
            type: "runtime_error",
            tab_id: tabId,
            message: result.error,
          });
        }
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
        released?.blockHandle?.destroy?.();
        released?.formatToolbar?.destroy?.();
        released?.pasteController?.destroy?.();
        released?.slashMenu?.destroy?.();
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
