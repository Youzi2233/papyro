import { Editor } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";

import {
  imageFileFromTransfer,
  sendEditorImageRequest,
} from "./editor-clipboard.js";
import { createTiptapRuntimeAdapter } from "./editor-runtime.js";
import { createMarkdownSyncController } from "./markdown-sync-controller.js";
import { createTiptapBlockActionController } from "./tiptap-block-actions.js";
import { createTiptapBlockActionMenuController } from "./tiptap-block-action-menu.js";
import { createTiptapBlockHintsController } from "./tiptap-block-hints-controller.js";
import { createTiptapBlockHandleController } from "./tiptap-block-handle.js";
import { createTiptapFormatCommandController } from "./tiptap-format-commands.js";
import { createTiptapFormatToolbarController } from "./tiptap-format-toolbar.js";
import { createTiptapHistoryCommandController } from "./tiptap-history-commands.js";
import { createTiptapLinkEditorController } from "./tiptap-link-editor.js";
import { createTiptapModeController } from "./tiptap-mode-controller.js";
import { createTiptapModeSnapshotController } from "./tiptap-mode-snapshots.js";
import { createTiptapPasteController } from "./tiptap-paste-controller.js";
import { createTiptapPreferencesController } from "./tiptap-preferences-controller.js";
import { createTiptapSourcePaneController } from "./tiptap-source-pane.js";
import { createTiptapSlashCommandController } from "./tiptap-slash-commands.js";
import { createTiptapSlashMenuController } from "./tiptap-slash-menu.js";
import { createTiptapTableCommandBridge } from "./tiptap-table-command-bridge.js";
import { isComposingKeyboardEvent } from "./tiptap-ui-primitives.js";
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

function createLegacyMountController() {
  return {
    createEditorElement: () => null,
    mount({ root, editor } = {}) {
      editor?.mount?.(root);
      return {
        refresh: () => {},
        destroy: () => {},
      };
    },
  };
}

function isSaveShortcut(event) {
  if (!event || event.altKey) return false;
  const key = String(event.key ?? "").toLowerCase();
  return key === "s" && (event.ctrlKey || event.metaKey);
}

function isLinkShortcut(event) {
  if (!event || event.altKey) return false;
  const key = String(event.key ?? "").toLowerCase();
  return key === "k" && (event.ctrlKey || event.metaKey);
}

function isFormatToolbarShortcut(event) {
  const key = String(event?.key ?? "").toLowerCase();
  return key === "f10" && event?.altKey && !event?.ctrlKey && !event?.metaKey;
}

function requestSave(entry, tabId, event) {
  if (!entry) return false;

  event?.preventDefault?.();
  entry.dioxus?.send?.({
    type: "save_requested",
    tab_id: tabId,
  });
  return true;
}

function requestLinkEditor(entry, event) {
  if (!entry || entry.viewMode !== "hybrid") return false;

  event?.preventDefault?.();
  entry.linkEditor?.openFromEditor?.({
    editor: entry.editor,
    entry,
    source: "keyboard",
  });
  return true;
}

function syncRuntimeLanguage(entry) {
  if (!entry?.dom) return;
  entry.dom.dataset.language = entry.preferences?.language ?? "english";
}

function placeCursorAtDrop(editor, view, event) {
  const position = view?.posAtCoords?.({
    left: event?.clientX ?? 0,
    top: event?.clientY ?? 0,
  })?.pos;
  if (!Number.isSafeInteger(position)) return;

  editor?.commands?.setTextSelection?.(position);
  editor?.commands?.focus?.();
}

function sendTiptapImageRequest(entry, tabId, image, sendImageRequest) {
  return sendImageRequest({
    tabId,
    image,
    getEntry: () => entry,
  }).then((sent) => {
    if (sent) entry?.editor?.commands?.focus?.();
    return sent;
  });
}

