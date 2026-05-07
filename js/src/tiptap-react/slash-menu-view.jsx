import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { PapyroSlashCommandMenu } from "./components/command-menu.jsx";
import {
  commandMenuSidePanel,
  commandMenuSidePanelWidth,
} from "./commands/command-menu-model.js";
import {
  clamp,
  defaultDocument,
  defaultWindow,
  positionFloatingElement,
  setHidden,
  syncMenuActiveDescendant,
  viewportSize,
} from "../tiptap-ui-primitives.js";
import { markdownCommandsLabel } from "../tiptap-i18n.js";

const MAIN_MENU_WIDTH = 224;
const MAIN_MENU_HEIGHT = 390;
const SIDE_PANEL_GAP = 5;

function usableAnchorRect(rect) {
  if (!rect) return false;
  const left = Number(rect.left);
  const top = Number(rect.top);
  const right = Number(rect.right);
  const bottom = Number(rect.bottom);
  if (![left, top, right, bottom].every(Number.isFinite)) return false;
  return Math.abs(left) + Math.abs(top) > 0 || right > left || bottom > top;
}

function placeMenu(element, editor, range, anchorRect = null, placement = "bottom") {
  if (element && usableAnchorRect(anchorRect)) {
    positionFloatingElement(element, anchorRect, {
      viewport: viewportSize(editor?.view?.dom, defaultWindow(editor?.view?.dom?.ownerDocument)),
      size: {
        width: MAIN_MENU_WIDTH,
        height: MAIN_MENU_HEIGHT,
        margin: 10,
      },
      placement,
    });
    return;
  }

  const view = editor?.view;
  if (!element || !view || typeof view.coordsAtPos !== "function" || !range) {
    return;
  }

  const rect = view.coordsAtPos(range.to);
  const fallbackRect = usableAnchorRect(rect) ? rect : anchorRect;
  if (!usableAnchorRect(fallbackRect)) return;

  positionFloatingElement(element, fallbackRect, {
    viewport: viewportSize(view.dom, defaultWindow(view.dom?.ownerDocument)),
    size: {
      width: MAIN_MENU_WIDTH,
      height: MAIN_MENU_HEIGHT,
      margin: 10,
    },
    placement: "bottom",
  });
}

function commandItemByIndex(root, index) {
  if (!root || !Number.isInteger(index)) return null;
  try {
    return root.querySelector?.(`[data-command-index="${index}"]`) ?? null;
  } catch (_error) {
    return null;
  }
}

function activePanelHeight(panel) {
  if (panel === "table") return 166;
  if (panel === "callout") return 188;
  if (panel === "code-language") return 286;
  return 0;
}

export class TiptapReactSlashMenuView {
  #document;
  #ownerId;
  #root = null;
  #reactRoot = null;
  #language = "english";

  constructor({ document = defaultDocument(), ownerId = "mn-tiptap-slash-menu" } = {}) {
    this.#document = document;
    this.#ownerId = ownerId;
  }

  mount(container) {
    if (this.#root || !this.#document) return;

    const root = this.#document.createElement?.("div") ?? null;
    if (!root) return;

    root.id = this.#ownerId;
    root.className = "mn-tiptap-slash-menu hidden";
    root.role = "listbox";
    root.setAttribute("aria-label", markdownCommandsLabel(this.#language));
    root.dataset.sidePanel = "none";
    root.dataset.sidePlacement = "right";
    (container?.ownerDocument?.body ?? this.#document.body)?.appendChild(root);

    this.#root = root;
    this.#reactRoot = createRoot(root);
    setHidden(root, true);
  }

  update(state, editor) {
    if (!this.#root || !this.#reactRoot || !state?.open) return;

    this.#language = state.language ?? "english";
    this.#root.setAttribute("aria-label", markdownCommandsLabel(this.#language));
    this.#root.dataset.sidePanel = commandMenuSidePanel(
      state.commands?.[state.selectedIndex],
    );

    flushSync(() => {
      this.#reactRoot.render(
        <PapyroSlashCommandMenu
          ownerId={this.#ownerId}
          state={state}
          language={this.#language}
        />,
      );
    });

    setHidden(this.#root, false);
    syncMenuActiveDescendant(this.#root, this.#ownerId, state.commands, state.selectedIndex, {
      ariaSelected: true,
      scroll: false,
    });
    placeMenu(this.#root, editor, state.range, state.anchorRect, state.placement);
    this.#syncSidePanelPlacement(state, editor);
  }

  updateSelection(state, options = {}, editor = null) {
    if (!this.#root || !this.#reactRoot || !state?.open) return false;

    this.update(state, editor);
    syncMenuActiveDescendant(this.#root, this.#ownerId, state.commands, state.selectedIndex, {
      ariaSelected: true,
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

  #syncSidePanelPlacement(state, editor) {
    if (!this.#root) return;
    const selectedCommand = state.commands?.[state.selectedIndex];
    const panel = commandMenuSidePanel(selectedCommand);
    const panelWidth = commandMenuSidePanelWidth(panel);
    if (!panelWidth) {
      this.#root.dataset.sidePlacement = "right";
      return;
    }

    const selectedItem = commandItemByIndex(this.#root, state.selectedIndex);
    const rootRect = this.#root.getBoundingClientRect?.();
    const itemRect = selectedItem?.getBoundingClientRect?.();
    if (rootRect && itemRect) {
      const top = clamp(
        itemRect.top - rootRect.top - 6,
        4,
        Math.max(4, rootRect.height - activePanelHeight(panel) - 4),
      );
      this.#root.style.setProperty?.("--mn-slash-side-panel-top", `${top}px`);
    }

    const rect = this.#root.getBoundingClientRect?.();
    const viewport = viewportSize(
      editor?.view?.dom,
      defaultWindow(editor?.view?.dom?.ownerDocument),
    );
    const neededWidth = panelWidth + SIDE_PANEL_GAP + 10;
    const shouldFlip =
      rect &&
      rect.right + neededWidth > viewport.width &&
      rect.left - neededWidth > 10;
    this.#root.dataset.sidePlacement = shouldFlip ? "left" : "right";
  }
}

export function createTiptapReactSlashMenuView(options) {
  return new TiptapReactSlashMenuView(options);
}
