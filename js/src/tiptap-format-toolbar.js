import { createTiptapFormatCommandController } from "./tiptap-format-commands.js";
import {
  createElement,
  createFloatingDismissController,
  defaultDocument,
  defaultWindow,
  mountFloatingRoot,
  positionFloatingElement,
  setHidden,
  viewportSize,
} from "./tiptap-ui-primitives.js";

const REGULAR_TOOLBAR_WIDTH = 410;
const COMPACT_TOOLBAR_WIDTH = 352;
const TOOLBAR_HEIGHT = 38;

function selectionContext(editor) {
  const state = editor?.state ?? editor?.view?.state;
  const selection = state?.selection;
  if (!selection || selection.empty || typeof selection.from !== "number") {
    return null;
  }

  return {
    from: selection.from,
    to: selection.to,
  };
}

function selectionRect(editor, range) {
  const view = editor?.view;
  if (!view || typeof view.coordsAtPos !== "function" || !range) {
    return null;
  }

  const from = view.coordsAtPos(range.from);
  const to = view.coordsAtPos(range.to);
  return {
    left: Math.min(from.left, to.left),
    right: Math.max(from.right ?? from.left, to.right ?? to.left),
    top: Math.min(from.top, to.top),
    bottom: Math.max(from.bottom ?? from.top, to.bottom ?? to.top),
  };
}

function shouldUseCompactToolbar(editor, range, fallbackWindow) {
  const viewport = viewportSize(editor?.view?.dom, fallbackWindow);
  if (viewport.width <= 520) {
    return true;
  }

  const rect = selectionRect(editor, range);
  if (!rect) {
    return false;
  }

  const availableWidth =
    Math.min(viewport.width, Math.max(rect.right ?? rect.left, rect.left) + REGULAR_TOOLBAR_WIDTH) -
    Math.max(0, rect.left - REGULAR_TOOLBAR_WIDTH);
  return availableWidth < REGULAR_TOOLBAR_WIDTH + 24;
}

function toolbarSize(density) {
  return {
    width: density === "compact" ? COMPACT_TOOLBAR_WIDTH : REGULAR_TOOLBAR_WIDTH,
    height: TOOLBAR_HEIGHT,
    margin: 10,
  };
}

function placeToolbar(element, editor, range, fallbackWindow, density) {
  const rect = selectionRect(editor, range);
  if (!element || !rect) return;

  positionFloatingElement(element, rect, {
    viewport: viewportSize(editor?.view?.dom, fallbackWindow),
    size: toolbarSize(density),
    placement: "top",
  });
}

class TiptapFormatToolbarView {
  #document;
  #window;
  #root = null;
  #list = null;

  constructor({ document = defaultDocument(), window = defaultWindow(document) } = {}) {
    this.#document = document;
    this.#window = window;
  }

