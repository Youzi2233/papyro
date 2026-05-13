import {
  editorPreferencesEqual,
  nextEditorPreferences,
  normalizeEditorPreferences,
} from "./editor-core.ts";

export class TiptapPreferencesController {
  #preferences;

  constructor(initialPreferences = {}) {
    this.#preferences = normalizeEditorPreferences(initialPreferences);
  }

  get preferences() {
    return { ...this.#preferences };
  }

  attach(entry) {
    if (entry) {
      entry.preferences = this.preferences;
    }
    return this.preferences;
  }

  apply(entry, preferences = {}) {
    const nextPreferences = nextEditorPreferences(this.#preferences, preferences);
    if (editorPreferencesEqual(this.#preferences, nextPreferences)) {
      this.attach(entry);
      return {
        changed: false,
        preferences: this.preferences,
      };
    }

    this.#preferences = nextPreferences;
    this.attach(entry);
    return {
      changed: true,
      preferences: this.preferences,
    };
  }
}

export function createTiptapPreferencesController(initialPreferences) {
  return new TiptapPreferencesController(initialPreferences);
}
