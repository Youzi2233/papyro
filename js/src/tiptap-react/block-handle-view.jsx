import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { PapyroBlockHandle } from "./components/block-handle.jsx";
import {
  defaultDocument,
  defaultWindow,
  mountFloatingRoot,
  setHidden,
} from "../tiptap-ui-primitives.js";

const HORIZONTAL_GAP = 22;
const DEFAULT_HANDLE_SIZE = 24;
const CONTROL_GAP = 8;
const BRIDGE_PADDING = 24;

function createElement(documentRef, tagName, className) {
  const element = documentRef?.createElement?.(tagName) ?? null;
  if (element) element.className = className;
  return element;
}

function stopEvent(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
}

export class TiptapReactBlockHandleView {
  #document;
  #window;
  #root = null;
  #reactRoot = null;
  #dropIndicator = null;
  #officialMode = false;
  #lastState = null;
  #insertButton = null;
  #actionButton = null;
  #onContextAction = null;
  #onActionRelease = null;
  #onActionClick = null;
  #onInsert = null;
  #onDragStart = null;
  #insertPointerHandled = false;
  #actionPointerStarted = false;
  #actionPointerOpened = false;
  #actionContextPointerHandled = false;

  constructor({ document = defaultDocument(), window = defaultWindow(document) } = {}) {
    this.#document = document;
    this.#window = window;
  }