  mount(container) {
    if (this.#root || !this.#document) return;

    const root = createElement(this.#document, "div", "mn-tiptap-format-toolbar hidden");
    const list = createElement(this.#document, "div", "mn-tiptap-format-toolbar-list");
    if (!root || !list) return;

    root.role = "toolbar";
    root.setAttribute("aria-label", "Text formatting");
    root.appendChild(list);
    mountFloatingRoot(root, container, this.#document);

    this.#root = root;
    this.#list = list;
    setHidden(root, true);
  }

  update(state, editor) {
    if (!this.#root || !this.#list || !state.open) return;

    const density = state.density ?? "regular";
    this.#root.dataset.density = density;
    this.#list.replaceChildren();
    state.commands.forEach((command) => {
      const button = createElement(
        this.#document,
        "button",
        "mn-tiptap-format-toolbar-button",
      );
      const icon = createElement(
        this.#document,
        "span",
        `mn-tiptap-format-toolbar-icon ${command.icon}`,
      );
      const text = createElement(this.#document, "span", "mn-tiptap-format-toolbar-label");
      if (!button || !icon || !text) return;

      button.type = "button";
      button.title = command.title;
      button.setAttribute("aria-label", command.ariaLabel);
      button.setAttribute("aria-pressed", String(command.active));
      button.classList.toggle("active", command.active);
      button.dataset.commandId = command.id;
      button.dataset.priority = String(command.priority ?? 100);
      text.textContent = command.label;
      button.append(icon, text);
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation?.();
        state.run(command.id);
      });
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      this.#list.appendChild(button);
    });

    setHidden(this.#root, false);
    placeToolbar(this.#root, editor, state.range, this.#window, density);
  }

  hide() {
    setHidden(this.#root, true);
  }

  contains(target) {
    return this.#root?.contains?.(target) ?? false;
  }

  destroy() {
    this.#root?.remove?.();
    this.#root = null;
    this.#list = null;
  }
}

export class TiptapFormatToolbarController {
  #commands;
  #view;
  #dismiss;
  #editor = null;
  #entry = null;
  #linkEditor = null;
  #state = {
    open: false,
    range: null,
    density: "regular",
    commands: [],
  };

  constructor({
    commandController = createTiptapFormatCommandController(),
    view = null,
    linkEditor = null,
    dom = {},
  } = {}) {
    this.#commands = commandController;
    this.#linkEditor = linkEditor;
    const documentRef = dom.document ?? defaultDocument();
    const windowRef = dom.window ?? defaultWindow(documentRef);
    this.#view =
      view ??
      new TiptapFormatToolbarView({
        document: documentRef,
        window: windowRef,
      });
    this.#dismiss = createFloatingDismissController({
      document: documentRef,
      window: windowRef,
      contains: (target) => this.contains(target),
      onDismiss: () => this.close(),
    });
  }

  get state() {
    return {
      ...this.#state,
      range: this.#state.range ? { ...this.#state.range } : null,
      commands: this.#state.commands.map((command) => ({ ...command })),
    };
  }

  attach({ editor, root, entry } = {}) {
    this.#editor = editor ?? null;
    this.#entry = entry ?? null;
    this.#view.mount?.(root);
    this.refresh(editor);
  }

  refresh(editor = this.#editor) {
    if (!editor || this.#entry?.viewMode !== "hybrid") {
      this.close();
      return this.state;
    }

    const range = selectionContext(editor);
    if (!range) {
      this.close();
      return this.state;
    }

    this.#state = {
      open: true,
      range,
      density: shouldUseCompactToolbar(editor, range, defaultWindow(editor?.view?.dom?.ownerDocument))
        ? "compact"
        : "regular",
      commands: this.#commands.states({ editor, entry: this.#entry }),
    };
    this.#view.update?.(
      {
        ...this.#state,
        run: (commandId) => this.run(commandId),
      },
      editor,
    );
    this.#dismiss.open();
    return this.state;
  }

  run(commandId) {
    if (!this.#editor) return false;
    const result = this.#commands.run(commandId, {
      editor: this.#editor,
      entry: this.#entry,
      source: "format_toolbar",
      openLinkEditor: () => this.openLinkEditor(),
    });
    this.refresh(this.#editor);
    return result.ok;
  }

  close() {
    if (!this.#state.open) return;
    this.#state = {
      open: false,
      range: null,
      density: "regular",
      commands: [],
    };
    this.#view.hide?.();
    this.#dismiss.close();
  }

  destroy() {
    this.close();
    this.#dismiss.close();
    this.#view.destroy?.();
    this.#editor = null;
    this.#entry = null;
  }

  contains(target) {
    return (this.#view.contains?.(target) ?? false) || (this.#linkEditor?.contains?.(target) ?? false);
  }

  openLinkEditor() {
    if (!this.#editor || !this.#entry || this.#entry.viewMode !== "hybrid") return false;
    return this.#linkEditor?.open?.({
      editor: this.#editor,
      entry: this.#entry,
      range: this.#state.range,
    }) === true;
  }
}

export function createTiptapFormatToolbarController(options) {
  return new TiptapFormatToolbarController(options);
}
