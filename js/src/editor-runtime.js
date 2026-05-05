export const EDITOR_RUNTIME_HOST_METHODS = Object.freeze([
  "ensureEditor",
  "attachChannel",
  "handleRustMessage",
  "attachPreviewScroll",
  "navigateOutline",
  "syncOutline",
  "scrollEditorToLine",
  "scrollPreviewToHeading",
  "renderPreviewMermaid",
]);

export const EDITOR_RUNTIME_ADAPTER_METHODS = Object.freeze([
  "mount",
  "attachChannel",
  "handleMessage",
  "setViewMode",
  "destroy",
  "getMarkdown",
  "attachPreviewScroll",
  "navigateOutline",
  "syncOutline",
  "scrollEditorToLine",
  "scrollPreviewToHeading",
  "renderPreviewMermaid",
]);

export function hostMessage(type, fields = {}) {
  return {
    type,
    ...fields,
  };
}

export function missingEditorRuntimeHostMethods(adapter) {
  if (!adapter || typeof adapter !== "object") {
    return [...EDITOR_RUNTIME_HOST_METHODS];
  }

  return EDITOR_RUNTIME_HOST_METHODS.filter(
    (method) => typeof adapter[method] !== "function",
  );
}

export function missingEditorRuntimeAdapterMethods(adapter) {
  if (!adapter || typeof adapter !== "object") {
    return [...EDITOR_RUNTIME_ADAPTER_METHODS];
  }

  return EDITOR_RUNTIME_ADAPTER_METHODS.filter(
    (method) => typeof adapter[method] !== "function",
  );
}

export function assertEditorRuntimeHostAdapter(adapter) {
  const missing = missingEditorRuntimeHostMethods(adapter);
  if (missing.length > 0) {
    throw new TypeError(
      `Invalid Papyro host runtime adapter; missing: ${missing.join(", ")}`,
    );
  }
  return adapter;
}

export function assertEditorRuntimeAdapter(adapter) {
  const missing = missingEditorRuntimeAdapterMethods(adapter);
  if (missing.length > 0) {
    throw new TypeError(
      `Invalid Papyro editor runtime adapter contract; missing: ${missing.join(", ")}`,
    );
  }
  return adapter;
}

export function createEditorRuntimeAdapterContract(hostAdapter, { getMarkdown } = {}) {
  const host = assertEditorRuntimeHostAdapter(hostAdapter);
  const readMarkdown =
    typeof getMarkdown === "function"
      ? getMarkdown
      : () => {
          throw new TypeError("EditorRuntimeAdapter contract requires getMarkdown");
        };

  return Object.freeze({
    mount(options) {
      return host.ensureEditor(options);
    },
    attachChannel: (...args) => host.attachChannel(...args),
    handleMessage: (...args) => host.handleRustMessage(...args),
    setViewMode(tabId, mode) {
      return host.handleRustMessage(tabId, hostMessage("set_view_mode", { mode }));
    },
    destroy(tabId, instanceId = "") {
      const message = instanceId
        ? hostMessage("destroy", { instance_id: instanceId })
        : hostMessage("destroy");
      return host.handleRustMessage(tabId, message);
    },
    getMarkdown: readMarkdown,
    attachPreviewScroll: (...args) => host.attachPreviewScroll(...args),
    navigateOutline: (...args) => host.navigateOutline(...args),
    syncOutline: (...args) => host.syncOutline(...args),
    scrollEditorToLine: (...args) => host.scrollEditorToLine(...args),
    scrollPreviewToHeading: (...args) => host.scrollPreviewToHeading(...args),
    renderPreviewMermaid: (...args) => host.renderPreviewMermaid(...args),
  });
}

export function createTiptapRuntimeAdapter(adapter) {
  const runtime = assertEditorRuntimeHostAdapter(adapter);
  return Object.freeze({
    ...runtime,
    kind: "tiptap",
  });
}

export function createPapyroEditorFacade(adapter) {
  const runtime = assertEditorRuntimeHostAdapter(adapter);

  return Object.freeze({
    ensureEditor: (...args) => runtime.ensureEditor(...args),
    attachChannel: (...args) => runtime.attachChannel(...args),
    handleRustMessage: (...args) => runtime.handleRustMessage(...args),
    attachPreviewScroll: (...args) => runtime.attachPreviewScroll(...args),
    navigateOutline: (...args) => runtime.navigateOutline(...args),
    syncOutline: (...args) => runtime.syncOutline(...args),
    scrollEditorToLine: (...args) => runtime.scrollEditorToLine(...args),
    scrollPreviewToHeading: (...args) => runtime.scrollPreviewToHeading(...args),
    renderPreviewMermaid: (...args) => runtime.renderPreviewMermaid(...args),
  });
}
