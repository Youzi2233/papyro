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

  return {
    block,
    kind: blockKind(block),
    pos: blockPosition(editor, block),
  };
}

function targetEquals(left, right) {
  return left?.block === right?.block && left?.pos === right?.pos && left?.kind === right?.kind;
}

class TiptapBlockHandleView {
  #document;
  #window;
  #root = null;
  #button = null;
  #onAction = null;

  constructor({ document = defaultDocument(), window = defaultWindow(document) } = {}) {
    this.#document = document;
    this.#window = window;
  }

  mount(container) {
    if (this.#root || !this.#document) return;

    const root = createElement(this.#document, "div", "mn-tiptap-block-handle hidden");
    const button = createElement(this.#document, "button", "mn-tiptap-block-handle-button");
    const icon = createElement(this.#document, "span", "mn-tiptap-block-handle-icon");
    if (!root || !button || !icon) return;

    button.type = "button";
    button.draggable = true;
    button.title = "Block actions";
    button.setAttribute("aria-label", "Block actions");
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
    });
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      this.#onAction?.(event);
    });
    button.appendChild(icon);
    root.appendChild(button);
    mountFloatingRoot(root, container, this.#document);

    this.#root = root;
    this.#button = button;
    setHidden(root, true);
  }

  update(state) {
    if (!this.#root || !this.#button || !state.open || !state.target?.block) return;

    this.#onAction = state.openActions ?? null;
    const rect = state.target.block.getBoundingClientRect?.();
    if (!rect) return;

    const viewportWidth =
      state.target.block.ownerDocument?.documentElement?.clientWidth ??
      this.#window?.innerWidth ??
      1024;
    const size = this.#button.offsetWidth || DEFAULT_HANDLE_SIZE;
    const bridgeWidth = size + HORIZONTAL_GAP;
    const left = Math.max(
      6,
      Math.min(rect.left - bridgeWidth, viewportWidth - bridgeWidth - 6),
    );
    const top = rect.top + Math.max(0, (rect.height - size) / 2);

    this.#root.dataset.blockKind = state.target.kind;
    this.#root.style.left = `${left}px`;
    this.#root.style.top = `${top}px`;
    this.#root.style.width = `${bridgeWidth}px`;
    setHidden(this.#root, false);
  }

  contains(target) {
    return this.#root?.contains?.(target) ?? false;
  }

  hide() {
    setHidden(this.#root, true);
  }

  destroy() {
    this.#root?.remove?.();
    this.#root = null;
    this.#button = null;
  }
}

export class TiptapBlockHandleController {
  #view;
  #menu;
  #editor = null;
  #entry = null;
  #root = null;
  #removeListeners = [];
  #state = {
    open: false,
    target: null,
  };

  constructor({ menu = null, view = null, dom = {} } = {}) {
    this.#menu = menu;
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
      if (this.#view.contains?.(event?.relatedTarget)) return;
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
    if (!this.#editor || this.#entry?.viewMode !== "hybrid") {
      this.close();
      return this.state;
    }

    const target = blockTargetFromEvent(event, this.#editor);
    if (!target) {
      this.close();
      return this.state;
    }

    if (targetEquals(this.#state.target, target) && this.#state.open) {
      this.#view.update?.(this.#state, this.#editor);
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
    if (!this.#state.open || !this.#state.target || this.#entry?.viewMode !== "hybrid") {
      return false;
    }
    this.#menu?.open?.(this.#state.target);
    return true;
  }

  handleKeyDown(event) {
    return this.#menu?.handleKeyDown?.(event) ?? false;
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
    this.#view.update?.(
      {
        ...this.#state,
        openActions: () => this.openActions(),
      },
      this.#editor,
    );
  }

  close() {
    if (!this.#state.open) return;
    this.#state = {
      open: false,
      target: null,
    };
    this.#view.hide?.();
    this.#menu?.close?.();
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
