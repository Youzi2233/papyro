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
  "renderPreviewMath",
]);

export const EDITOR_RUNTIME_FACADE_METHODS = Object.freeze([
  ...EDITOR_RUNTIME_HOST_METHODS,
  "describe",
]);

export const PAPYRO_EDITOR_FACADE_NAME = "papyro.editor";
export const PAPYRO_EDITOR_FACADE_VERSION = "1.0.0";
export const PAPYRO_EDITOR_PROTOCOL_VERSION = 1;

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
  "renderPreviewMath",
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

export function missingPapyroEditorFacadeMethods(facade) {
  if (!facade || typeof facade !== "object") {
    return [...EDITOR_RUNTIME_FACADE_METHODS];
  }

  return EDITOR_RUNTIME_FACADE_METHODS.filter(
    (method) => typeof facade[method] !== "function",
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

export function assertPapyroEditorFacade(facade) {
  const missing = missingPapyroEditorFacadeMethods(facade);
  if (missing.length > 0) {
    throw new TypeError(
      `Invalid Papyro editor facade; missing: ${missing.join(", ")}`,
    );
  }

  if (facade.name !== PAPYRO_EDITOR_FACADE_NAME) {
    throw new TypeError("Invalid Papyro editor facade name");
  }
  if (facade.version !== PAPYRO_EDITOR_FACADE_VERSION) {
    throw new TypeError("Invalid Papyro editor facade version");
  }
  if (facade.protocolVersion !== PAPYRO_EDITOR_PROTOCOL_VERSION) {
    throw new TypeError("Invalid Papyro editor protocol version");
  }

  const descriptor = facade.describe();
  if (
    !descriptor ||
    descriptor.name !== facade.name ||
    descriptor.version !== facade.version ||
    descriptor.protocolVersion !== facade.protocolVersion ||
    descriptor.runtimeKind !== facade.runtimeKind
  ) {
    throw new TypeError("Invalid Papyro editor facade descriptor");
  }

  return facade;
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
    renderPreviewMath: (...args) => host.renderPreviewMath(...args),
  });
}

function createFacadeDescriptor(runtimeKind) {
  return Object.freeze({
    name: PAPYRO_EDITOR_FACADE_NAME,
    version: PAPYRO_EDITOR_FACADE_VERSION,
    protocolVersion: PAPYRO_EDITOR_PROTOCOL_VERSION,
    runtimeKind,
    methods: Object.freeze([...EDITOR_RUNTIME_HOST_METHODS]),
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
  const runtimeKind = typeof runtime.kind === "string" ? runtime.kind : "unknown";
  const descriptor = createFacadeDescriptor(runtimeKind);

  return assertPapyroEditorFacade(
    Object.freeze({
      name: descriptor.name,
      version: descriptor.version,
      protocolVersion: descriptor.protocolVersion,
      runtimeKind: descriptor.runtimeKind,
      methods: descriptor.methods,
      describe: () => descriptor,
      ensureEditor: (...args) => runtime.ensureEditor(...args),
      attachChannel: (...args) => runtime.attachChannel(...args),
      handleRustMessage: (...args) => runtime.handleRustMessage(...args),
      attachPreviewScroll: (...args) => runtime.attachPreviewScroll(...args),
      navigateOutline: (...args) => runtime.navigateOutline(...args),
      syncOutline: (...args) => runtime.syncOutline(...args),
      scrollEditorToLine: (...args) => runtime.scrollEditorToLine(...args),
      scrollPreviewToHeading: (...args) => runtime.scrollPreviewToHeading(...args),
      renderPreviewMermaid: (...args) => runtime.renderPreviewMermaid(...args),
      renderPreviewMath: (...args) => runtime.renderPreviewMath(...args),
    }),
  );
}
