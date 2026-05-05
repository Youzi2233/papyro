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

function defaultDocument() {
  return typeof document === "undefined" ? null : document;
}

function defaultWindow(documentRef) {
  return documentRef?.defaultView ?? (typeof window === "undefined" ? null : window);
}

function createElement(documentRef, tagName, className) {
  const element = documentRef?.createElement?.(tagName) ?? null;
  if (element && className) {
    element.className = className;
  }
  return element;
}

function setHidden(element, hidden) {
  if (!element) return;
  element.hidden = hidden;
  element.classList?.toggle?.("hidden", hidden);
}

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
    button.appendChild(icon);
    root.appendChild(button);
    (container?.ownerDocument?.body ?? this.#document.body)?.appendChild(root);

    this.#root = root;
    this.#button = button;
    setHidden(root, true);
  }

  update(state) {
    if (!this.#root || !this.#button || !state.open || !state.target?.block) return;

    const rect = state.target.block.getBoundingClientRect?.();
    if (!rect) return;

    const viewportWidth =
      state.target.block.ownerDocument?.documentElement?.clientWidth ??
      this.#window?.innerWidth ??
      1024;
    const size = this.#root.offsetWidth || DEFAULT_HANDLE_SIZE;
    const left = Math.max(6, Math.min(rect.left - size - HORIZONTAL_GAP, viewportWidth - size - 6));
    const top = rect.top + Math.max(0, (rect.height - size) / 2);

    this.#root.dataset.blockKind = state.target.kind;
    this.#root.style.left = `${left}px`;
    this.#root.style.top = `${top}px`;
    setHidden(this.#root, false);
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
  #editor = null;
  #entry = null;
  #root = null;
  #removeListeners = [];
  #state = {
    open: false,
    target: null,
  };

  constructor({ view = null, dom = {} } = {}) {
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
    this.#bind();
  }

  #bind() {
    this.#unbind();
    const listenTarget = this.#root;
    if (!listenTarget?.addEventListener) return;

    const onMouseMove = (event) => this.handlePointerMove(event);
    const onMouseLeave = () => this.close();
    const onScroll = () => this.close();

    listenTarget.addEventListener("mousemove", onMouseMove);
    listenTarget.addEventListener("mouseleave", onMouseLeave);
    listenTarget.addEventListener("scroll", onScroll, true);
    this.#removeListeners = [
      () => listenTarget.removeEventListener?.("mousemove", onMouseMove),
      () => listenTarget.removeEventListener?.("mouseleave", onMouseLeave),
      () => listenTarget.removeEventListener?.("scroll", onScroll, true),
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
    this.#view.update?.(this.#state, this.#editor);
    return this.state;
  }

  refresh() {
    if (!this.#state.open || this.#entry?.viewMode !== "hybrid") {
      this.close();
      return this.state;
    }

    this.#view.update?.(this.#state, this.#editor);
    return this.state;
  }

  close() {
    if (!this.#state.open) return;
    this.#state = {
      open: false,
      target: null,
    };
    this.#view.hide?.();
  }

  destroy() {
    this.close();
    this.#unbind();
    this.#view.destroy?.();
    this.#editor = null;
    this.#entry = null;
    this.#root = null;
  }
}

export function createTiptapBlockHandleController(options) {
  return new TiptapBlockHandleController(options);
}
