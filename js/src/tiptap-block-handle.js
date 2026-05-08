import {
  blockHandleActionsLabel,
  blockHandleInsertLabel,
} from "./tiptap-i18n.js";
import {
  createElement,
  defaultDocument,
  defaultWindow,
  mountFloatingRoot,
  setHidden,
} from "./tiptap-ui-primitives.js";
import {
  createTiptapBlockMove,
  moveTiptapBlock,
  targetEndPos,
} from "./tiptap-block-move.js";

export {
  createTiptapBlockMove,
  moveTiptapBlock,
} from "./tiptap-block-move.js";

const BLOCK_SELECTOR = [
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "li",
  "ol",
  "p",
  "pre",
  "table",
  "ul",
  "[data-type]",
].join(",");
const COMPLEX_BLOCK_SELECTOR = [
  ".mn-tiptap-table",
  ".mn-tiptap-code-block",
  ".mn-tiptap-image",
  ".mn-tiptap-math-block",
  ".mn-tiptap-mermaid-block",
  ".mn-mermaid-block",
  "table",
  "pre",
  "[data-mn-math='block']",
  "[data-mn-mermaid='block']",
].join(",");

const HORIZONTAL_GAP = 22;
const DEFAULT_HANDLE_SIZE = 24;
const CONTROL_GAP = 8;
const BRIDGE_PADDING = 24;
const SELECTED_CLASS = "mn-tiptap-block-selected";
const DRAGGING_CLASS = "mn-tiptap-block-dragging";
const DRAG_THRESHOLD_PX = 10;
const TABLE_STRUCTURE_NODE_TYPES = new Set(["tableRow", "tableCell", "tableHeader"]);
const PARAGRAPH_SLASH_NODE = Object.freeze({
  type: "paragraph",
  content: [{ type: "text", text: "/" }],
});

function isElement(value) {
  return value && (value.nodeType === 1 || typeof value.closest === "function");
}

function elementFromTarget(target) {
  if (isElement(target)) return target;
  return target?.parentElement ?? (isElement(target?.parentNode) ? target.parentNode : null);
}

function closestBlockElement(target, editorDom) {
  const element = elementFromTarget(target);
  if (!isElement(element) || !isElement(editorDom)) {
    return null;
  }

  const complexBlock = element.closest?.(COMPLEX_BLOCK_SELECTOR) ?? null;
  if (
    complexBlock &&
    complexBlock !== editorDom &&
    editorDom.contains?.(complexBlock)
  ) {
    return complexBlock;
  }

  const block = element.closest?.(BLOCK_SELECTOR) ?? null;
  if (!block || block === editorDom || !editorDom.contains?.(block)) {
    return null;
  }

  const listItem = block.closest?.("li") ?? null;
  if (listItem && listItem !== editorDom && editorDom.contains?.(listItem)) {
    return listItem;
  }

  return block;
}

function blockPosition(editor, block) {
  if (!editor?.view || typeof editor.view.posAtDOM !== "function" || !block) {
    return null;
  }

  try {
    const pos = editor.view.posAtDOM(block, 0);
    return Number.isFinite(pos) ? pos : null;
  } catch (_error) {
    return null;
  }
}

function blockNode(editor, block, pos) {
  if (Number.isFinite(pos)) {
    const node = editor?.state?.doc?.nodeAt?.(pos);
    if (node) return node;
  }
  return block?.pmViewDesc?.node ?? null;
}

function blockKind(block) {
  const tagName = String(block?.tagName ?? "").toLowerCase();
  if (block?.classList?.contains?.("mn-tiptap-table") || tagName === "table") {
    return "table";
  }
  if (block?.classList?.contains?.("mn-tiptap-code-block") || tagName === "pre") {
    return "code_block";
  }
  if (block?.classList?.contains?.("mn-tiptap-image")) {
    return "image";
  }
  if (
    block?.classList?.contains?.("mn-tiptap-math-block") ||
    block?.getAttribute?.("data-mn-math") === "block"
  ) {
    return "math_block";
  }
  if (
    block?.classList?.contains?.("mn-tiptap-mermaid-block") ||
    block?.classList?.contains?.("mn-mermaid-block") ||
    block?.getAttribute?.("data-mn-mermaid") === "block"
  ) {
    return "mermaid_block";
  }
  if (!tagName) return "block";
  if (/^h[1-6]$/.test(tagName)) return "heading";
  if (tagName === "p") return "paragraph";
  if (tagName === "li") return "list_item";
  if (tagName === "ul" || tagName === "ol") return "list";
  if (tagName === "blockquote") return "quote";
  return tagName.replaceAll("-", "_");
}

