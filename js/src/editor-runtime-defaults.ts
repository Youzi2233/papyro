import { createEditorHostRuntime } from "./editor-host-runtime.js";
import { createEditorRuntimeRegistry } from "./editor-registry.js";
import { createTiptapEditorRuntime } from "./editor-runtime.ts";
import { createPapyroTiptapExtensions } from "./tiptap-markdown.js";
import { createTiptapTableCommandController } from "./tiptap-table-command-controller.js";
import { createTiptapReactCodeBlockNodeViewRenderer } from "./tiptap-react/extensions/code-block-node-view.js";
import { createTiptapReactMountController } from "./tiptap-react/mount-controller.tsx";

function createRuntimeExtensions() {
  return createPapyroTiptapExtensions({
    codeBlockNodeViewRenderer: createTiptapReactCodeBlockNodeViewRenderer(),
  });
}

function layoutFromHostRuntime(hostRuntime) {
  return {
    attachEditorScroll: hostRuntime.attachEditorScroll,
    detachEditorScroll: hostRuntime.detachEditorScroll,
    attachLayoutObserver: hostRuntime.attachLayoutObserver,
    detachLayoutObserver: hostRuntime.detachLayoutObserver,
    restoreEditorScrollSnapshot: hostRuntime.restoreEditorScrollSnapshot,
  };
}

export function createPapyroTiptapRuntimeAdapter({
  registry = createEditorRuntimeRegistry(),
  hostRuntime = createEditorHostRuntime({ registry }),
  extensionsFactory = createRuntimeExtensions,
  layout = layoutFromHostRuntime(hostRuntime),
  mountControllerFactory = createTiptapReactMountController,
  tableCommandControllerFactory = createTiptapTableCommandController,
  navigation = hostRuntime.navigation,
  ...runtimeOptions
} = {}) {
  return createTiptapEditorRuntime({
    registry,
    ...runtimeOptions,
    extensionsFactory,
    layout,
    mountControllerFactory,
    tableCommandControllerFactory,
    navigation,
  });
}
