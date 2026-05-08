import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { blockHandleActionsLabel } from "../tiptap-i18n.js";
import {
  clamp,
  defaultDocument,
  defaultWindow,
  setHidden,
  syncMenuActiveDescendant,
} from "../tiptap-ui-primitives.js";
import { PapyroBlockActionMenu } from "./components/block-action-menu.jsx";
import {
  blockActionSubmenuPanelWidth,
  commandSubmenuId,
} from "./commands/block-action-menu-model.js";
import {
  positionReactFloatingElement,
  shouldFlipFloatingSidePanel,
  usableFloatingRect,
} from "./utils/floating.js";

const DEFAULT_WIDTH = 168;
const DEFAULT_HEIGHT = 340;
const DEFAULT_MARGIN = 10;
const SUBMENU_GAP = 6;

function placeMenu(element, target, fallbackWindow, anchorRect = null) {
  const rect = usableFloatingRect(anchorRect)
    ? anchorRect
    : target?.block?.getBoundingClientRect?.();
  positionReactFloatingElement({
    element,
    rect,
    reference: target?.block,
    fallbackWindow,
    size: {
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      margin: DEFAULT_MARGIN,
    },
    placement: "right",
  });
}

export class TiptapReactBlockActionMenuView {
  #document;
  #window;
  #ownerId;
  #root = null;
  #reactRoot = null;
  #language = "english";

  constructor({
    document = defaultDocument(),
    window = defaultWindow(document),
    ownerId = "mn-tiptap-block-action-menu",
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
    root.className = "mn-tiptap-block-action-menu hidden";
    root.role = "menu";
    root.setAttribute("aria-label", blockHandleActionsLabel(this.#language));
    root.dataset.hasSubmenus = "false";
    root.dataset.sidePlacement = "right";
    (container?.ownerDocument?.body ?? this.#document.body)?.appendChild(root);

    this.#root = root;
    this.#reactRoot = createRoot(root);
    setHidden(root, true);
  }

  update(state) {
    if (!this.#root || !this.#reactRoot || !state?.open) return;

    this.#language = state.language ?? "english";
    this.#root.setAttribute("aria-label", blockHandleActionsLabel(this.#language));
    this.#root.dataset.hasSubmenus = state.commands?.some(
      (command) => command.submenu && Array.isArray(command.children),
    )
      ? "true"
      : "false";

    flushSync(() => {
      this.#reactRoot.render(
        <PapyroBlockActionMenu
          ownerId={this.#ownerId}
          state={state}
          language={this.#language}
        />,
      );
    });

    syncMenuActiveDescendant(this.#root, this.#ownerId, state.commands, state.selectedIndex, {
      manageTabIndex: true,
      scroll: false,
    });
    setHidden(this.#root, false);
    placeMenu(this.#root, state.target, this.#window, state.anchorRect);
    this.#syncSubmenuPlacement(state);
    this.#syncSubmenuTop(state);
  }

  updateSelection(state, options = {}) {
    if (!this.#root || !this.#reactRoot || !state?.open) return false;

    this.update(state);
    syncMenuActiveDescendant(this.#root, this.#ownerId, state.commands, state.selectedIndex, {
      manageTabIndex: true,
      scroll: options.scroll !== false,
    });
    return true;
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

  #syncSubmenuPlacement(state) {
    if (!this.#root) return;
    const hasActiveSubmenu = Boolean(commandSubmenuId(state.commands?.[state.selectedIndex]));
    if (!hasActiveSubmenu) {
      this.#root.dataset.sidePlacement = "right";
      return;
    }

    this.#root.dataset.sidePlacement = shouldFlipFloatingSidePanel({
      root: this.#root,
      reference: this.#root,
      panelWidth: blockActionSubmenuPanelWidth(),
      gap: SUBMENU_GAP,
      margin: DEFAULT_MARGIN,
      fallbackWindow: this.#window,
    }) ? "left" : "right";
  }

  #syncSubmenuTop(state) {
    if (!this.#root) return;
    const activeSubmenu = commandSubmenuId(state.commands?.[state.selectedIndex]);
    if (!activeSubmenu) return;

    const trigger = this.#root.querySelector?.(`[data-submenu-trigger="${activeSubmenu}"]`);
    const rootRect = this.#root.getBoundingClientRect?.();
    const triggerRect = trigger?.getBoundingClientRect?.();
    if (!rootRect || !triggerRect) return;

    const top = clamp(
      triggerRect.top - rootRect.top - 6,
      4,
      Math.max(4, rootRect.height - 188 - 4),
    );
    this.#root.style.setProperty?.("--mn-block-action-submenu-top", `${top}px`);
  }
}

export function createTiptapReactBlockActionMenuView(options) {
  return new TiptapReactBlockActionMenuView(options);
}