function blockTargetFromEvent(event, editor) {
  const editorDom = editor?.view?.dom;
  const block = closestBlockElement(event?.target, editorDom);
  if (!block) return null;
  const pos = blockPosition(editor, block);

  return {
    block,
    kind: blockKind(block),
    pos,
    node: blockNode(editor, block, pos),
  };
}

export function blockTargetFromOfficialDragHandle({ editor, node = null, pos = null } = {}) {
  const officialPos = Number(pos);
  if (!editor || !node || !Number.isFinite(officialPos)) {
    return null;
  }

  if (TABLE_STRUCTURE_NODE_TYPES.has(String(node?.type?.name ?? ""))) {
    return null;
  }

  const rawElement = rawElementFromPosition(editor, officialPos);
  const rawTableAncestor = rawElement?.closest?.(".mn-tiptap-table, table") ?? null;
  if (
    rawTableAncestor &&
    rawElement !== rawTableAncestor &&
    !rawElement?.matches?.(".mn-tiptap-table, table")
  ) {
    return null;
  }

  const block = blockElementFromPosition(editor, officialPos);
  if (!block) return null;
  const tableAncestor = block.closest?.(".mn-tiptap-table, table") ?? null;
  if (tableAncestor && tableAncestor !== block) {
    return null;
  }

  return {
    block,
    kind: blockKind(block),
    pos: officialPos,
    node: node ?? blockNode(editor, block, officialPos),
  };
}

function targetEquals(left, right) {
  return left?.block === right?.block && left?.pos === right?.pos && left?.kind === right?.kind;
}

function targetStillMounted(target, editorDom) {
  return isElement(target?.block) && isElement(editorDom) && editorDom.contains?.(target.block);
}

function blockElementFromPosition(editor, pos) {
  const editorDom = editor?.view?.dom;
  if (!isElement(editorDom) || !Number.isFinite(pos)) return null;

  let node = null;
  try {
    node = typeof editor?.view?.nodeDOM === "function" ? editor.view.nodeDOM(pos) : null;
  } catch (_error) {
    node = null;
  }

  const element = isElement(node) ? node : node?.parentElement;
  return closestBlockElement(element, editorDom);
}

function rawElementFromPosition(editor, pos) {
  const editorDom = editor?.view?.dom;
  if (!isElement(editorDom) || !Number.isFinite(pos)) return null;

  try {
    const node = typeof editor?.view?.nodeDOM === "function" ? editor.view.nodeDOM(pos) : null;
    if (!node) return null;
    const element = elementFromTarget(node);
    return isElement(element) && editorDom.contains?.(element) ? element : null;
  } catch (_error) {
    return null;
  }
}

function refreshTargetFromPosition(target, editor) {
  if (targetStillMounted(target, editor?.view?.dom)) return target;

  const block = blockElementFromPosition(editor, target?.pos);
  if (!block) return null;

  return {
    block,
    kind: blockKind(block),
    pos: target.pos,
    node: blockNode(editor, block, target.pos) ?? target.node,
  };
}

function visibleBlockRange(target) {
  const from = target?.pos;
  if (!Number.isFinite(from)) return null;

  const node = target?.node ?? target?.block?.pmViewDesc?.node ?? null;
  const nodeSize = Number(node?.nodeSize);
  if (Number.isFinite(nodeSize) && nodeSize > 1) {
    const to = from + nodeSize;
    const contentSize = Number(node?.content?.size);
    const isTextblock = node?.isTextblock === true;
    if (isTextblock) {
      const contentFrom = from + 1;
      const contentTo = contentFrom + Math.max(0, Number.isFinite(contentSize) ? contentSize : nodeSize - 2);
      return contentTo > contentFrom
        ? { from: contentFrom, to: contentTo }
        : { from: contentFrom, to: contentFrom };
    }
    return { from, to };
  }

  const to = targetEndPos(target);
  return Number.isFinite(to) && to > from ? { from, to } : null;
}

function selectDomBlock(target) {
  const documentRef = target?.block?.ownerDocument ?? null;
  const selection = documentRef?.getSelection?.();
  const range = documentRef?.createRange?.();
  if (!selection || !range || !target?.block) return false;

  try {
    if (target?.node?.isTextblock === true) {
      range.selectNodeContents(target.block);
    } else {
      range.selectNode(target.block);
    }
    selection.removeAllRanges?.();
    selection.addRange?.(range);
    return true;
  } catch (_error) {
    return false;
  }
}

