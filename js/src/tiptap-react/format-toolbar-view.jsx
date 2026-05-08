import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { formatToolbarLabel } from "../tiptap-i18n.js";
import { setHidden } from "../tiptap-ui-primitives.js";
import { syncMenuActiveDescendant } from "../tiptap-ui-primitives.js";
import { PapyroFormatToolbar } from "./components/format-toolbar.jsx";
import {
  positionReactFloatingElement,
  usableFloatingRect,
} from "./utils/floating.js";

const REGULAR_TOOLBAR_WIDTH = 448;
const COMPACT_TOOLBAR_WIDTH = 386;
const TOOLBAR_HEIGHT = 38;
const TOOLBAR_MARGIN = 10;
const FORMAT_TOOLBAR_OWNER_ID = "mn-tiptap-format-toolbar";
const FORMAT_TOOLBAR_SUBMENU_OWNER_ID = "mn-tiptap-format-toolbar-submenu";

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
  #submenuOwnerId;
  #root = null;
  #reactRoot = null;

  constructor({
    document = typeof globalThis.document === "undefined" ? null : globalThis.document,
    window = document?.defaultView ?? (typeof globalThis.window === "undefined" ? null : globalThis.window),
    ownerId = FORMAT_TOOLBAR_OWNER_ID,
    submenuOwnerId = FORMAT_TOOLBAR_SUBMENU_OWNER_ID,
  } = {}) {
    this.#document = document;
    this.#window = window;
    this.#ownerId = ownerId;
    this.#submenuOwnerId = submenuOwnerId;
  }

  mount(container) {
    if (this.#root || !this.#document) return;

    const root = this.#document.createElement?.("div") ?? null;
    if (!root) return;

    root.id = this.#ownerId;
    root.className = "mn-tiptap-format-toolbar hidden";
    root.role = "toolbar";
    root.setAttribute("aria-label", formatToolbarLabel("english"));
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
    this.#root.setAttribute("aria-label", formatToolbarLabel(state.language));
    this.#root.onkeydown = (event) => state.handleKeyDown?.(event);

    flushSync(() => {
      this.#reactRoot.render(
        <PapyroFormatToolbar
          state={state}
          ownerId={this.#ownerId}
          submenuOwnerId={this.#submenuOwnerId}
        />,
      );
    });
    const submenuCommand = state.commands.find((command) => command.id === state.submenuOpen);
    const activeCommands = state.submenuOpen ? submenuCommand?.children ?? [] : state.commands;
    const activeIndex = Math.max(
      0,
      state.submenuOpen
        ? activeCommands.findIndex((command) => command.id === state.activeChildCommandId)
        : activeCommands.findIndex((command) => command.id === state.activeCommandId),
    );
    syncMenuActiveDescendant(
      this.#root,
      state.submenuOpen ? this.#submenuOwnerId : this.#ownerId,
      activeCommands,
      activeIndex,
      {
        indexDataset: state.submenuOpen ? "submenuCommandIndex" : "commandIndex",
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
