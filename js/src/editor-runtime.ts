import { Editor } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";

import {
  imageFileFromTransfer,
  sendEditorImageRequest,
} from "./editor-clipboard.js";
import { createTiptapRuntimeAdapter } from "./editor-runtime-contract.ts";
import { createMarkdownSyncController } from "./markdown-sync-controller.js";
import { createTiptapBlockHintsController } from "./tiptap-block-hints-controller.js";
import { createTiptapFormatCommandController } from "./tiptap-format-commands.js";
import { createTiptapHistoryCommandController } from "./tiptap-history-commands.js";
import { createTiptapModeController } from "./tiptap-mode-controller.js";
import { createTiptapModeSnapshotController } from "./tiptap-mode-snapshots.js";
import { createTiptapPasteController } from "./tiptap-paste-controller.js";
import { createTiptapPreferencesController } from "./tiptap-preferences-controller.js";
import { createTiptapSourcePaneController } from "./tiptap-source-pane.js";
import { createTiptapSlashCommandController } from "./tiptap-slash-commands.js";
import { isComposingKeyboardEvent } from "./tiptap-ui-primitives.js";
import {
  createPapyroMarkdownManager,
  createPapyroTiptapExtensions,
} from "./tiptap-markdown.js";
import { createTiptapTableCommandController } from "./tiptap-table-command-controller.ts";
import {
  createTiptapRuntimeProtocolBridge,
  syncRuntimeLanguage,
} from "./editor-runtime-protocol.ts";
import { isRuntimeEditorDestroyed } from "./editor-registry.ts";

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

function createLegacyEditorHostElement() {
  return null;
}

function mountLegacyEditorTree({ root, editor } = {}) {
  editor?.mount?.(root);
  return {
    refresh: () => {},
    destroy: () => {},
  };
}

