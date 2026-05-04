export const DEFAULT_EDITOR_RUNTIME_KIND = "codemirror";

export function normalizeEditorRuntimeKind(kind) {
  if (kind === "tiptap") return "tiptap";
  return DEFAULT_EDITOR_RUNTIME_KIND;
}

export function selectEditorRuntimeAdapter({ requestedKind, adapters }) {
  const runtimeAdapters = adapters ?? {};
  const normalizedKind = normalizeEditorRuntimeKind(requestedKind);

  return (
    runtimeAdapters[normalizedKind] ??
    runtimeAdapters[DEFAULT_EDITOR_RUNTIME_KIND] ??
    null
  );
}