function defaultEditorOptions({
  initialContent,
  extensions,
  viewMode,
  tabId,
  registry,
  transferImage,
  sendImageRequest,
  element = null,
}) {
  return {
    element,
    extensions: [...extensions, Markdown],
    content: initialContent ?? "",
    contentType: "markdown",
    injectCSS: false,
    editable: viewMode === "hybrid",
    editorProps: {
      attributes: {
        class: "mn-tiptap-editor tiptap",
      },
      handleKeyDown: (_view, event) => {
        const entry = registry.get(tabId);
        if (isSaveShortcut(event) && requestSave(entry, tabId, event)) {
          return true;
        }
        if (isLinkShortcut(event) && requestLinkEditor(entry, event)) {
          return true;
        }
        if (isFormatToolbarShortcut(event) && entry?.formatToolbar?.activateKeyboard?.(event)) {
          return true;
        }
        if (isComposingKeyboardEvent(event)) {
          return false;
        }

        if (entry?.tableToolbar?.handleKeyDown?.(event)) return true;
        if (entry?.blockHandle?.handleKeyDown?.(event)) return true;
        return entry?.slashMenu?.handleKeyDown(event) ?? false;
      },
      handlePaste: (view, event, slice) => {
        const entry = registry.get(tabId);
        const image = transferImage(event?.clipboardData);
        if (image && entry?.dioxus) {
          event?.preventDefault?.();
          sendTiptapImageRequest(entry, tabId, image, sendImageRequest).catch((error) => {
            console.warn("Failed to send pasted image", error);
          });
          return true;
        }

        return entry?.pasteController?.handlePaste({ view, event, slice }) ?? false;
      },
      handleDrop: (view, event) => {
        const entry = registry.get(tabId);
        const image = transferImage(event?.dataTransfer);
        if (!image || !entry?.dioxus) {
          return false;
        }

        event?.preventDefault?.();
        placeCursorAtDrop(entry.editor, view, event);
        sendTiptapImageRequest(entry, tabId, image, sendImageRequest).catch((error) => {
          console.warn("Failed to send dropped image", error);
        });
        return true;
      },
    },
  };
}

