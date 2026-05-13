import {
  blockHintsEqual,
  normalizeBlockHints,
  setBlockHints,
} from "./editor-core.ts";

export class TiptapBlockHintsController {
  #hints = null;

  get hints() {
    return this.#hints
      ? {
          ...this.#hints,
          fallback: { ...this.#hints.fallback },
          blocks: this.#hints.blocks.map((block) => ({ ...block })),
        }
      : null;
  }

  attach(entry) {
    if (entry) {
      entry.blockHints = this.hints;
    }
    return this.hints;
  }

  apply(entry, hints) {
    const current = this.#hints;
    const next = normalizeBlockHints(hints);
    if (!next) {
      this.attach(entry);
      return {
        changed: false,
        error: "invalid_block_hints",
        hints: this.hints,
      };
    }

    const shadowEntry = { blockHints: current };
    const applied = setBlockHints(shadowEntry, next);
    this.#hints = applied;
    this.attach(entry);

    return {
      changed: !blockHintsEqual(current, applied),
      error: null,
      hints: this.hints,
    };
  }
}

export function createTiptapBlockHintsController() {
  return new TiptapBlockHintsController();
}
