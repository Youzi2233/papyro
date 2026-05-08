import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { PapyroTableContextMenu } from "./components/table-context-menu.jsx";

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

export class TiptapReactTableContextMenuRenderer {
  #ownerId;
  #reactRoot = null;

  constructor({ root = null, ownerId = "mn-tiptap-table-toolbar" } = {}) {
    this.#ownerId = ownerId;
    if (canUseReactRoot(root)) {
      this.#reactRoot = createRoot(root);
    }
  }

  get enabled() {
    return Boolean(this.#reactRoot);
  }

  render({ state, commands = [], language = "english" } = {}) {
    if (!this.#reactRoot) return false;

    flushSync(() => {
      this.#reactRoot.render(
        <PapyroTableContextMenu
          ownerId={this.#ownerId}
          state={state}
          commands={commands}
          language={language}
        />,
      );
    });
    return true;
  }

  destroy() {
    this.#reactRoot?.unmount?.();
    this.#reactRoot = null;
  }
}

export function createTiptapReactTableContextMenuRenderer(options) {
  const renderer = new TiptapReactTableContextMenuRenderer(options);
  return renderer.enabled ? renderer : null;
}
