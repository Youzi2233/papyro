import { installPapyroEditorRuntime } from "./editor-runtime-bootstrap.ts";
import { createPapyroTiptapRuntimeAdapter } from "./editor-runtime-defaults.ts";

const tiptapRuntimeAdapter = createPapyroTiptapRuntimeAdapter();

installPapyroEditorRuntime(window, {
  adapters: {
    tiptap: tiptapRuntimeAdapter,
  },
});