function createEntry({
  editor,
  dom,
  instanceId,
  modeController,
  modeSnapshots,
  markdownSync,
  blockHintsController,
  blockHandle,
  blockActions,
  formatCommands,
  formatToolbar,
  historyCommands,
  linkEditor,
  pasteController,
  preferencesController,
  sourcePane,
  slashCommands,
  slashMenu,
  tableToolbar,
  reactMount,
}) {
  return {
    editor,
    dom,
    instanceId,
    dioxus: null,
    suppressChange: false,
    viewMode: modeController.mode,
    modeController,
    modeSnapshots,
    markdownSync,
    blockHints: blockHintsController.hints,
    blockHintsController,
    blockHandle,
    blockActions,
    formatCommands,
    formatToolbar,
    historyCommands,
    linkEditor,
    pasteController,
    preferences: preferencesController.preferences,
    preferencesController,
    sourcePane,
    slashCommands,
    slashMenu,
    tableToolbar,
    reactMount,
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
  modeSnapshotControllerFactory = createTiptapModeSnapshotController,
  blockActionControllerFactory = createTiptapBlockActionController,
  blockActionMenuControllerFactory = createTiptapBlockActionMenuController,
  blockActionMenuViewFactory = null,
  blockHintsControllerFactory = createTiptapBlockHintsController,
  blockHandleControllerFactory = createTiptapBlockHandleController,
  blockHandleViewFactory = null,
  formatCommandControllerFactory = createTiptapFormatCommandController,
  formatToolbarControllerFactory = createTiptapFormatToolbarController,
  formatToolbarViewFactory = null,
  historyCommandControllerFactory = createTiptapHistoryCommandController,
  linkEditorControllerFactory = createTiptapLinkEditorController,
  linkEditorViewFactory = null,
  pasteControllerFactory = createTiptapPasteController,
  preferencesControllerFactory = createTiptapPreferencesController,
  sourcePaneControllerFactory = createTiptapSourcePaneController,
  slashCommandControllerFactory = createTiptapSlashCommandController,
  slashMenuControllerFactory = createTiptapSlashMenuController,
  slashMenuViewFactory = null,
  tableToolbarControllerFactory = createTiptapTableCommandBridge,
  tableMenuRendererFactory = null,
  tableChromeRendererFactory = null,
  mountControllerFactory = createLegacyMountController,
  clipboard = {},
  layout = {},
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
  const createModeSnapshots = requireFunction(
    modeSnapshotControllerFactory,
    "modeSnapshotControllerFactory",
  );
  const createBlockActionController = requireFunction(
    blockActionControllerFactory,
    "blockActionControllerFactory",
  );
  const createBlockActionMenuController = requireFunction(
    blockActionMenuControllerFactory,
    "blockActionMenuControllerFactory",
  );
  const createBlockHintsController = requireFunction(
    blockHintsControllerFactory,
    "blockHintsControllerFactory",
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
  const createHistoryCommandController = requireFunction(
    historyCommandControllerFactory,
    "historyCommandControllerFactory",
  );
  const createLinkEditorController = requireFunction(
    linkEditorControllerFactory,
    "linkEditorControllerFactory",
  );
  const createPasteController = requireFunction(
    pasteControllerFactory,
    "pasteControllerFactory",
  );
  const createPreferencesController = requireFunction(
    preferencesControllerFactory,
    "preferencesControllerFactory",
  );
  const createSourcePane = requireFunction(
    sourcePaneControllerFactory,
    "sourcePaneControllerFactory",
  );
  const createSlashCommandController = requireFunction(
    slashCommandControllerFactory,
    "slashCommandControllerFactory",
  );
  const createSlashMenuController = requireFunction(
    slashMenuControllerFactory,
    "slashMenuControllerFactory",
  );
  const createTableToolbarController = requireFunction(
    tableToolbarControllerFactory,
    "tableToolbarControllerFactory",
  );
  const createMountController = requireFunction(
    mountControllerFactory,
    "mountControllerFactory",
  );
  const transferImage = requireFunction(
    clipboard.imageFileFromTransfer ?? imageFileFromTransfer,
    "clipboard.imageFileFromTransfer",
  );
  const sendImageRequest = requireFunction(
    clipboard.sendEditorImageRequest ?? sendEditorImageRequest,
    "clipboard.sendEditorImageRequest",
  );
  const attachEditorScroll =
    typeof layout.attachEditorScroll === "function" ? layout.attachEditorScroll : () => false;
  const detachEditorScroll =
    typeof layout.detachEditorScroll === "function" ? layout.detachEditorScroll : () => false;
  const attachLayoutObserver =
    typeof layout.attachLayoutObserver === "function" ? layout.attachLayoutObserver : () => false;
  const detachLayoutObserver =
    typeof layout.detachLayoutObserver === "function" ? layout.detachLayoutObserver : () => false;
  const restoreEditorScrollSnapshot =
    typeof layout.restoreEditorScrollSnapshot === "function"
      ? layout.restoreEditorScrollSnapshot
      : () => false;

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
      existing.sourcePane.applyMode(existing);
      existing.reactMount?.refresh?.(existing);
      existing.blockHandle.refresh();
      existing.formatToolbar.refresh(existing.editor);
      existing.tableToolbar.refresh(existing.editor);
      return existing.editor;
    }

    const root = createElement("div");
    if (!root) throw new Error("Unable to create Tiptap editor root");
    root.className = "mn-tiptap-runtime";
    root.dataset.tabId = tabId;
    container.replaceChildren(root);
    const mountController = createMountController({ document: documentRef, root });

    const extensions = createExtensions();
    const markdownManager = createMarkdownManager({ extensions });
    const markdownSync = createMarkdownSync({
      initialMarkdown: initialContent ?? "",
      manager: markdownManager,
    });
    const modeController = createModeController(viewMode);
    const modeSnapshots = createModeSnapshots();
    const blockHintsController = createBlockHintsController();
    const blockActions = createBlockActionController();
    const blockActionMenu = createBlockActionMenuController({
      commandController: blockActions,
      view:
        typeof blockActionMenuViewFactory === "function"
          ? blockActionMenuViewFactory({ document: documentRef })
          : null,
      dom: {
        document: documentRef,
      },
    });
    const formatCommands = createFormatCommandController();
    const historyCommands = createHistoryCommandController();
    const linkEditor = createLinkEditorController({
      view:
        typeof linkEditorViewFactory === "function"
          ? linkEditorViewFactory({ document: documentRef })
          : null,
      dom: {
        document: documentRef,
      },
    });
    const formatToolbar = createFormatToolbarController({
      commandController: formatCommands,
      linkEditor,
      view:
        typeof formatToolbarViewFactory === "function"
          ? formatToolbarViewFactory({ document: documentRef })
          : null,
      dom: {
        document: documentRef,
      },
    });
    const pasteController = createPasteController();
    const preferencesController = createPreferencesController();
    const sourcePane = createSourcePane({
      document: documentRef,
      onSelectionChange: (entry) => syncOutline(tabId, entry?.viewMode),
    });
    const slashCommands = createSlashCommandController();
    const slashMenu = createSlashMenuController({
      commandController: slashCommands,
      view:
        typeof slashMenuViewFactory === "function"
          ? slashMenuViewFactory({ document: documentRef })
          : null,
      dom: {
        document: documentRef,
      },
    });
    const tableToolbar = createTableToolbarController({
      insertMenu: slashMenu,
      dom: {
        document: documentRef,
      },
      menuRendererFactory: tableMenuRendererFactory,
      chromeRendererFactory: tableChromeRendererFactory,
    });
    const blockHandle = createBlockHandleController({
      menu: blockActionMenu,
      insertMenu: slashMenu,
      view:
        typeof blockHandleViewFactory === "function"
          ? blockHandleViewFactory({ document: documentRef })
          : null,
      dom: {
        document: documentRef,
      },
    });
    const editor = new TiptapEditor(
      defaultEditorOptions({
        initialContent: markdownSync.markdown,
        extensions,
        viewMode: modeController.mode,
        tabId,
        registry: runtimeRegistry,
        transferImage,
        sendImageRequest,
        element:
          typeof mountController?.createEditorElement === "function"
            ? mountController.createEditorElement({ root })
            : null,
      }),
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
        entry.sourcePane.setMarkdown(markdown);
        entry.blockHandle.refresh();
        entry.slashMenu.refresh(targetEditor);
        entry.formatToolbar.refresh(targetEditor);
        entry.tableToolbar.refresh(targetEditor);
      });
      editor.on("selectionUpdate", ({ editor: updatedEditor } = {}) => {
        const targetEditor = updatedEditor ?? editor;
        const entry = runtimeRegistry.get(tabId);
        entry?.blockHandle?.refresh();
        entry?.slashMenu?.refresh(targetEditor);
        entry?.formatToolbar?.refresh(targetEditor);
        entry?.tableToolbar?.refresh(targetEditor);
        entry?.modeSnapshots?.capture(entry, entry?.viewMode);
        syncOutline(tabId, entry?.viewMode);
      });
      editor.on("blur", () => {
        const entry = runtimeRegistry.get(tabId);
        const activeElement = documentRef?.activeElement;
        const keepBlockHandleOpen =
          entry?.blockHandle?.shouldKeepOpenOnEditorBlur?.(activeElement) === true;
        const keepSlashMenuOpen =
          entry?.slashMenu?.shouldKeepOpenOnEditorBlur?.(activeElement) === true;
        const keepTableToolbarOpen =
          entry?.tableToolbar?.shouldKeepOpenOnEditorBlur?.(activeElement) === true;
        if (!keepBlockHandleOpen) {
          entry?.blockHandle?.close();
        }
        if (!keepBlockHandleOpen && !keepSlashMenuOpen && !entry?.slashMenu?.contains?.(activeElement)) {
          entry?.slashMenu?.close();
        }
        if (!entry?.formatToolbar?.contains?.(activeElement)) {
          entry?.formatToolbar?.close();
        }
        if (!keepTableToolbarOpen && !entry?.tableToolbar?.contains?.(activeElement)) {
          entry?.tableToolbar?.close();
        }
      });
    }
    const entry = createEntry({
      editor,
      dom: root,
      instanceId,
      modeController,
      modeSnapshots,
      markdownSync,
      blockHintsController,
      blockHandle,
      blockActions,
      formatCommands,
      formatToolbar,
      historyCommands,
      linkEditor,
      pasteController,
      preferencesController,
      sourcePane,
      slashCommands,
      slashMenu,
      tableToolbar,
      reactMount: null,
    });
    const reactMount = mountController.mount?.({ root, editor, entry }) ?? null;
    entry.reactMount = reactMount;
    modeController.apply(entry, modeController.mode);
    blockHintsController.attach(entry);
    preferencesController.attach(entry);
    syncRuntimeLanguage(entry);
    sourcePane.attach({ editor, root, entry });
    modeSnapshots.capture(entry, entry.viewMode);
    blockHandle.attach({ editor, root, entry });
    linkEditor.attach({ editor, root, entry });
    formatToolbar.attach({ editor, root, entry });
    pasteController.attach({ editor, root, entry });
    slashMenu.attach({ editor, root, entry });
    tableToolbar.attach({ editor, root, entry });
    runtimeRegistry.set(tabId, entry);

    return editor;
  }

  return createTiptapRuntimeAdapter({
    ensureEditor,

    attachChannel(tabId, dioxus) {
      const entry = runtimeRegistry.get(tabId);
      if (!entry) return;

      entry.dioxus = dioxus;
      entry.reactMount?.refresh?.(entry);
      attachEditorScroll(tabId, entry);
      syncOutline(tabId, entry.viewMode);
      const container = entry.dom?.parentElement;
      if (container) {
        attachLayoutObserver(tabId, container, dioxus);
      }
    },

    handleRustMessage(tabId, message) {
      const entry = runtimeRegistry.get(tabId);
      if (!entry) return;

      if (message.type === "set_view_mode") {
        const previousMode = entry.viewMode;
        entry.modeSnapshots.capture(entry, previousMode);
        entry.modeController.apply(entry, message.mode);
        entry.sourcePane.applyMode(entry);
        entry.modeSnapshots.restore(entry, entry.viewMode);
        restoreEditorScrollSnapshot(entry);
        attachEditorScroll(tabId, entry);
        entry.blockHandle.refresh();
        entry.formatToolbar.refresh(entry.editor);
        entry.tableToolbar.refresh(entry.editor);
        syncOutline(tabId, entry.viewMode);
        entry.reactMount?.refresh?.(entry);
      } else if (message.type === "set_content") {
        const result = entry.markdownSync.setMarkdown(message.content ?? "");
        if (result.ok) {
          entry.suppressChange = true;
          try {
            entry.editor.commands?.setContent?.(entry.markdownSync.markdown, {
              contentType: "markdown",
            });
            entry.sourcePane.setMarkdown(entry.markdownSync.markdown);
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
        if (entry.sourcePane.insertMarkdown(entry, message.markdown ?? "", message.cursor_offset)) {
          return;
        }
        entry.editor.commands?.insertContent?.(message.markdown ?? "", {
          contentType: "markdown",
        });
      } else if (message.type === "set_preferences") {
        entry.preferencesController.apply(entry, message);
        syncRuntimeLanguage(entry);
        entry.reactMount?.refresh?.(entry);
      } else if (message.type === "set_block_hints") {
        entry.blockHintsController.apply(entry, message.hints);
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
      } else if (message.type === "undo" || message.type === "redo") {
        const result = entry.historyCommands.run(message.type, {
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
        if (entry.sourcePane.focus(entry)) {
          return;
        }
        entry.editor.commands?.focus?.();
      } else if (message.type === "destroy") {
        if (
          entry.instanceId &&
          message.instance_id &&
          entry.instanceId !== message.instance_id
        ) {
          return "destroyed";
        }
        let released = null;
        if (typeof runtimeRegistry.unregister === "function") {
          released = runtimeRegistry.unregister(tabId);
        } else {
          released = runtimeRegistry.get(tabId);
          runtimeRegistry.delete(tabId);
        }
        released?.blockHandle?.destroy?.();
        released?.formatToolbar?.destroy?.();
        released?.linkEditor?.destroy?.();
        released?.pasteController?.destroy?.();
        detachEditorScroll(released);
        detachLayoutObserver(released);
        released?.sourcePane?.destroy?.();
        released?.slashMenu?.destroy?.();
        released?.tableToolbar?.destroy?.();
        released?.reactMount?.destroy?.();
        released?.editor?.destroy?.();
        return "destroyed";
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
