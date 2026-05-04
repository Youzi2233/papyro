export const EDITOR_RUNTIME_ADAPTER_METHODS = Object.freeze([
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

export function missingEditorRuntimeAdapterMethods(adapter) {
  if (!adapter || typeof adapter !== "object") {
    return [...EDITOR_RUNTIME_ADAPTER_METHODS];
  }

  return EDITOR_RUNTIME_ADAPTER_METHODS.filter(
    (method) => typeof adapter[method] !== "function",
  );
}

export function assertEditorRuntimeAdapter(adapter) {
  const missing = missingEditorRuntimeAdapterMethods(adapter);
  if (missing.length > 0) {
    throw new TypeError(
      `Invalid Papyro editor runtime adapter; missing: ${missing.join(", ")}`,
    );
  }
  return adapter;
}

export function createCodeMirrorRuntimeAdapter(adapter) {
  const runtime = assertEditorRuntimeAdapter(adapter);
  return Object.freeze({
    ...runtime,
    kind: "codemirror",
  });
}

export function createPapyroEditorFacade(adapter) {
  const runtime = assertEditorRuntimeAdapter(adapter);

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
