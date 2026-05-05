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

const HORIZONTAL_GAP = 10;
const DEFAULT_HANDLE_SIZE = 28;
const CONTROL_GAP = 4;
const BRIDGE_PADDING = 8;
const SELECTED_CLASS = "mn-tiptap-block-selected";
const DRAGGING_CLASS = "mn-tiptap-block-dragging";
const DRAG_THRESHOLD_PX = 10;
const PARAGRAPH_SLASH_NODE = Object.freeze({
  type: "paragraph",
  content: [{ type: "text", text: "/" }],
});

function isElement(value) {
  return value && value.nodeType === 1;
}

function closestBlockElement(target, editorDom) {
  if (!isElement(target) || !isElement(editorDom)) {
    return null;
  }

  const block = target.closest?.(BLOCK_SELECTOR) ?? null;
  if (!block || block === editorDom || !editorDom.contains?.(block)) {
    return null;
  }

  const table = block.closest?.(".mn-tiptap-table, table") ?? null;
  if (table && table !== editorDom && editorDom.contains?.(table)) {
    return table;
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
  if (!tagName) return "block";
  if (/^h[1-6]$/.test(tagName)) return "heading";
  if (tagName === "p") return "paragraph";
  if (tagName === "li") return "list_item";
  if (tagName === "ul" || tagName === "ol") return "list";
  if (tagName === "pre") return "code_block";
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

function targetEquals(left, right) {
  return left?.block === right?.block && left?.pos === right?.pos && left?.kind === right?.kind;
}

function targetEndPos(target) {
  const nodeSize = target?.node?.nodeSize ?? target?.block?.pmViewDesc?.node?.nodeSize ?? 0;
  return Number.isFinite(target?.pos) ? target.pos + Math.max(1, nodeSize) : null;
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

export function createTiptapBlockMove(editor, source, drop) {
  const state = editor?.state;
  const doc = state?.doc;
  const from = source?.pos;
  const node = source?.node ?? (Number.isFinite(from) ? doc?.nodeAt?.(from) : null);
  const nodeSize = node?.nodeSize ?? 0;
  const to = Number.isFinite(from) ? from + Math.max(1, nodeSize) : null;
  const dropPos = drop?.pos;

  if (
    !state?.tr ||
    !doc ||
    !node ||
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    !Number.isFinite(dropPos) ||
    to <= from
  ) {
    return null;
  }

  if (dropPos >= from && dropPos <= to) {
    return null;
  }

  const insertPos = dropPos > to ? dropPos - (to - from) : dropPos;
  if (!Number.isFinite(insertPos) || insertPos < 0) {
    return null;
  }

  try {
    let tr = state.tr.delete(from, to);
    const resolved = tr.doc?.resolve?.(insertPos);
    if (
      node.type &&
      typeof resolved?.parent?.canReplaceWith === "function" &&
      resolved.parent.canReplaceWith(resolved.index(), resolved.index(), node.type) === false
    ) {
      return null;
    }

    tr = tr.insert(insertPos, node);
    tr = typeof tr.scrollIntoView === "function" ? tr.scrollIntoView() : tr;
    return { tr, pos: insertPos };
  } catch (_error) {
    return null;
  }
}

export function moveTiptapBlock(editor, source, drop) {
  const move = createTiptapBlockMove(editor, source, drop);
  if (!move) return false;

  editor?.view?.dispatch?.(move.tr);
  if (typeof editor?.commands?.setNodeSelection === "function") {
    editor.commands.setNodeSelection(move.pos);
  } else {
    editor?.commands?.setTextSelection?.(move.pos);
  }
  editor?.commands?.focus?.();
  return true;
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
  #onInsert = null;
  #onDragStart = null;

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
        return;
      }
      event.preventDefault();
      event.stopPropagation?.();
      this.#onInsert?.(event);
    });
    insertButton.addEventListener("click", (event) => {
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
        this.#onContextAction?.(event);
        return;
      }
      if (event.button && event.button !== 0) {
        event.preventDefault();
        event.stopPropagation?.();
        return;
      }
      event.preventDefault();
      event.stopPropagation?.();
      this.#onAction?.(event);
      this.#onDragStart?.(event);
    });
    actionButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation?.();
    });
    actionButton.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation?.();
      this.#onAction?.(event);
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
    const top = rect.top + Math.max(0, (rect.height - size) / 2);

    this.#root.dataset.blockKind = state.target.kind;
    this.#root.dataset.dragging = state.dragging ? "true" : "false";
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

  contains(target) {
    return (
      this.#view.contains?.(target) ||
      this.#menu?.contains?.(target) ||
      this.#insertMenu?.contains?.(target) ||
      false
    );
  }

  attach({ editor, root, entry } = {}) {
    this.#editor = editor ?? null;
    this.#entry = entry ?? null;
    this.#root = root ?? editor?.view?.dom ?? null;
    this.#view.mount?.(root);
    this.#menu?.attach?.({ editor, root, entry });
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
    const onScroll = () => this.close();
    const onKeyDown = (event) => this.handleKeyDown(event);

    listenTarget.addEventListener("mousemove", onMouseMove);
    listenTarget.addEventListener("mouseleave", onMouseLeave);
    listenTarget.addEventListener("scroll", onScroll, true);
    listenTarget.addEventListener("keydown", onKeyDown);
    this.#removeListeners = [
      () => listenTarget.removeEventListener?.("mousemove", onMouseMove),
      () => listenTarget.removeEventListener?.("mouseleave", onMouseLeave),
      () => listenTarget.removeEventListener?.("scroll", onScroll, true),
      () => listenTarget.removeEventListener?.("keydown", onKeyDown),
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

    if (this.#hasOpenFloatingMenu()) {
      this.#updateView();
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

  openActions() {
    return this.#openActions();
  }

  #openActions() {
    if (!this.#state.open || !this.#state.target || this.#entry?.viewMode !== "hybrid") {
      return false;
    }
    this.#selectTarget(this.#state.target);
    this.#insertMenu?.close?.();
    this.#menu?.open?.(this.#state.target, { anchorRect: this.#view.actionRect?.() });
    return true;
  }

  openInsert() {
    if (!this.#state.open || !this.#state.target || this.#entry?.viewMode !== "hybrid") {
      return false;
    }

    this.#selectTarget(this.#state.target);
    this.#menu?.close?.();
    return this.#insertMenu?.openAtBlock?.(this.#state.target, {
      anchorRect: this.#view.insertRect?.(),
    }) !== false;
  }

  startDrag(event) {
    if (!this.#state.open || !this.#state.target || this.#entry?.viewMode !== "hybrid") {
      return false;
    }

    if (event?.button === 2) {
      event.preventDefault?.();
      event.stopPropagation?.();
      return this.#openActions();
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

    this.#openActions();
    this.#insertMenu?.close?.();
    this.#drag = {
      source: this.#state.target,
      startX: x,
      startY: y,
      moved: false,
      drop: null,
    };
    this.#root?.classList?.add?.(DRAGGING_CLASS);
    this.#bindDragListeners();
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

    this.#drag.moved = true;
    event?.preventDefault?.();
    this.#menu?.close?.();
    this.#insertMenu?.close?.();
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
      this.#openActions();
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

  refresh() {
    if (!this.#state.open || this.#entry?.viewMode !== "hybrid") {
      this.close();
      return this.state;
    }

    this.#updateView();
    return this.state;
  }

  #updateView() {
    const language = this.#entry?.preferences?.language ?? "english";
    this.#view.update?.(
      {
        ...this.#state,
        labels: {
          insert: blockHandleInsertLabel(language),
          actions: blockHandleActionsLabel(language),
        },
        dragging: !!this.#drag,
        openActions: () => this.openActions(),
        openInsert: () => this.openInsert(),
        startDrag: (event) => this.startDrag(event),
      },
      this.#editor,
    );
  }

  #selectTarget(target) {
    this.#clearSelectedBlock();
    target?.block?.classList?.add?.(SELECTED_CLASS);

    const from = target?.pos;
    const to = targetEndPos(target);
    if (Number.isFinite(from)) {
      if (typeof this.#editor?.commands?.setNodeSelection === "function") {
        this.#editor.commands.setNodeSelection(from);
      } else if (Number.isFinite(to) && to > from) {
        this.#editor?.commands?.setTextSelection?.({ from, to });
      } else {
        this.#editor?.commands?.setTextSelection?.(from);
      }
    }
    this.#editor?.commands?.focus?.();
  }

  #clearSelectedBlock() {
    this.#root
      ?.querySelectorAll?.(`.${SELECTED_CLASS}`)
      ?.forEach?.((block) => block.classList.remove(SELECTED_CLASS));
  }

  #hasOpenFloatingMenu() {
    return this.#menu?.state?.open === true || this.#insertMenu?.state?.open === true;
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
  }

  destroy() {
    this.close();
    this.#unbind();
    this.#menu?.destroy?.();
    this.#view.destroy?.();
    this.#editor = null;
    this.#entry = null;
    this.#root = null;
  }
}

export function createTiptapBlockHandleController(options) {
  return new TiptapBlockHandleController(options);
}
