import { createCodeMirrorRuntimeAdapter } from "./editor-runtime.js";

function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new TypeError(`CodeMirror runtime dependency must be a function: ${name}`);
  }
  return value;
}

function requireObject(value, name) {
  if (!value || typeof value !== "object") {
    throw new TypeError(`CodeMirror runtime dependency must be an object: ${name}`);
  }
  return value;
}

function defaultDocument() {
  return typeof document === "undefined" ? null : document;
}

function defaultIsElement(element) {
  return typeof HTMLElement !== "undefined" && element instanceof HTMLElement;
}

export function createCodeMirrorEditorRuntime({
  registry,
  dom = {},
  viewPool,
  viewFactory,
  protocol,
  layout,
  navigation,
}) {
  const runtimeRegistry = requireObject(registry, "registry");
  const documentRef = dom.document ?? defaultDocument();
  const isElement = dom.isElement ?? defaultIsElement;

  const pool = requireObject(viewPool, "viewPool");
  const takeSpareView = requireFunction(pool.takeSpareView, "viewPool.takeSpareView");
  const resetViewState = requireFunction(pool.resetViewState, "viewPool.resetViewState");
  const scheduleWarmSpare = requireFunction(pool.scheduleWarmSpare, "viewPool.scheduleWarmSpare");

  const views = requireObject(viewFactory, "viewFactory");
  const attachViewToTab = requireFunction(views.attachViewToTab, "viewFactory.attachViewToTab");
  const createEditorView = requireFunction(views.createEditorView, "viewFactory.createEditorView");
  const createEntry = requireFunction(views.createEntry, "viewFactory.createEntry");

  const messages = requireObject(protocol, "protocol");
  const handleRustMessage = requireFunction(messages.handleRustMessage, "protocol.handleRustMessage");
  const applyFormat = requireFunction(messages.applyFormat, "protocol.applyFormat");
  const refreshEditorLayout = requireFunction(
    messages.refreshEditorLayout,
    "protocol.refreshEditorLayout",
  );
  const setEditorPreferences = requireFunction(
    messages.setEditorPreferences,
    "protocol.setEditorPreferences",
  );
  const setBlockHints = requireFunction(messages.setBlockHints, "protocol.setBlockHints");
  const setViewMode = requireFunction(messages.setViewMode, "protocol.setViewMode");

  const chrome = requireObject(layout, "layout");
  const attachEditorScroll = requireFunction(chrome.attachEditorScroll, "layout.attachEditorScroll");
  const attachLayoutObserver = requireFunction(
    chrome.attachLayoutObserver,
    "layout.attachLayoutObserver",
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

  function setRuntimeViewMode(tabId, mode) {
    return handleRustMessage(
      runtimeRegistry,
      tabId,
      {
        type: "set_view_mode",
        mode,
      },
      { refreshEditorLayout, setViewMode },
    );
  }

  function ensureEditor({ tabId, containerId, instanceId = "", initialContent, viewMode }) {
    const container = documentRef?.getElementById?.(containerId) ?? null;
    if (!container) throw new Error(`Editor container not found: ${containerId}`);

    const existing = runtimeRegistry.get(tabId);
    if (existing) {
      if (existing.view.dom.parentElement !== container) {
        container.replaceChildren(existing.view.dom);
      }
      existing.view.dom.dataset.tabId = tabId;
      existing.instanceId = instanceId;
      setRuntimeViewMode(tabId, viewMode ?? existing.viewMode ?? "hybrid");
      return existing.view;
    }

    const spareView = takeSpareView();
    if (spareView) {
      resetViewState(spareView, initialContent ?? "");
      attachViewToTab(spareView, tabId, container, instanceId, initialContent, viewMode);
      scheduleWarmSpare();
      return spareView;
    }

    const view = createEditorView({
      container,
      initialContent: initialContent ?? "",
    });
    view.dom.dataset.tabId = tabId;
    runtimeRegistry.set(tabId, createEntry({ view, instanceId }));
    setRuntimeViewMode(tabId, viewMode ?? "hybrid");
    scheduleWarmSpare();
    return view;
  }

  return createCodeMirrorRuntimeAdapter({
    ensureEditor,

    handleRustMessage(tabId, message) {
      return handleRustMessage(runtimeRegistry, tabId, message, {
        applyFormat,
        refreshEditorLayout,
        setEditorPreferences,
        setBlockHints,
        setViewMode,
      });
    },

    attachChannel(tabId, dioxus) {
      const entry = runtimeRegistry.get(tabId);
      if (!entry) return;

      entry.dioxus = dioxus;
      attachEditorScroll(tabId, entry);
      syncOutline(tabId, entry.viewMode);
      const container = entry.view?.dom?.parentElement;
      if (isElement(container)) {
        attachLayoutObserver(tabId, container, dioxus);
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
