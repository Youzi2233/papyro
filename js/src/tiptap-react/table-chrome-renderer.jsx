import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { setHidden } from "../tiptap-ui-primitives.js";
import { PapyroTableChrome } from "./components/table-chrome.jsx";

function canUseReactRoot(root) {
  return Boolean(
    root &&
      root.ownerDocument &&
      typeof root.addEventListener === "function" &&
      typeof root.removeEventListener === "function" &&
      typeof root.querySelector === "function" &&
      typeof root.nodeType === "number",
  );
}

export class TiptapReactTableChromeRenderer {
  #root = null;
  #reactRoot = null;

  constructor({ root = null } = {}) {
    if (canUseReactRoot(root)) {
      this.#root = root;
      this.#reactRoot = createRoot(root);
    }
  }

  get enabled() {
    return Boolean(this.#root && this.#reactRoot);
  }

  render(state) {
    if (!this.#root || !this.#reactRoot) return false;
    flushSync(() => {
      this.#reactRoot.render(<PapyroTableChrome state={state} />);
    });
    setHidden(this.#root, !state?.open);
    if (this.#root.dataset) {
      this.#root.dataset.open = state?.open ? "true" : "false";
      this.#root.dataset.selectionKind = state?.selection?.kind ?? "cell";
    }
    return true;
  }

  hide() {
    if (this.#reactRoot) {
      flushSync(() => {
        this.#reactRoot.render(<PapyroTableChrome state={null} />);
      });
    }
    setHidden(this.#root, true);
    if (this.#root?.dataset) {
      this.#root.dataset.open = "false";
    }
  }

  contains(target) {
    return this.#root?.contains?.(target) ?? false;
  }

  destroy() {
    this.#reactRoot?.unmount?.();
    this.#root = null;
    this.#reactRoot = null;
  }
}

export function createTiptapReactTableChromeRenderer(options) {
  const renderer = new TiptapReactTableChromeRenderer(options);
  return renderer.enabled ? renderer : null;
}
