export class EditorRuntimeRegistry {
  #entries;

  constructor(entries = new Map()) {
    this.#entries = entries;
  }

  get size() {
    return this.#entries.size;
  }

  get(tabId) {
    return this.#entries.get(tabId);
  }

  has(tabId) {
    return this.#entries.has(tabId);
  }

  set(tabId, entry) {
    this.#entries.set(tabId, entry);
    return this;
  }

  delete(tabId) {
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

  register(tabId, entry) {
    this.set(tabId, entry);
    return entry;
  }

  unregister(tabId) {
    const entry = this.get(tabId) ?? null;
    if (!entry) return null;

    this.delete(tabId);
    return entry;
  }
}

export function createEditorRuntimeRegistry(entries) {
  return new EditorRuntimeRegistry(entries);
}
