import { createEditorRuntimeRegistry } from "./editor-registry.js";
import { createEditorHostRuntime } from "./editor-host-runtime.js";
import { installPapyroEditorRuntime } from "./editor-runtime-bootstrap.js";
import {
  createTiptapReactBlockActionMenuView,
  createTiptapReactBlockHandleView,
  createTiptapReactMountController,
  createTiptapReactSlashMenuView,
  createTiptapReactTableContextMenuRenderer,
} from "./tiptap-react/index.js";
import { createTiptapEditorRuntime } from "./tiptap-runtime.js";

const editorRegistry = createEditorRuntimeRegistry();
const hostRuntime = createEditorHostRuntime({ registry: editorRegistry });
const tiptapRuntimeAdapter = createTiptapEditorRuntime({
  registry: editorRegistry,
  layout: {
    attachEditorScroll: hostRuntime.attachEditorScroll,
    detachEditorScroll: hostRuntime.detachEditorScroll,
    attachLayoutObserver: hostRuntime.attachLayoutObserver,
    detachLayoutObserver: hostRuntime.detachLayoutObserver,
    restoreEditorScrollSnapshot: hostRuntime.restoreEditorScrollSnapshot,
  },
  blockActionMenuViewFactory: createTiptapReactBlockActionMenuView,
  blockHandleViewFactory: createTiptapReactBlockHandleView,
  mountControllerFactory: createTiptapReactMountController,
  slashMenuViewFactory: createTiptapReactSlashMenuView,
  tableMenuRendererFactory: createTiptapReactTableContextMenuRenderer,
  navigation: hostRuntime.navigation,
});

installPapyroEditorRuntime(window, {
  adapters: {
    tiptap: tiptapRuntimeAdapter,
  },
});
