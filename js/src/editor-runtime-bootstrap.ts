import {
  assertPapyroEditorFacade,
  createPapyroEditorFacade,
} from "./editor-runtime-contract.ts";
import { selectEditorRuntimeAdapter } from "./editor-runtime-selector.ts";

type RuntimeAdapter = Record<string, unknown>;
type RuntimeAdapters = Record<string, RuntimeAdapter | undefined>;
type RuntimeFacade = Record<string, unknown>;
type RuntimeHost = Record<string, unknown> & {
  PAPYRO_EDITOR_RUNTIME?: unknown;
  papyroEditor?: unknown;
};

type CreateEditorRuntimeFacadeOptions = {
  requestedKind?: unknown;
  adapters?: RuntimeAdapters | null;
  selectRuntimeAdapter?: (options: {
    requestedKind?: unknown;
    adapters?: RuntimeAdapters | null;
  }) => RuntimeAdapter | null;
  createFacade?: (adapter: RuntimeAdapter) => RuntimeFacade;
};

export function createEditorRuntimeFacade({
  requestedKind,
  adapters,
  selectRuntimeAdapter = selectEditorRuntimeAdapter,
  createFacade = createPapyroEditorFacade,
}: CreateEditorRuntimeFacadeOptions = {}) {
  const runtimeAdapter = selectRuntimeAdapter({ requestedKind, adapters });
  if (!runtimeAdapter) {
    throw new TypeError("No Papyro editor runtime adapter is available");
  }

  return assertPapyroEditorFacade(createFacade(runtimeAdapter));
}

function definePapyroEditorFacade(target: RuntimeHost, facade: RuntimeFacade) {
  Object.defineProperty(target, "papyroEditor", {
    configurable: false,
    enumerable: true,
    writable: false,
    value: facade,
  });
}

export function installPapyroEditorRuntime(
  target: RuntimeHost | null | undefined,
  {
    adapters,
    requestedKind = target?.PAPYRO_EDITOR_RUNTIME,
    createFacade,
  }: Omit<CreateEditorRuntimeFacadeOptions, "selectRuntimeAdapter"> = {},
) {
  if (!target || typeof target !== "object") {
    throw new TypeError("Papyro editor runtime requires a host object");
  }
  if (target.papyroEditor) {
    return assertPapyroEditorFacade(target.papyroEditor);
  }

  const facade = createEditorRuntimeFacade({
    requestedKind,
    adapters,
    createFacade,
  });
  definePapyroEditorFacade(target, facade);
  return facade;
}