function pointerAnchorRect(event, fallbackRect = null) {
  const x = Number(event?.clientX);
  const y = Number(event?.clientY);
  if (Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) + Math.abs(y) > 0) {
    return {
      left: x,
      top: y,
      right: x,
      bottom: y,
      width: 0,
      height: 0,
    };
  }
  return fallbackRect;
}

export function insertSlashParagraphAfterBlock(editor, target) {
  const position = targetEndPos(target);
  if (!Number.isFinite(position)) return null;

  const inserted = editor?.commands?.insertContentAt?.(
    position,
    PARAGRAPH_SLASH_NODE,
    { updateSelection: true },
  );
  if (inserted === false) return null;

  const slashPosition = position + 1;
  if (typeof editor?.commands?.setTextSelection === "function") {
    editor.commands.setTextSelection(slashPosition + 1);
  }

  return {
    from: slashPosition,
    to: slashPosition + 1,
  };
}

function dropTargetFromEvent(event, editor, fallbackDocument) {
  const x = Number(event?.clientX);
  const y = Number(event?.clientY);
  const element =
    Number.isFinite(x) && Number.isFinite(y)
      ? fallbackDocument?.elementFromPoint?.(x, y)
      : null;
  return blockTargetFromEvent({ target: element ?? event?.target }, editor);
}

export function blockDropPlacement(target, clientY) {
  const rect = target?.block?.getBoundingClientRect?.();
  if (!target || !rect || !Number.isFinite(target.pos)) return null;

  const y = Number(clientY);
  const midpoint = rect.top + rect.height / 2;
  const placement = Number.isFinite(y) && y < midpoint ? "before" : "after";
  const pos = placement === "before" ? target.pos : targetEndPos(target);
  if (!Number.isFinite(pos)) return null;

  return {
    target,
    placement,
    pos,
    rect,
  };
}

