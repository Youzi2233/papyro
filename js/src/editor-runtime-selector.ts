export const DEFAULT_EDITOR_RUNTIME_KIND = "tiptap" as const;

export type EditorRuntimeKind = typeof DEFAULT_EDITOR_RUNTIME_KIND;

export type EditorRuntimeAdapterMap<TAdapter = unknown> = Record<
  string,
  TAdapter | undefined
>;

export function normalizeEditorRuntimeKind(kind: unknown): EditorRuntimeKind {
  if (kind === DEFAULT_EDITOR_RUNTIME_KIND) return kind;
  return DEFAULT_EDITOR_RUNTIME_KIND;
}

export function selectEditorRuntimeAdapter<TAdapter>({
  requestedKind,
  adapters,
}: {
  requestedKind?: unknown;
  adapters?: EditorRuntimeAdapterMap<TAdapter> | null;
}): TAdapter | null {
  const runtimeAdapters = adapters ?? {};
  const normalizedKind = normalizeEditorRuntimeKind(requestedKind);
  const candidates = [normalizedKind, DEFAULT_EDITOR_RUNTIME_KIND];

  for (const candidate of candidates) {
    const adapter = runtimeAdapters[candidate];
    if (adapter) return adapter;
  }

  return null;
}
