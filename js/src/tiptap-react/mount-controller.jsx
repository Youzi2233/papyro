import React from "react";
import { createRoot } from "react-dom/client";

import { PapyroTiptapReactIsland } from "./island.jsx";

function noop() {}

export function createTiptapReactMountController({
  createRootImpl = createRoot,
  document: documentRef = typeof document === "undefined" ? null : document,
  components = {},
  IslandComponent = PapyroTiptapReactIsland,
} = {}) {
  return {
    createEditorElement({ root } = {}) {
      const ownerDocument = documentRef ?? root?.ownerDocument ?? null;
      const element = ownerDocument?.createElement?.("div") ?? null;
      if (element) {
        element.className = "mn-tiptap-react-seed";
      }
      return element;
    },

    mount({ root, editor, entry = null } = {}) {
      if (!root || !editor) {
        throw new Error("React Tiptap mount requires a root element and editor");
      }

      const ownerDocument = documentRef ?? root.ownerDocument ?? null;
      const reactHost = ownerDocument?.createElement?.("div") ?? null;
      if (!reactHost) {
        throw new Error("Unable to create React Tiptap host");
      }

      reactHost.className = "mn-tiptap-react-root";
      root.appendChild?.(reactHost);

      const reactRoot = createRootImpl(reactHost);
      const render = (nextEntry = entry) => {
        reactRoot.render(
          <IslandComponent
            editor={editor}
            entry={nextEntry}
            components={components}
          />,
        );
      };

      render(entry);

      return {
        refresh: render,
        destroy() {
          reactRoot.unmount?.();
          reactHost.remove?.();
        },
      };
    },
  };
}

export function createTiptapLegacyMountController() {
  return {
    createEditorElement: () => null,
    mount({ root, editor } = {}) {
      editor?.mount?.(root);
      return {
        refresh: noop,
        destroy: noop,
      };
    },
  };
}
