type RuntimeEditorShape = {
  isDestroyed?: boolean;
  destroyed?: boolean;
};

export type EditorRuntimeEntry = {
  editor?: RuntimeEditorShape | null;
  [key: string]: unknown;
};

export function isRuntimeEditorDestroyed(
  editor: RuntimeEditorShape | null | undefined,
): boolean {
  if (!editor) return false;

  try {
    return editor.isDestroyed === true || editor.destroyed === true;
  } catch {
    return false;
  }
}

export class EditorRuntimeRegistry<TEntry extends EditorRuntimeEntry> {
  #entries: Map<string, TEntry>;

  constructor(entries = new Map<string, TEntry>()) {
    this.#entries = entries;
  }

  get size() {
    return this.#entries.size;
  }

  get(tabId: string) {
    return this.#entries.get(tabId);
  }

  has(tabId: string) {
    return this.#entries.has(tabId);
  }

  set(tabId: string, entry: TEntry) {
    this.#entries.set(tabId, entry);
    return this;
  }

  delete(tabId: string) {
    return this.#entries.delete(tabId);
  }

  clear() {
    this.#entries.clear();
  }

  entries() {
    return this.#entries.entries();
  }

  keys() {
    return this.#entries.keys();
  }

  values() {
    return this.#entries.values();
  }

  [Symbol.iterator]() {
    return this.entries();
  }

  register(tabId: string, entry: TEntry) {
    this.set(tabId, entry);
    return entry;
  }

  currentEntry(
    tabId: string,
    {
      entry,
      editor,
    }: { entry?: TEntry; editor?: RuntimeEditorShape | null } = {},
  ) {
    const current = this.get(tabId) ?? null;
    if (!current) return null;
    if (entry && current !== entry) return null;
    if (editor && current.editor !== editor) return null;
    if (isRuntimeEditorDestroyed(current.editor)) return null;
    return current;
  }

  entryForEditor(tabId: string, editor: RuntimeEditorShape | null | undefined) {
    return this.currentEntry(tabId, { editor });
  }

  isCurrentEntry(tabId: string, entry: TEntry) {
    return this.currentEntry(tabId, { entry }) === entry;
  }

  isCurrentEditor(tabId: string, editor: RuntimeEditorShape | null | undefined) {
    return this.entryForEditor(tabId, editor) !== null;
  }

  unregister(tabId: string, expectedEntry: TEntry | null = null) {
    const entry = this.get(tabId) ?? null;
    if (!entry) return null;
    if (expectedEntry && entry !== expectedEntry) return null;

    this.delete(tabId);
    return entry;
  }

  release(tabId: string, disposeEntry?: (entry: TEntry) => void) {
    const entry = this.unregister(tabId);
    if (!entry) return null;

    if (typeof disposeEntry === "function") {
      disposeEntry(entry);
    }
    return entry;
  }
}

export function createEditorRuntimeRegistry<TEntry extends EditorRuntimeEntry>(
  entries?: Map<string, TEntry>,
) {
  return new EditorRuntimeRegistry(entries);
}