function isSaveShortcut(event) {
  if (!event || event.altKey) return false;
  const key = String(event.key ?? "").toLowerCase();
  return key === "s" && (event.ctrlKey || event.metaKey);
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

function hasEditorImageChannel(entry) {
  return typeof entry?.dioxus?.send === "function";
}

function disposeRuntimeEntry(entry, {
  detachEditorScroll = () => false,
  detachLayoutObserver = () => false,
} = {}) {
  entry?.pasteController?.destroy?.();
  detachEditorScroll(entry);
  detachLayoutObserver(entry);
  entry?.sourcePane?.destroy?.();
  entry?.tableCommands?.destroy?.();
  entry?.reactMount?.destroy?.();
  entry?.editor?.destroy?.();
}

function releaseRegistryEntry(registry, tabId, disposeEntry = disposeRuntimeEntry) {
  if (typeof registry.release === "function") {
    return registry.release(tabId, disposeEntry);
  }

  const released = typeof registry.unregister === "function"
    ? registry.unregister(tabId)
    : registry.get(tabId);
  if (!released) return null;
  if (typeof registry.unregister !== "function") {
    registry.delete(tabId);
  }
  disposeEntry(released);
  return released;
}

function currentRegistryEntry(registry, tabId, { entry, editor } = {}) {
  if (typeof registry.currentEntry === "function") {
    return registry.currentEntry(tabId, { entry, editor });
  }

  const current = registry.get(tabId) ?? null;
  if (!current) return null;
  if (entry && current !== entry) return null;
  if (editor && current.editor !== editor) return null;
  if (isRuntimeEditorDestroyed(current.editor)) return null;
  return current;
}

function defaultEditorOptions({
  initialContent,
  extensions,
  viewMode,
  tabId,
  registry,
  editorRef,
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
        const entry = currentRegistryEntry(registry, tabId, {
          editor: editorRef.current,
        });
        if (isSaveShortcut(event) && requestSave(entry, tabId, event)) {
          return true;
        }
        if (isComposingKeyboardEvent(event)) {
          return false;
        }
        return false;
      },
      handlePaste: (view, event, slice) => {
        const entry = currentRegistryEntry(registry, tabId, {
          editor: editorRef.current,
        });
        const image = transferImage(event?.clipboardData);
        if (image && hasEditorImageChannel(entry)) {
          event?.preventDefault?.();
          sendTiptapImageRequest(entry, tabId, image, sendImageRequest).catch((error) => {
            console.warn("Failed to send pasted image", error);
          });
          return true;
        }

        return entry?.pasteController?.handlePaste({ view, event, slice }) ?? false;
      },
      handleDrop: (view, event) => {
        const entry = currentRegistryEntry(registry, tabId, {
          editor: editorRef.current,
        });
        const image = transferImage(event?.dataTransfer);
        if (!image || !hasEditorImageChannel(entry)) {
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
  formatCommands,
  historyCommands,
  pasteController,
  preferencesController,
  sourcePane,
  slashCommands,
  tableCommands,
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
    formatCommands,
    historyCommands,
    pasteController,
    preferences: preferencesController.preferences,
    preferencesController,
    sourcePane,
    slashCommands,
    tableCommands,
    reactMount,
  };
}

export function createTiptapEditorRuntime({
  registry,
  dom = {},
  editorConstructor = Editor,
  extensionsFactory = createPapyroTiptapExtensions,
  createEditorHostElement = createLegacyEditorHostElement,
  mountEditorTree = mountLegacyEditorTree,
  clipboard = {},
  layout = {},
  navigation,
} = {}) {
  const runtimeRegistry = requireObject(registry, "registry");
  const documentRef = dom.document ?? defaultDocument();
  const createElement = dom.createElement ?? ((tagName) => documentRef?.createElement?.(tagName));
  const TiptapEditor = requireFunction(editorConstructor, "editorConstructor");
  const createExtensions = requireFunction(extensionsFactory, "extensionsFactory");
  const createEditorElement = requireFunction(
    createEditorHostElement,
    "createEditorHostElement",
  );
  const mountTree = requireFunction(
    mountEditorTree,
    "mountEditorTree",
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
  const renderPreviewMath = requireFunction(
    controls.renderPreviewMath,
    "navigation.renderPreviewMath",
  );
  const protocolBridge = createTiptapRuntimeProtocolBridge({
    registry: runtimeRegistry,
    attachEditorScroll,
    detachEditorScroll,
    attachLayoutObserver,
    detachLayoutObserver,
    restoreEditorScrollSnapshot,
    syncOutline,
  });

  function ensureEditor({ tabId, containerId, instanceId = "", initialContent, viewMode }) {
    const container = documentRef?.getElementById?.(containerId) ?? null;
    if (!container) throw new Error(`Editor container not found: ${containerId}`);

    const existing = currentRegistryEntry(runtimeRegistry, tabId);
    if (existing) {
      if (existing.dom.parentElement !== container) {
        container.replaceChildren(existing.dom);
      }
      existing.dom.dataset.tabId = tabId;
      existing.instanceId = instanceId;
      existing.modeController.apply(existing, viewMode ?? existing.viewMode);
      existing.sourcePane.applyMode(existing);
      existing.reactMount?.refresh?.(existing);
      return existing.editor;
    }
    if (runtimeRegistry.has(tabId)) {
      releaseRegistryEntry(runtimeRegistry, tabId, (released) => {
        disposeRuntimeEntry(released, {
          detachEditorScroll,
          detachLayoutObserver,
        });
      });
    }

    const root = createElement("div");
    if (!root) throw new Error("Unable to create Tiptap editor root");
    root.className = "mn-tiptap-runtime";
    root.dataset.tabId = tabId;
    container.replaceChildren(root);

    const extensions = createExtensions();
    const markdownManager = createPapyroMarkdownManager({ extensions });
    const markdownSync = createMarkdownSyncController({
      initialMarkdown: initialContent ?? "",
      manager: markdownManager,
    });
    const modeController = createTiptapModeController(viewMode);
    const modeSnapshots = createTiptapModeSnapshotController();
    const blockHintsController = createTiptapBlockHintsController();
    const formatCommands = createTiptapFormatCommandController();
    const historyCommands = createTiptapHistoryCommandController();
    const pasteController = createTiptapPasteController();
    const preferencesController = createTiptapPreferencesController();
    const sourcePane = createTiptapSourcePaneController({
      document: documentRef,
      onSelectionChange: (entry) => syncOutline(tabId, entry?.viewMode),
    });
    const slashCommands = createTiptapSlashCommandController();
    const tableCommands = createTiptapTableCommandController();
    const editorRef = { current: null };
    const editor = new TiptapEditor(
      defaultEditorOptions({
        initialContent: markdownSync.markdown,
        extensions,
        viewMode: modeController.mode,
        tabId,
        registry: runtimeRegistry,
        editorRef,
        transferImage,
        sendImageRequest,
        element:
          createEditorElement({
            document: documentRef,
            root,
        }),
      }),
    );
    editorRef.current = editor;
    if (typeof editor.on === "function") {
      editor.on("update", ({ editor: updatedEditor } = {}) => {
        const targetEditor = updatedEditor ?? editor;
        const entry = currentRegistryEntry(runtimeRegistry, tabId, {
          editor: targetEditor,
        });
        if (!entry || entry.suppressChange) return;
        const markdown = entry.markdownSync.setFromEditor(targetEditor);
        entry.dioxus?.send?.({
          type: "content_changed",
          tab_id: tabId,
          content: markdown,
        });
        entry.sourcePane.setMarkdown(markdown);
      });
      editor.on("selectionUpdate", ({ editor: updatedEditor } = {}) => {
        const entry = currentRegistryEntry(runtimeRegistry, tabId, {
          editor: updatedEditor ?? editor,
        });
        if (!entry) return;
        entry?.modeSnapshots?.capture(entry, entry?.viewMode);
        syncOutline(tabId, entry?.viewMode);
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
      formatCommands,
      historyCommands,
      pasteController,
      preferencesController,
      sourcePane,
      slashCommands,
      tableCommands,
      reactMount: null,
    });
    const reactMount = mountTree({ root, editor, entry }) ?? null;
    entry.reactMount = reactMount;
    modeController.apply(entry, modeController.mode);
    blockHintsController.attach(entry);
    preferencesController.attach(entry);
    syncRuntimeLanguage(entry);
    sourcePane.attach({ editor, root, entry });
    modeSnapshots.capture(entry, entry.viewMode);
    pasteController.attach({ editor, root, entry });
    tableCommands.attach({ editor, root, entry });
    if (typeof runtimeRegistry.register === "function") {
      runtimeRegistry.register(tabId, entry);
    } else {
      runtimeRegistry.set(tabId, entry);
    }

    return editor;
  }

  return createTiptapRuntimeAdapter({
    ensureEditor,

    attachChannel: protocolBridge.attachChannel,
    handleRustMessage: protocolBridge.handleRustMessage,

    attachPreviewScroll,
    navigateOutline,
    syncOutline,
    scrollEditorToLine,
    scrollPreviewToHeading,
    renderPreviewMermaid,
    renderPreviewMath,
  });
}
