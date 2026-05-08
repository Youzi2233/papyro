import { createTiptapFormatCommandController } from "./tiptap-format-commands.js";
import {
  commandElementId,
  createElement,
  createFloatingDismissController,
  defaultDocument,
  defaultWindow,
  isComposingKeyboardEvent,
  mountFloatingRoot,
  positionFloatingElement,
  setHidden,
  syncMenuActiveDescendant,
  viewportSize,
} from "./tiptap-ui-primitives.js";

const REGULAR_TOOLBAR_WIDTH = 448;
const COMPACT_TOOLBAR_WIDTH = 386;
const TOOLBAR_HEIGHT = 38;
const FORMAT_TOOLBAR_OWNER_ID = "mn-tiptap-format-toolbar";
const FORMAT_TOOLBAR_SUBMENU_OWNER_ID = "mn-tiptap-format-toolbar-submenu";

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
  #shell = null;
  #list = null;
  #submenu = null;

  constructor({ document = defaultDocument(), window = defaultWindow(document) } = {}) {
    this.#document = document;
    this.#window = window;
  }

  mount(container) {
    if (this.#root || !this.#document) return;

    const root = createElement(this.#document, "div", "mn-tiptap-format-toolbar hidden");
    const shell = createElement(this.#document, "div", "mn-tiptap-format-toolbar-shell");
    const list = createElement(this.#document, "div", "mn-tiptap-format-toolbar-list");
    const submenu = createElement(this.#document, "div", "mn-tiptap-format-toolbar-submenu hidden");
    if (!root || !shell || !list || !submenu) return;

    root.role = "toolbar";
    root.setAttribute("aria-label", "Text formatting");
    shell.appendChild(list);
    shell.appendChild(submenu);
    root.appendChild(shell);
    mountFloatingRoot(root, container, this.#document);

    this.#root = root;
    this.#shell = shell;
    this.#list = list;
    this.#submenu = submenu;
    setHidden(root, true);
  }

  update(state, editor) {
    if (!this.#root || !this.#list || !state.open) return;

    const density = state.density ?? "regular";
    this.#root.dataset.density = density;
    this.#root.dataset.keyboardActive = state.keyboardActive ? "true" : "false";
    this.#root.onkeydown = (event) => state.handleKeyDown?.(event);
    this.#list.replaceChildren();
    state.commands.forEach((command, commandIndex) => {
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
      button.id = commandElementId(FORMAT_TOOLBAR_OWNER_ID, commandIndex);
      button.setAttribute("aria-label", command.ariaLabel);
      button.setAttribute("aria-pressed", String(command.active));
      if (command.id === "turn-into") {
        button.setAttribute("aria-haspopup", "menu");
        button.setAttribute("aria-expanded", String(state.submenuOpen === command.id));
        if (state.submenuOpen === command.id) {
          button.setAttribute("aria-controls", FORMAT_TOOLBAR_SUBMENU_OWNER_ID);
        }
      }
      button.classList.toggle("active", command.active);
      button.dataset.commandId = command.id;
      button.dataset.commandIndex = String(commandIndex);
      button.dataset.priority = String(command.priority ?? 100);
      button.dataset.keyboardActive =
        state.activeCommandId === command.id ? "true" : "false";
      button.dataset.submenuOpen =
        state.submenuOpen === command.id ? "true" : "false";
      button.tabIndex = state.activeCommandId === command.id ? 0 : -1;
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
      button.addEventListener("pointerenter", () =>
        state.setActiveCommand?.(command.id, { keyboardActive: false }),
      );
      button.addEventListener("focus", () =>
        state.setActiveCommand?.(command.id, { keyboardActive: true }),
      );
      this.#list.appendChild(button);
    });
    this.#renderSubmenu(state);
    const submenuParent = state.commands.find((command) => command.id === state.submenuOpen);
    const activeCommands = state.submenuOpen ? submenuParent?.children ?? [] : state.commands;
    const activeIndex = Math.max(
      0,
      state.submenuOpen
        ? activeCommands.findIndex((command) => command.id === state.activeChildCommandId)
        : activeCommands.findIndex((command) => command.id === state.activeCommandId),
    );
    syncMenuActiveDescendant(
      this.#root,
      state.submenuOpen ? FORMAT_TOOLBAR_SUBMENU_OWNER_ID : FORMAT_TOOLBAR_OWNER_ID,
      activeCommands,
      activeIndex,
      {
        ariaSelected: false,
        indexDataset: state.submenuOpen ? "submenuCommandIndex" : "commandIndex",
        manageTabIndex: true,
        scroll: state.keyboardActive,
      },
    );

    setHidden(this.#root, false);
    placeToolbar(this.#root, editor, state.range, this.#window, density);
  }

  #renderSubmenu(state) {
    if (!this.#submenu) return;
    this.#submenu.replaceChildren();
    const parent = state.commands.find((command) => command.id === state.submenuOpen);
    if (!parent?.children?.length) {
      setHidden(this.#submenu, true);
      return;
    }

    this.#submenu.id = FORMAT_TOOLBAR_SUBMENU_OWNER_ID;
    this.#submenu.dataset.parentCommandId = parent.id;
    this.#submenu.setAttribute("role", "menu");
    this.#submenu.setAttribute("aria-label", parent.title ?? "Turn into");
    parent.children.forEach((command, index) => {
      const button = createElement(
        this.#document,
        "button",
        "mn-tiptap-format-toolbar-submenu-item",
      );
      const icon = createElement(
        this.#document,
        "span",
        `mn-tiptap-format-toolbar-submenu-icon ${command.icon}`,
      );
      const label = createElement(
        this.#document,
        "span",
        "mn-tiptap-format-toolbar-submenu-label",
      );
      if (!button || !icon || !label) return;

      button.type = "button";
      button.title = command.title;
      button.setAttribute("aria-label", command.ariaLabel);
      button.setAttribute("role", "menuitem");
      button.classList.toggle("active", command.active);
      button.dataset.commandId = command.id;
      button.dataset.submenuCommandIndex = String(index);
      button.dataset.active = command.active ? "true" : "false";
      button.dataset.keyboardActive =
        state.activeChildCommandId === command.id ? "true" : "false";
      button.tabIndex = state.activeChildCommandId === command.id ? 0 : -1;
      label.textContent = command.title;
      button.append(icon, label);
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation?.();
        state.run(command.id);
      });
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      button.addEventListener("pointerenter", () =>
        state.setActiveChildCommand?.(command.id, { keyboardActive: false }),
      );
      button.addEventListener("focus", () =>
        state.setActiveChildCommand?.(command.id, { keyboardActive: true }),
      );
      this.#submenu.appendChild(button);
    });
    setHidden(this.#submenu, false);
  }

  focusCommand(commandId) {
    const searchRoots = [this.#list, this.#submenu];
    let button = null;
    for (const root of searchRoots) {
      button = Array.from(root?.children ?? []).find(
        (element) => element.dataset?.commandId === commandId,
      );
      if (button) break;
    }
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
    this.#root?.remove?.();
    this.#root = null;
    this.#shell = null;
    this.#list = null;
    this.#submenu = null;
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
    activeCommandId: null,
    submenuOpen: null,
    activeChildCommandId: null,
    keyboardActive: false,
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

  #syncView(editor = this.#editor) {
    this.#view.update?.(
      {
        ...this.#state,
        run: (commandId) => this.run(commandId),
        setActiveChildCommand: (commandId, options) =>
          this.setActiveChildCommand(commandId, options),
        setActiveCommand: (commandId, options) => this.setActiveCommand(commandId, options),
        handleKeyDown: (event) => this.handleKeyDown(event),
      },
      editor,
    );
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
      activeCommandId: this.#state.activeCommandId,
      submenuOpen: this.#state.submenuOpen,
      activeChildCommandId: this.#state.activeChildCommandId,
      keyboardActive: this.#state.keyboardActive,
    };
    if (!this.#state.activeCommandId) {
      this.#state.activeCommandId = this.#state.commands[0]?.id ?? null;
    }
    this.#syncView(editor);
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
      openTurnIntoMenu: () => this.openSubmenu("turn-into"),
    });
    if (result.ok && result.commandId !== "turn-into") {
      this.#state = {
        ...this.#state,
        submenuOpen: null,
        activeChildCommandId: null,
      };
    }
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
      activeCommandId: null,
      submenuOpen: null,
      activeChildCommandId: null,
      keyboardActive: false,
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

  setActiveCommand(commandId, { focus = false, keyboardActive = true } = {}) {
    const command = this.#state.commands.find((item) => item.id === commandId);
    if (!command) return false;
    this.#state = {
      ...this.#state,
      activeCommandId: command.id,
      keyboardActive,
    };
    if (command.id !== "turn-into") {
      this.#state = {
        ...this.#state,
        submenuOpen: null,
        activeChildCommandId: null,
      };
    }
    this.#syncView();
    if (focus) {
      this.#view.focusCommand?.(command.id);
    }
    return true;
  }

  openSubmenu(commandId) {
    const command = this.#state.commands.find((item) => item.id === commandId);
    if (!command?.children?.length) return false;
    this.#state = {
      ...this.#state,
      activeCommandId: command.id,
      submenuOpen: command.id,
      activeChildCommandId: command.children[0]?.id ?? null,
      keyboardActive: true,
    };
    this.#syncView();
    return true;
  }

  setActiveChildCommand(commandId, { focus = false, keyboardActive = true } = {}) {
    const parent = this.#state.commands.find((command) => command.id === this.#state.submenuOpen);
    const command = parent?.children?.find((item) => item.id === commandId);
    if (!command) return false;
    this.#state = {
      ...this.#state,
      activeChildCommandId: command.id,
      keyboardActive,
    };
    this.#syncView();
    if (focus) {
      this.#view.focusCommand?.(command.id);
    }
    return true;
  }

  #moveActiveCommand(direction, event) {
    const commands = this.#state.commands;
    if (!commands.length) return false;
    const currentIndex = Math.max(
      0,
      commands.findIndex((command) => command.id === this.#state.activeCommandId),
    );
    const nextIndex = (currentIndex + direction + commands.length) % commands.length;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    return this.setActiveCommand(commands[nextIndex].id, {
      focus: true,
      keyboardActive: true,
    });
  }

  handleKeyDown(event) {
    if (!this.#state.open) return false;
    if (isComposingKeyboardEvent(event)) return false;

    const key = String(event?.key ?? "");

    if (key === "Escape") {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (this.#state.submenuOpen) {
        this.#state = {
          ...this.#state,
          submenuOpen: null,
          activeChildCommandId: null,
          keyboardActive: true,
        };
        this.#syncView();
        this.#view.focusCommand?.(this.#state.activeCommandId);
        return true;
      }
      this.close();
      this.#editor?.commands?.focus?.();
      return true;
    }

    if (this.#state.submenuOpen && (key === "ArrowDown" || key === "ArrowUp")) {
      const parent = this.#state.commands.find((command) => command.id === this.#state.submenuOpen);
      const children = parent?.children ?? [];
      if (!children.length) return false;
      const currentIndex = Math.max(
        0,
        children.findIndex((command) => command.id === this.#state.activeChildCommandId),
      );
      const nextIndex =
        key === "ArrowDown"
          ? (currentIndex + 1) % children.length
          : (currentIndex - 1 + children.length) % children.length;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      return this.setActiveChildCommand(children[nextIndex].id, {
        focus: true,
        keyboardActive: true,
      });
    }

    if (key === "ArrowDown" && this.#state.activeCommandId === "turn-into") {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      return this.openSubmenu("turn-into");
    }

    if (key === "ArrowRight" || key === "ArrowDown") {
      return this.#moveActiveCommand(1, event);
    }
    if (key === "ArrowLeft" || key === "ArrowUp") {
      return this.#moveActiveCommand(-1, event);
    }
    if (key === "Home") {
      const firstId = this.#state.commands[0]?.id ?? null;
      if (!firstId) return false;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      return this.setActiveCommand(firstId, { focus: true, keyboardActive: true });
    }
    if (key === "End") {
      const lastId = this.#state.commands.at(-1)?.id ?? null;
      if (!lastId) return false;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      return this.setActiveCommand(lastId, { focus: true, keyboardActive: true });
    }
    if (key === "Enter" || key === " ") {
      if (this.#state.submenuOpen && this.#state.activeChildCommandId) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        return this.run(this.#state.activeChildCommandId);
      }
      const commandId = this.#state.activeCommandId;
      if (!commandId) return false;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      return this.run(commandId);
    }

    return false;
  }

  activateKeyboard(event) {
    this.refresh(this.#editor);
    if (!this.#state.open) return false;
    const firstId = this.#state.activeCommandId ?? this.#state.commands[0]?.id ?? null;
    if (!firstId) return false;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (this.#state.submenuOpen && this.#state.activeChildCommandId) {
      return this.setActiveChildCommand(this.#state.activeChildCommandId, {
        focus: true,
        keyboardActive: true,
      });
    }
    return this.setActiveCommand(firstId, { focus: true, keyboardActive: true });
  }
}

export function createTiptapFormatToolbarController(options) {
  return new TiptapFormatToolbarController(options);
}