class TiptapBlockHandleView {
  #document;
  #window;
  #root = null;
  #insertButton = null;
  #actionButton = null;
  #dropIndicator = null;
  #onAction = null;
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
    const insertButton = createElement(
      this.#document,
      "button",
      "mn-tiptap-block-handle-button mn-tiptap-block-handle-insert",
    );
    const insertIcon = createElement(this.#document, "span", "mn-tiptap-block-insert-icon");
    const actionButton = createElement(
      this.#document,
      "button",
      "mn-tiptap-block-handle-button mn-tiptap-block-handle-action",
    );
    const icon = createElement(this.#document, "span", "mn-tiptap-block-handle-icon");
    const dropIndicator = createElement(this.#document, "div", "mn-tiptap-block-drop-indicator hidden");
    if (!root || !insertButton || !insertIcon || !actionButton || !icon || !dropIndicator) return;

    dropIndicator.style.position = "fixed";
    dropIndicator.style.zIndex = "154";
    dropIndicator.style.height = "2px";
    dropIndicator.style.borderRadius = "999px";
    dropIndicator.style.background = "var(--mn-accent)";
    dropIndicator.style.boxShadow = "0 0 0 3px var(--mn-accent-wash)";
    dropIndicator.style.pointerEvents = "none";

    insertButton.type = "button";
    insertButton.addEventListener("pointerdown", (event) => {
      if (event.button && event.button !== 0) {
        event.preventDefault();
        event.stopPropagation?.();
        this.#insertPointerHandled = false;
        return;
      }
      event.preventDefault();
      event.stopPropagation?.();
      const handled = this.#onInsert?.(event);
      this.#insertPointerHandled = typeof this.#onInsert === "function" && handled !== false;
    });
    insertButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation?.();
      if (!this.#insertPointerHandled) {
        this.#onInsert?.(event);
      }
      this.#insertPointerHandled = false;
    });
    insertButton.addEventListener("auxclick", (event) => {
      event.preventDefault();
      event.stopPropagation?.();
    });
    insertButton.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation?.();
    });

    actionButton.type = "button";
    actionButton.addEventListener("pointerdown", (event) => {
      if (event.button === 2) {
        event.preventDefault();
        event.stopPropagation?.();
        const handled = this.#onContextAction?.(event);
        this.#actionContextPointerHandled =
          typeof this.#onContextAction === "function" && handled !== false;
        return;
      }
      if (event.button && event.button !== 0) {
        event.preventDefault();
        event.stopPropagation?.();
        return;
      }
      event.preventDefault();
      event.stopPropagation?.();
      const started = this.#onDragStart?.(event);
      this.#actionPointerStarted =
        typeof this.#onDragStart === "function" && started !== false;
      this.#actionPointerOpened = false;
    });
    actionButton.addEventListener("pointerup", (event) => {
      if (event.button && event.button !== 0) {
        event.preventDefault();
        event.stopPropagation?.();
        this.#actionPointerStarted = false;
        this.#actionPointerOpened = false;
        return;
      }
      event.preventDefault();
      event.stopPropagation?.();
      const released =
        this.#actionPointerStarted && this.#onActionRelease?.(event) !== false;
      this.#actionPointerStarted = false;
      if (!released && !this.#actionPointerOpened) {
        this.#onActionClick?.(event);
      }
      this.#actionPointerOpened = false;
    });
    actionButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation?.();
      if (this.#actionPointerStarted) {
        this.#actionPointerStarted = false;
        this.#actionPointerOpened = false;
        return;
      }
      if (!this.#actionPointerOpened) {
        this.#onActionClick?.(event);
      }
      this.#actionPointerOpened = false;
    });
    actionButton.addEventListener("auxclick", (event) => {
      event.preventDefault();
      event.stopPropagation?.();
    });
    actionButton.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation?.();
      if (!this.#actionContextPointerHandled) {
        this.#onContextAction?.(event);
      }
      this.#actionContextPointerHandled = false;
    });
    root.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation?.();
    });

    insertButton.appendChild(insertIcon);
    actionButton.appendChild(icon);
    root.append(insertButton, actionButton);
    mountFloatingRoot(root, container, this.#document);
    mountFloatingRoot(dropIndicator, container, this.#document);

    this.#root = root;
    this.#insertButton = insertButton;
    this.#actionButton = actionButton;
    this.#dropIndicator = dropIndicator;
    setHidden(root, true);
    setHidden(dropIndicator, true);
  }

  update(state) {
    if (!this.#root || !this.#actionButton || !state.open || !state.target?.block) return;

    this.#onAction = state.openActions ?? null;
    this.#onContextAction = state.openActions ?? null;
    this.#onActionRelease = state.releaseAction ?? null;
    this.#onActionClick = state.clickAction ?? null;
    this.#onInsert = state.openInsert ?? null;
    this.#onDragStart = state.startDrag ?? null;
    const rect = state.target.block.getBoundingClientRect?.();
    if (!rect) return;

    const viewportWidth =
      state.target.block.ownerDocument?.documentElement?.clientWidth ??
      this.#window?.innerWidth ??
      1024;
    const size = this.#actionButton.offsetWidth || DEFAULT_HANDLE_SIZE;
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
    this.#insertButton.title = state.labels?.insert ?? "Insert block below";
    this.#insertButton.setAttribute(
      "aria-label",
      state.labels?.insert ?? "Insert block below",
    );
    this.#actionButton.title = state.labels?.actions ?? "Block actions";
    this.#actionButton.setAttribute(
      "aria-label",
      state.labels?.actions ?? "Block actions",
    );
    this.#root.style.left = `${left}px`;
    this.#root.style.top = `${top}px`;
    this.#root.style.width = `${bridgeWidth + BRIDGE_PADDING}px`;
    this.#root.style.setProperty("--mn-block-handle-bridge", `${BRIDGE_PADDING}px`);
    this.#actionButton.style.cursor = state.dragging ? "grabbing" : "grab";
    setHidden(this.#root, false);
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
    return this.#actionButton?.getBoundingClientRect?.() ?? this.#root?.getBoundingClientRect?.();
  }

  insertRect() {
    return this.#insertButton?.getBoundingClientRect?.() ?? this.#root?.getBoundingClientRect?.();
  }

  hide() {
    setHidden(this.#root, true);
    setHidden(this.#dropIndicator, true);
  }

  destroy() {
    this.#root?.remove?.();
    this.#dropIndicator?.remove?.();
    this.#root = null;
    this.#insertButton = null;
    this.#actionButton = null;
    this.#dropIndicator = null;
  }
}

export class TiptapBlockHandleController {
  #view;
  #menu;
  #insertMenu;
  #editor = null;
  #entry = null;
  #root = null;
  #removeListeners = [];
  #drag = null;
  #officialNativeDrag = false;
  #selectedBlock = null;
  #officialTrackingActive = false;
  #officialDragHandleLocked = false;
  #viewStateListeners = new Set();
  #state = {
    open: false,
    target: null,
  };

  constructor({ menu = null, insertMenu = null, view = null, dom = {} } = {}) {
    this.#menu = menu;
    this.#insertMenu = insertMenu;
    this.#view =
      view ??
      new TiptapBlockHandleView({
        document: dom.document ?? defaultDocument(),
        window: dom.window,
      });
  }

  get state() {
    return {
      open: this.#state.open,
      target: this.#state.target
        ? {
            kind: this.#state.target.kind,
            pos: this.#state.target.pos,
            block: this.#state.target.block,
          }
        : null,
    };
  }

  get viewState() {
    return this.#currentViewState();
  }

  subscribeViewState(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }

    this.#viewStateListeners.add(listener);
    listener(this.viewState);
    return () => {
      this.#viewStateListeners.delete(listener);
    };
  }

  contains(target) {
    return (
      this.#view.contains?.(target) ||
      this.#menu?.contains?.(target) ||
      this.#insertMenu?.contains?.(target) ||
      false
    );
  }

  shouldKeepOpenOnEditorBlur(activeElement = null) {
    return Boolean(
      this.contains(activeElement) ||
        this.#drag ||
        (this.#state.open && this.#hasOpenFloatingMenu()),
    );
  }

  attach({ editor, root, entry } = {}) {
    this.#editor = editor ?? null;
    this.#entry = entry ?? null;
    this.#root = root ?? editor?.view?.dom ?? null;
    this.#officialTrackingActive = false;
    this.#view.mount?.(root);
    this.#menu?.attach?.({ editor, root, entry });
    this.#menu?.setExternalContains?.((target) => this.#view.contains?.(target));
    this.#menu?.setOpenStateListener?.(() => this.#syncFloatingMenuState());
    this.#insertMenu?.setExternalContains?.((target) => this.#view.contains?.(target));
    this.#insertMenu?.setOpenStateListener?.(() => this.#syncFloatingMenuState());
    this.#bind();
  }

  #bind() {
    this.#unbind();
    const listenTarget = this.#root;
    if (!listenTarget?.addEventListener) return;

    const onMouseMove = (event) => this.handlePointerMove(event);
    const onMouseLeave = (event) => {
      if (this.contains(event?.relatedTarget)) return;
      if (this.#hasOpenFloatingMenu()) {
        this.#updateView();
        return;
      }
      if (this.#state.open && this.#view.containsPointer?.(event, this.#state.target)) {
        this.#updateView();
        return;
      }
      this.close();
    };
    const onScroll = () => {
      if (!this.#hasOpenFloatingMenu()) {
        this.close();
        return;
      }

      const liveTarget = refreshTargetFromPosition(this.#state.target, this.#editor);
      if (liveTarget) {
        this.#state = {
          ...this.#state,
          target: liveTarget,
        };
        this.#updateView();
      } else if (this.#hasOpenFloatingMenu()) {
        this.#view.hide?.();
      } else {
        this.close();
      }
    };
    const onKeyDown = (event) => this.handleKeyDown(event);
    const onContextMenu = (event) => this.handleContextMenu(event);

    listenTarget.addEventListener("mousemove", onMouseMove);
    listenTarget.addEventListener("mouseleave", onMouseLeave);
    listenTarget.addEventListener("scroll", onScroll, true);
    listenTarget.addEventListener("keydown", onKeyDown);
    listenTarget.addEventListener("contextmenu", onContextMenu, true);
    this.#removeListeners = [
      () => listenTarget.removeEventListener?.("mousemove", onMouseMove),
      () => listenTarget.removeEventListener?.("mouseleave", onMouseLeave),
      () => listenTarget.removeEventListener?.("scroll", onScroll, true),
      () => listenTarget.removeEventListener?.("keydown", onKeyDown),
      () => listenTarget.removeEventListener?.("contextmenu", onContextMenu, true),
    ];
  }

  #unbind() {
    this.#removeListeners.forEach((remove) => remove());
    this.#removeListeners = [];
  }

  handlePointerMove(event) {
    if (this.#drag) {
      return this.state;
    }

    if (!this.#editor || this.#entry?.viewMode !== "hybrid") {
      this.close();
      return this.state;
    }

    if (this.#officialTrackingActive) {
      if (
        this.#state.open &&
        (this.#view.contains?.(event?.target) ||
          this.#view.containsPointer?.(event, this.#state.target))
      ) {
        this.#updateView();
      }
      return this.state;
    }

    if (this.#hasOpenFloatingMenu()) {
      const liveTarget = refreshTargetFromPosition(this.#state.target, this.#editor);
      if (liveTarget) {
        this.#state = {
          ...this.#state,
          target: liveTarget,
        };
        this.#updateView();
      } else if (this.#hasOpenFloatingMenu()) {
        this.#view.hide?.();
      } else {
        this.close();
      }
      return this.state;
    }

    const target = blockTargetFromEvent(event, this.#editor);
    if (!target) {
      if (
        this.#state.open &&
        (this.#view.contains?.(event?.target) ||
          this.#view.containsPointer?.(event, this.#state.target))
      ) {
        this.#updateView();
        return this.state;
      }
      this.close();
      return this.state;
    }

    if (targetEquals(this.#state.target, target) && this.#state.open) {
      this.#updateView();
      return this.state;
    }

    this.#state = {
      open: true,
      target,
    };
    this.#updateView();
    return this.state;
  }

  handleOfficialNodeChange(data = {}) {
    if (this.#drag) {
      return this.state;
    }

    this.#officialTrackingActive = true;

    if (!this.#editor || this.#entry?.viewMode !== "hybrid") {
      this.close();
      return this.state;
    }

    if (this.#hasOpenFloatingMenu()) {
      const liveTarget = refreshTargetFromPosition(this.#state.target, this.#editor);
      if (liveTarget) {
        this.#state = {
          ...this.#state,
          target: liveTarget,
        };
        this.#updateView();
      } else {
        this.#view.hide?.();
      }
      return this.state;
    }

    const target = blockTargetFromOfficialDragHandle({
      editor: this.#editor,
      node: data.node,
      pos: data.pos,
    });

    if (!target) {
      this.close();
      return this.state;
    }

    if (targetEquals(this.#state.target, target) && this.#state.open) {
      this.#updateView();
      return this.state;
    }

    this.#state = {
      open: true,
      target,
    };
    this.#updateView();
    return this.state;
  }

  openActions(event = null) {
    return this.#openActions({
      anchorRect: pointerAnchorRect(event, this.#view.actionRect?.()),
    });
  }

  #openActions({ anchorRect = null } = {}) {
    if (!this.#state.open || !this.#state.target || this.#entry?.viewMode !== "hybrid") {
      return false;
    }
    this.#selectTarget(this.#state.target);
    this.#insertMenu?.close?.();
    this.#menu?.open?.(this.#state.target, {
      anchorRect: anchorRect ?? this.#view.actionRect?.(),
    });
    this.#syncFloatingMenuState();
    return true;
  }

  openInsert(event = null) {
    if (!this.#state.open || !this.#state.target || this.#entry?.viewMode !== "hybrid") {
      return false;
    }

    this.#selectTarget(this.#state.target);
    this.#menu?.close?.();
    const opened = this.#insertMenu?.openAtBlock?.(this.#state.target, {
      anchorRect: pointerAnchorRect(event, this.#view.insertRect?.()),
    }) !== false;
    this.#syncFloatingMenuState();
    return opened;
  }

  clickAction(event = null) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (this.#menu?.state?.open === true) return true;
    if (this.#drag) return this.finishDrag(event);
    return this.#openActions({
      anchorRect: pointerAnchorRect(event, this.#view.actionRect?.()),
    });
  }

  releaseAction(event = null) {
    if (this.#drag) return this.finishDrag(event);
    return this.clickAction(event);
  }

  startDrag(event) {
    if (!this.#state.open || !this.#state.target || this.#entry?.viewMode !== "hybrid") {
      return false;
    }

    if (event?.button === 2) {
      event.preventDefault?.();
      event.stopPropagation?.();
      return this.#openActions({ anchorRect: pointerAnchorRect(event, this.#view.actionRect?.()) });
    }

    if (event?.button && event.button !== 0) {
      event.preventDefault?.();
      event.stopPropagation?.();
      return false;
    }

    const x = Number(event?.clientX);
    const y = Number(event?.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return false;
    }

    this.#selectTarget(this.#state.target);
    this.#insertMenu?.close?.();
    this.#drag = {
      source: this.#state.target,
      startX: x,
      startY: y,
      moved: false,
      drop: null,
      anchorRect: pointerAnchorRect(event, this.#view.actionRect?.()),
    };
    this.#bindDragListeners();
    this.#updateView();
    return true;
  }

  startOfficialNativeDrag(event = null) {
    if (!this.#state.open || !this.#state.target || this.#entry?.viewMode !== "hybrid") {
      return false;
    }

    this.#officialNativeDrag = true;
    this.#selectTarget(this.#state.target);
    this.#menu?.close?.();
    this.#insertMenu?.close?.();
    this.#syncFloatingMenuState();
    event?.stopPropagation?.();
    this.#updateView();
    return true;
  }

  finishOfficialNativeDrag() {
    if (!this.#officialNativeDrag) return false;
    this.#officialNativeDrag = false;
    this.#view.updateDrag?.({ open: false, drop: null });
    this.#clearSelectedBlock();
    this.#updateView();
    return true;
  }

  handleDragMove(event) {
    if (!this.#drag || !this.#editor || this.#entry?.viewMode !== "hybrid") {
      return this.state;
    }

    const x = Number(event?.clientX);
    const y = Number(event?.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return this.state;
    }

    const distance = Math.hypot(x - this.#drag.startX, y - this.#drag.startY);
    if (!this.#drag.moved && distance < DRAG_THRESHOLD_PX) {
      return this.state;
    }

    if (!this.#drag.moved) {
      this.#menu?.close?.();
      this.#insertMenu?.close?.();
      this.#syncFloatingMenuState();
      this.#root?.classList?.add?.(DRAGGING_CLASS);
    }
    this.#drag.moved = true;
    event?.preventDefault?.();
    const documentRef = this.#root?.ownerDocument ?? defaultDocument();
    const target = dropTargetFromEvent(event, this.#editor, documentRef);
    const drop = blockDropPlacement(target, y);
    this.#drag.drop =
      createTiptapBlockMove(this.#editor, this.#drag.source, drop) !== null ? drop : null;
    this.#view.updateDrag?.({
      open: this.#drag.moved && !!this.#drag.drop,
      source: this.#drag.source,
      drop: this.#drag.drop,
    });
    return this.state;
  }

  finishDrag(event) {
    if (!this.#drag) return false;

    const drag = this.#drag;
    const moved = drag.moved;
    const drop = drag.drop;
    this.#cleanupDrag();

    if (!moved) {
      event?.preventDefault?.();
      if (this.#menu?.state?.open !== true) {
        this.#openActions({ anchorRect: drag.anchorRect });
      }
      return true;
    }

    event?.preventDefault?.();
    const ok = moveTiptapBlock(this.#editor, drag.source, drop);
    this.close();
    return ok;
  }

  #bindDragListeners() {
    const documentRef = this.#root?.ownerDocument ?? defaultDocument();
    if (!documentRef?.addEventListener) return;

    const onMove = (event) => this.handleDragMove(event);
    const onEnd = (event) => this.finishDrag(event);
    const onCancel = () => this.cancelDrag();
    documentRef.addEventListener("pointermove", onMove, true);
    documentRef.addEventListener("pointerup", onEnd, true);
    documentRef.addEventListener("pointercancel", onCancel, true);
    this.#drag.removeListeners = [
      () => documentRef.removeEventListener?.("pointermove", onMove, true),
      () => documentRef.removeEventListener?.("pointerup", onEnd, true),
      () => documentRef.removeEventListener?.("pointercancel", onCancel, true),
    ];
  }

  cancelDrag() {
    if (!this.#drag) return false;
    this.#cleanupDrag();
    this.#view.updateDrag?.({ open: false, drop: null });
    return true;
  }

  #cleanupDrag() {
    this.#drag?.removeListeners?.forEach?.((remove) => remove());
    this.#drag = null;
    this.#root?.classList?.remove?.(DRAGGING_CLASS);
    this.#view.updateDrag?.({ open: false, drop: null });
    this.#updateView();
  }

  handleKeyDown(event) {
    return (
      this.#insertMenu?.handleKeyDown?.(event) ??
      this.#menu?.handleKeyDown?.(event) ??
      false
    );
  }

  handleContextMenu(event) {
    if (!this.#editor || this.#entry?.viewMode !== "hybrid") return false;
    const target = blockTargetFromEvent(event, this.#editor);
    if (!target) return false;

    event?.preventDefault?.();
    event?.stopPropagation?.();
    this.#state = {
      open: true,
      target,
    };
    this.#updateView();
    return this.#openActions({ anchorRect: pointerAnchorRect(event, target.block.getBoundingClientRect?.()) });
  }

  refresh() {
    if (!this.#state.open || this.#entry?.viewMode !== "hybrid") {
      this.close();
      return this.state;
    }

    this.#updateView();
    return this.state;
  }

  #updateView() {
    const liveTarget = refreshTargetFromPosition(this.#state.target, this.#editor);
    if (liveTarget) {
      this.#state = {
        ...this.#state,
        target: liveTarget,
      };
    } else if (this.#state.open && this.#hasOpenFloatingMenu()) {
      this.#view.hide?.();
      return;
    }

    const viewState = this.#currentViewState();
    this.#view.update?.(viewState, this.#editor);
    this.#publishViewState(viewState);
  }

  #publishViewState(viewState = this.#currentViewState()) {
    this.#viewStateListeners.forEach((listener) => listener(viewState));
  }

  #currentViewState() {
    const language = this.#entry?.preferences?.language ?? "english";
    const target = this.#state.target
      ? {
          ...this.#state.target,
          actionRect: () => this.#view.actionRect?.(),
          insertRect: () => this.#view.insertRect?.(),
        }
      : null;

    return {
      ...this.#state,
      target,
      labels: {
        insert: blockHandleInsertLabel(language),
        actions: blockHandleActionsLabel(language),
      },
      dragging: !!this.#drag,
      officialDragging: this.#officialNativeDrag,
      menuOpen: this.#menu?.state?.open === true,
      insertOpen: this.#insertMenu?.state?.open === true,
      officialTracking: this.#officialTrackingActive,
      floatingViewHidden: this.#officialTrackingActive && !this.#hasOpenFloatingMenu(),
      openActions: (event) => this.openActions(event),
      openInsert: (event) => this.openInsert(event),
      startDrag: (event) => this.startDrag(event),
      releaseAction: (event) => this.releaseAction(event),
      clickAction: (event) => this.clickAction(event),
      onInsertPointerDown: (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        this.openInsert(event);
      },
      onInsertClick: (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
      },
      onInsertContextMenu: (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
      },
      onActionPointerDown: (event) => this.startDrag(event),
      onActionPointerUp: (event) => this.releaseAction(event),
      onActionClick: (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
      },
      onActionContextMenu: (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        this.openActions(event);
      },
      onAuxClick: (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
      },
    };
  }

  #selectTarget(target) {
    this.#clearSelectedBlock();
    target?.block?.classList?.add?.(SELECTED_CLASS);
    this.#selectedBlock = target?.block ?? null;

    const from = target?.pos;
    const range = visibleBlockRange(target);
    if (Number.isFinite(from)) {
      let selected = false;
      if (typeof this.#editor?.commands?.setNodeSelection === "function") {
        selected = this.#editor.commands.setNodeSelection(from) !== false;
      }
      if (!selected && Number.isFinite(range?.from) && Number.isFinite(range?.to) && range.to > range.from) {
        selected = this.#editor?.commands?.setTextSelection?.(range) !== false;
      }
      if (!selected) {
        this.#editor?.commands?.setTextSelection?.(from);
      }
    }
    this.#editor?.commands?.focus?.();
    selectDomBlock(target);
  }

  #clearSelectedBlock() {
    this.#selectedBlock?.classList?.remove?.(SELECTED_CLASS);
    this.#selectedBlock = null;
    this.#root
      ?.querySelectorAll?.(`.${SELECTED_CLASS}`)
      ?.forEach?.((block) => block.classList.remove(SELECTED_CLASS));
  }

  #hasOpenFloatingMenu() {
    return this.#menu?.state?.open === true || this.#insertMenu?.state?.open === true;
  }

  #syncOfficialDragHandleLock() {
    const shouldLock =
      this.#state.open &&
      this.#entry?.viewMode === "hybrid" &&
      this.#hasOpenFloatingMenu();
    return this.#setOfficialDragHandleLocked(shouldLock);
  }

  #setOfficialDragHandleLocked(locked) {
    if (this.#officialDragHandleLocked === locked) {
      return false;
    }

    const commands = this.#editor?.commands;
    let ok = false;
    if (locked && typeof commands?.lockDragHandle === "function") {
      ok = commands.lockDragHandle() !== false;
    } else if (!locked && typeof commands?.unlockDragHandle === "function") {
      ok = commands.unlockDragHandle() !== false;
    }

    if (!ok && typeof commands?.setMeta === "function") {
      ok = commands.setMeta("lockDragHandle", locked) !== false;
    }

    if (ok) {
      this.#officialDragHandleLocked = locked;
    }
    return ok;
  }

  #syncFloatingMenuState() {
    this.#syncOfficialDragHandleLock();
    if (this.#state.open) {
      this.#updateView();
    } else {
      this.#publishViewState();
    }
  }

  close() {
    this.cancelDrag();
    if (!this.#state.open) return;
    this.#clearSelectedBlock();
    this.#state = {
      open: false,
      target: null,
    };
    this.#view.hide?.();
    this.#menu?.close?.();
    this.#insertMenu?.close?.();
    this.#syncOfficialDragHandleLock();
    this.#publishViewState();
  }

  destroy() {
    this.close();
    this.#unbind();
    this.#menu?.setOpenStateListener?.(null);
    this.#insertMenu?.setOpenStateListener?.(null);
    this.#setOfficialDragHandleLocked(false);
    this.#menu?.destroy?.();
    this.#view.destroy?.();
    this.#viewStateListeners.clear();
    this.#editor = null;
    this.#entry = null;
    this.#root = null;
  }
}

export function createTiptapBlockHandleController(options) {
  return new TiptapBlockHandleController(options);
}
