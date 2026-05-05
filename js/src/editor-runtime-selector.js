export const DEFAULT_EDITOR_RUNTIME_KIND = "tiptap";

export function normalizeEditorRuntimeKind(kind) {
  if (kind === DEFAULT_EDITOR_RUNTIME_KIND) return kind;
  return DEFAULT_EDITOR_RUNTIME_KIND;
}

export function selectEditorRuntimeAdapter({ requestedKind, adapters }) {
  const runtimeAdapters = adapters ?? {};
  const normalizedKind = normalizeEditorRuntimeKind(requestedKind);
  const candidates = [normalizedKind, DEFAULT_EDITOR_RUNTIME_KIND];

  for (const candidate of candidates) {
    if (runtimeAdapters[candidate]) return runtimeAdapters[candidate];
  }

  return null;
}
