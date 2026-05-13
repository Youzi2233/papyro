import {
  editorPreferencesEqual,
  nextEditorPreferences,
  normalizeEditorPreferences,
} from "./editor-core.ts";

export type PapyroEditorPreferencesInput = {
  auto_link_paste?: boolean | null;
  autoLinkPaste?: boolean | null;
  language?: string | null;
  app_language?: string | null;
  appLanguage?: string | null;
};

export type PapyroEditorPreferences = {
  autoLinkPaste: boolean;
  language: string;
};

export type PapyroPreferencesEntry = {
  preferences?: PapyroEditorPreferences;
};

export type PapyroPreferencesApplyResult = {
  changed: boolean;
  preferences: PapyroEditorPreferences;
};

export class TiptapPreferencesController {
  #preferences: PapyroEditorPreferences;

  constructor(initialPreferences: PapyroEditorPreferencesInput = {}) {
    this.#preferences = normalizeEditorPreferences(initialPreferences) as PapyroEditorPreferences;
  }

  get preferences(): PapyroEditorPreferences {
    return { ...this.#preferences };
  }

  attach(entry?: PapyroPreferencesEntry | null): PapyroEditorPreferences {
    if (entry) {
      entry.preferences = this.preferences;
    }
    return this.preferences;
  }

  apply(
    entry?: PapyroPreferencesEntry | null,
    preferences: PapyroEditorPreferencesInput = {},
  ): PapyroPreferencesApplyResult {
    const nextPreferences = nextEditorPreferences(
      this.#preferences,
      preferences,
    ) as PapyroEditorPreferences;
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

export function createTiptapPreferencesController(
  initialPreferences?: PapyroEditorPreferencesInput,
): TiptapPreferencesController {
  return new TiptapPreferencesController(initialPreferences);
}