  mount(container) {
    if (this.#root || !this.#document) return;

    const root = createElement(this.#document, "div", "mn-tiptap-block-handle hidden");
    const dropIndicator = createElement(
      this.#document,
      "div",
      "mn-tiptap-block-drop-indicator hidden",
    );
    if (!root || !dropIndicator) return;

    root.addEventListener("contextmenu", stopEvent);
    dropIndicator.style.position = "fixed";
    dropIndicator.style.zIndex = "154";
    dropIndicator.style.height = "2px";
    dropIndicator.style.borderRadius = "999px";
    dropIndicator.style.background = "var(--mn-accent)";
    dropIndicator.style.boxShadow = "0 0 0 3px var(--mn-accent-wash)";
    dropIndicator.style.pointerEvents = "none";

    mountFloatingRoot(root, container, this.#document);
    mountFloatingRoot(dropIndicator, container, this.#document);

    this.#root = root;
    this.#reactRoot = createRoot(root);
    this.#dropIndicator = dropIndicator;
    setHidden(root, true);
    setHidden(dropIndicator, true);
  }

  update(state) {
    if (!this.#root || !this.#reactRoot || !state.open || !state.target?.block) {
      return;
    }

    this.#lastState = state;
    this.#onContextAction = state.openActions ?? null;
    this.#onActionRelease = state.releaseAction ?? null;
    this.#onActionClick = state.clickAction ?? null;
    this.#onInsert = state.openInsert ?? null;
    this.#onDragStart = state.startDrag ?? null;

    this.#officialMode = state.officialTracking === true;
    flushSync(() => {
      this.#reactRoot.render(
        <PapyroBlockHandle
          state={{
            ...state,
            onInsertPointerDown: (event) => this.#handleInsertPointerDown(event),
            onInsertClick: (event) => this.#handleInsertClick(event),
            onInsertContextMenu: (event) => this.#handleInsertContextMenu(event),
            onActionPointerDown: (event) => this.#handleActionPointerDown(event),
            onActionPointerUp: (event) => this.#handleActionPointerUp(event),
            onActionClick: (event) => this.#handleActionClick(event),
            onActionContextMenu: (event) => this.#handleActionContextMenu(event),
            onAuxClick: stopEvent,
          }}
        />,
      );
    });

    this.#insertButton = this.#root.querySelector?.(".mn-tiptap-block-handle-insert") ?? null;
    this.#actionButton = this.#root.querySelector?.(".mn-tiptap-block-handle-action") ?? null;
    this.#position(state);
    setHidden(this.#root, state.floatingViewHidden === true && !state.menuOpen && !state.insertOpen);
  }

  updateDrag(state) {
    if (!this.#dropIndicator) return;
    if (!state?.open || !state.drop?.rect) {
      setHidden(this.#dropIndicator, true);
      return;
    }

    const viewportWidth =
      state.drop.target?.block?.ownerDocument?.documentElement?.clientWidth ??
      this.#window?.innerWidth ??
      1024;
    const rect = state.drop.rect;
    const left = Math.max(8, rect.left);
    const width = Math.max(48, Math.min(rect.width, viewportWidth - left - 8));
    const top = state.drop.placement === "before" ? rect.top : rect.bottom;

    this.#dropIndicator.style.left = `${left}px`;
    this.#dropIndicator.style.top = `${top - 1}px`;
    this.#dropIndicator.style.width = `${width}px`;
    setHidden(this.#dropIndicator, false);
  }

  contains(target) {
    return this.#root?.contains?.(target) ?? false;
  }

  containsPointer(event, target) {
    const handleRect = this.#root?.getBoundingClientRect?.();
    const blockRect = target?.block?.getBoundingClientRect?.();
    if (!handleRect || !blockRect) return false;

    const x = Number(event?.clientX);
    const y = Number(event?.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

    const left = Math.min(handleRect.left, blockRect.left) - 2;
    const right = Math.max(handleRect.right, blockRect.left) + 2;
    const top = Math.min(handleRect.top, blockRect.top) - 8;
    const bottom = Math.max(handleRect.bottom, blockRect.bottom) + 8;
    return x >= left && x <= right && y >= top && y <= bottom;
  }

  actionRect() {
    return this.#actionButton?.getBoundingClientRect?.()
      ?? this.#lastState?.target?.actionRect?.()
      ?? this.#root?.getBoundingClientRect?.();
  }

  insertRect() {
    return this.#insertButton?.getBoundingClientRect?.()
      ?? this.#lastState?.target?.insertRect?.()
      ?? this.#root?.getBoundingClientRect?.();
  }

  hide() {
    setHidden(this.#root, true);
    setHidden(this.#dropIndicator, true);
  }

  destroy() {
    this.#reactRoot?.unmount?.();
    this.#root?.remove?.();
    this.#dropIndicator?.remove?.();
    this.#root = null;
    this.#reactRoot = null;
    this.#insertButton = null;
    this.#actionButton = null;
    this.#dropIndicator = null;
  }

  #position(state) {
    const rect = state.target.block.getBoundingClientRect?.();
    if (!rect) return;

    const viewportWidth =
      state.target.block.ownerDocument?.documentElement?.clientWidth ??
      this.#window?.innerWidth ??
      1024;
    const size = this.#actionButton?.offsetWidth || DEFAULT_HANDLE_SIZE;
    const controlsWidth = size * 2 + CONTROL_GAP;
    const bridgeWidth = controlsWidth + HORIZONTAL_GAP;
    const left = Math.max(
      6,
      Math.min(rect.left - bridgeWidth, viewportWidth - bridgeWidth - 6),
    );
    const top =
      rect.height > size * 1.7
        ? rect.top + 3
        : rect.top + Math.max(0, (rect.height - size) / 2);

    this.#root.dataset.blockKind = state.target.kind;
    this.#root.dataset.dragging = state.dragging ? "true" : "false";
    this.#root.dataset.menuOpen = state.menuOpen ? "true" : "false";
    this.#root.dataset.insertOpen = state.insertOpen ? "true" : "false";
    this.#root.style.left = `${left}px`;
    this.#root.style.top = `${top}px`;
    this.#root.style.width = `${bridgeWidth + BRIDGE_PADDING}px`;
    this.#root.style.setProperty("--mn-block-handle-bridge", `${BRIDGE_PADDING}px`);
  }

  #handleInsertPointerDown(event) {
    if (event.button && event.button !== 0) {
      stopEvent(event);
      this.#insertPointerHandled = false;
      return;
    }
    stopEvent(event);
    const handled = this.#onInsert?.(event);
    this.#insertPointerHandled = typeof this.#onInsert === "function" && handled !== false;
  }

  #handleInsertClick(event) {
    stopEvent(event);
    if (!this.#insertPointerHandled) {
      this.#onInsert?.(event);
    }
    this.#insertPointerHandled = false;
  }

  #handleInsertContextMenu(event) {
    stopEvent(event);
  }

  #handleActionPointerDown(event) {
    if (event.button === 2) {
      stopEvent(event);
      const handled = this.#onContextAction?.(event);
      this.#actionContextPointerHandled =
        typeof this.#onContextAction === "function" && handled !== false;
      return;
    }
    if (event.button && event.button !== 0) {
      stopEvent(event);
      return;
    }
    stopEvent(event);
    const started = this.#onDragStart?.(event);
    this.#actionPointerStarted =
      typeof this.#onDragStart === "function" && started !== false;
    this.#actionPointerOpened = false;
  }

  #handleActionPointerUp(event) {
    if (event.button && event.button !== 0) {
      stopEvent(event);
      this.#actionPointerStarted = false;
      this.#actionPointerOpened = false;
      return;
    }
    stopEvent(event);
    const released =
      this.#actionPointerStarted && this.#onActionRelease?.(event) !== false;
    this.#actionPointerStarted = false;
    if (!released && !this.#actionPointerOpened) {
      this.#onActionClick?.(event);
    }
    this.#actionPointerOpened = false;
  }

  #handleActionClick(event) {
    stopEvent(event);
    if (this.#actionPointerStarted) {
      this.#actionPointerStarted = false;
      this.#actionPointerOpened = false;
      return;
    }
    if (!this.#actionPointerOpened) {
      this.#onActionClick?.(event);
    }
    this.#actionPointerOpened = false;
  }

  #handleActionContextMenu(event) {
    stopEvent(event);
    if (!this.#actionContextPointerHandled) {
      this.#onContextAction?.(event);
    }
    this.#actionContextPointerHandled = false;
  }
}

export function createTiptapReactBlockHandleView(options) {
  return new TiptapReactBlockHandleView(options);
}
