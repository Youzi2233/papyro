import { createPapyroEditorFacade } from "./editor-runtime.js";
import { selectEditorRuntimeAdapter } from "./editor-runtime-selector.js";

export function createEditorRuntimeFacade({
  requestedKind,
  adapters,
  selectRuntimeAdapter = selectEditorRuntimeAdapter,
  createFacade = createPapyroEditorFacade,
} = {}) {
  const runtimeAdapter = selectRuntimeAdapter({ requestedKind, adapters });
  if (!runtimeAdapter) {
    throw new TypeError("No Papyro editor runtime adapter is available");
  }

  return createFacade(runtimeAdapter);
}

export function installPapyroEditorRuntime(
  target,
  { adapters, requestedKind = target?.PAPYRO_EDITOR_RUNTIME, createFacade } = {},
) {
  if (!target || typeof target !== "object") {
    throw new TypeError("Papyro editor runtime requires a host object");
  }

  const facade = createEditorRuntimeFacade({
    requestedKind,
    adapters,
    createFacade,
  });
  target.papyroEditor = facade;
  return facade;
}
