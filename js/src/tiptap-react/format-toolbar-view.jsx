import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { setHidden } from "../tiptap-ui-primitives.js";
import { syncMenuActiveDescendant } from "../tiptap-ui-primitives.js";
import { PapyroFormatToolbar } from "./components/format-toolbar.jsx";
import {
  positionReactFloatingElement,
  usableFloatingRect,
} from "./utils/floating.js";

const REGULAR_TOOLBAR_WIDTH = 410;
const COMPACT_TOOLBAR_WIDTH = 352;
const TOOLBAR_HEIGHT = 38;
const TOOLBAR_MARGIN = 10;
const FORMAT_TOOLBAR_OWNER_ID = "mn-tiptap-format-toolbar";

function selectionRect(editor, range) {
  const view = editor?.view;
  if (!view || typeof view.coordsAtPos !== "function" || !range) {
    return null;
  }

  try {
    const from = view.coordsAtPos(range.from);
    const to = view.coordsAtPos(range.to);
    const rect = {
      left: Math.min(from.left, to.left),
      right: Math.max(from.right ?? from.left, to.right ?? to.left),
      top: Math.min(from.top, to.top),
      bottom: Math.max(from.bottom ?? from.top, to.bottom ?? to.top),
    };
    return usableFloatingRect(rect) ? rect : null;
  } catch (_error) {
    return null;
  }
}

function toolbarSize(density) {
  return {
    width: density === "compact" ? COMPACT_TOOLBAR_WIDTH : REGULAR_TOOLBAR_WIDTH,
    height: TOOLBAR_HEIGHT,
    margin: TOOLBAR_MARGIN,
  };
}

function placeToolbar(element, editor, state, fallbackWindow) {
  positionReactFloatingElement({
    element,
    rect: selectionRect(editor, state.range),
    reference: editor?.view?.dom,
    fallbackWindow,
    size: toolbarSize(state.density),
    placement: "top",
  });
}

export class TiptapReactFormatToolbarView {
  #document;
  #window;
  #ownerId;
  #root = null;
  #reactRoot = null;

  constructor({
    document = typeof globalThis.document === "undefined" ? null : globalThis.document,
    window = document?.defaultView ?? (typeof globalThis.window === "undefined" ? null : globalThis.window),
    ownerId = "mn-tiptap-format-toolbar",
  } = {}) {
    this.#document = document;
    this.#window = window;
    this.#ownerId = ownerId;
  }

  mount(container) {
    if (this.#root || !this.#document) return;

    const root = this.#document.createElement?.("div") ?? null;
    if (!root) return;

    root.id = this.#ownerId;
    root.className = "mn-tiptap-format-toolbar hidden";
    root.role = "toolbar";
    root.setAttribute("aria-label", "Text formatting");
    (container?.ownerDocument?.body ?? this.#document.body)?.appendChild(root);

    this.#root = root;
    this.#reactRoot = createRoot(root);
    setHidden(root, true);
  }

  update(state, editor) {
    if (!this.#root || !this.#reactRoot || !state?.open) return;

    const density = state.density ?? "regular";
    this.#root.dataset.density = density;
    this.#root.dataset.keyboardActive = state.keyboardActive ? "true" : "false";
    this.#root.onkeydown = (event) => state.handleKeyDown?.(event);

    flushSync(() => {
      this.#reactRoot.render(<PapyroFormatToolbar state={state} />);
    });
    syncMenuActiveDescendant(
      this.#root,
      FORMAT_TOOLBAR_OWNER_ID,
      state.commands,
      Math.max(
        0,
        state.commands.findIndex((command) => command.id === state.activeCommandId),
      ),
      {
        manageTabIndex: true,
        scroll: state.keyboardActive,
      },
    );

    setHidden(this.#root, false);
    placeToolbar(this.#root, editor, { ...state, density }, this.#window);
  }

  focusCommand(commandId) {
    const button = Array.from(this.#root?.querySelectorAll?.("[data-command-id]") ?? []).find(
      (element) => element.dataset?.commandId === commandId,
    );
    button?.focus?.();
    return !!button;
  }

  hide() {
    setHidden(this.#root, true);
  }

  contains(target) {
    return this.#root?.contains?.(target) ?? false;
  }

  destroy() {
    this.#reactRoot?.unmount?.();
    this.#root?.remove?.();
    this.#reactRoot = null;
    this.#root = null;
  }
}

export function createTiptapReactFormatToolbarView(options) {
  return new TiptapReactFormatToolbarView(options);
}
