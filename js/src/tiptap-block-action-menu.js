import { createTiptapBlockActionController } from "./tiptap-block-actions.js";
import {
  blockActionTargetLabel,
  blockHandleActionsLabel,
} from "./tiptap-i18n.js";
import {
  commandElementId,
  bindPointerActivation,
  createElement,
  createFloatingDismissController,
  defaultDocument,
  defaultWindow,
  isComposingKeyboardEvent,
  mountFloatingRoot,
  positionFloatingElement,
  scrollActiveDescendantIntoView,
  setHidden,
  updateActiveDescendant,
  viewportSize,
} from "./tiptap-ui-primitives.js";

const DEFAULT_WIDTH = 336;
const DEFAULT_HEIGHT = 420;
const DEFAULT_MARGIN = 10;

const COMPACT_GROUPS = new Set(["Color", "Highlight", "Callout"]);

function groupLayout(groupName) {
  return COMPACT_GROUPS.has(groupName) ? "swatch" : "list";
}

function groupTone(commands) {
  return commands.some((command) => command.tone === "danger") ? "danger" : "default";
}

function groupedCommands(commands) {
  const groups = [];
  const groupByName = new Map();
  commands.forEach((command, index) => {
    const groupKey = command.groupKey || command.group || "Actions";
    let group = groupByName.get(groupKey);
    if (!group) {
      group = {
        key: groupKey,
        name: command.group || groupKey,
        commands: [],
      };
      groupByName.set(groupKey, group);
      groups.push(group);
    }
    group.commands.push({ ...command, index });
  });
  return groups.map((group) => ({
    ...group,
    layout: groupLayout(group.key),
    tone: groupTone(group.commands),
  }));
}

function shortcutCommandFromEvent(event) {
  const key = String(event?.key ?? "").toLowerCase();
  const primaryModifier = event?.ctrlKey || event?.metaKey;
  if (primaryModifier && !event?.altKey && key === "c") return "copy-block";
  if (primaryModifier && !event?.altKey && key === "d") return "duplicate-block";
  if (key === "delete" || key === "backspace") return "delete";
  return null;
}

function placeMenu(element, target, fallbackWindow, anchorRect = null) {
  const rect = usableAnchorRect(anchorRect)
    ? anchorRect
    : target?.block?.getBoundingClientRect?.();
  if (!element || !rect) return;

  positionFloatingElement(element, rect, {
    viewport: viewportSize(target.block, fallbackWindow),
    size: {
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      margin: DEFAULT_MARGIN,
    },
    placement: "right",
  });
}

function usableAnchorRect(rect) {
  if (!rect) return false;
  const left = Number(rect.left);
  const top = Number(rect.top);
  const right = Number(rect.right);
  const bottom = Number(rect.bottom);
  if (![left, top, right, bottom].every(Number.isFinite)) return false;
  return Math.abs(left) + Math.abs(top) > 0 || right > left || bottom > top;
}

class TiptapBlockActionMenuView {
  #document;
  #window;
  #ownerId;
  #root = null;
  #header = null;
  #eyebrow = null;
  #title = null;
  #list = null;

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

    const root = createElement(this.#document, "div", "mn-tiptap-block-action-menu hidden");
    const header = createElement(this.#document, "div", "mn-tiptap-block-action-menu-header");
    const eyebrow = createElement(this.#document, "div", "mn-tiptap-block-action-menu-eyebrow");
    const title = createElement(this.#document, "div", "mn-tiptap-block-action-menu-heading");
    const list = createElement(this.#document, "div", "mn-tiptap-block-action-menu-list");
    if (!root || !header || !eyebrow || !title || !list) return;

    root.id = this.#ownerId;
    root.role = "menu";
    root.setAttribute("aria-label", blockHandleActionsLabel("english"));
    eyebrow.textContent = blockHandleActionsLabel("english");
    title.textContent = blockActionTargetLabel("english", "block");
    header.append(eyebrow, title);
    root.append(header, list);
    mountFloatingRoot(root, container, this.#document);

    this.#root = root;
    this.#header = header;
    this.#eyebrow = eyebrow;
    this.#title = title;
    this.#list = list;
    setHidden(root, true);
  }

  update(state) {
    if (!this.#root || !this.#list || !state.open) return;

    this.#root.setAttribute("aria-label", blockHandleActionsLabel(state.language));
    if (this.#eyebrow) {
      this.#eyebrow.textContent = blockHandleActionsLabel(state.language);
    }
    if (this.#title) {
      this.#title.textContent = blockActionTargetLabel(state.language, state.target?.kind);
    }
    this.#list.replaceChildren();
    groupedCommands(state.commands).forEach((group) => {
      const section = createElement(
        this.#document,
        "section",
        "mn-tiptap-block-action-menu-section",
      );
      const heading = createElement(
        this.#document,
        "div",
        "mn-tiptap-block-action-menu-section-title",
      );
      if (!section || !heading) return;

      section.role = "group";
      section.setAttribute("aria-label", group.name);
      section.dataset.group = group.key;
      section.dataset.layout = group.layout;
      section.dataset.tone = group.tone;
      heading.textContent = group.name;
      section.appendChild(heading);

      group.commands.forEach((command) => {
        const item = createElement(this.#document, "button", "mn-tiptap-block-action-menu-item");
        const icon = createElement(
          this.#document,
          "span",
          `mn-tiptap-block-action-menu-icon ${command.icon ?? "block"}`,
        );
        const copy = createElement(this.#document, "span", "mn-tiptap-block-action-menu-copy");
        const title = createElement(this.#document, "span", "mn-tiptap-block-action-menu-title");
        const description = createElement(
          this.#document,
          "span",
          "mn-tiptap-block-action-menu-description",
        );
        const shortcut = createElement(
          this.#document,
          "span",
          "mn-tiptap-block-action-menu-shortcut",
        );
        if (!item || !icon || !copy || !title || !description || !shortcut) return;

        item.type = "button";
        item.id = commandElementId(this.#ownerId, command.index);
        item.role = "menuitem";
        item.dataset.commandId = command.id;
        item.dataset.tone = command.tone;
        item.tabIndex = command.index === state.selectedIndex ? 0 : -1;
        item.classList.toggle("active", command.index === state.selectedIndex);
        icon.setAttribute("aria-hidden", "true");
        title.textContent = command.title;
        description.textContent = command.description;
        shortcut.textContent = command.shortcut ?? "";
        shortcut.hidden = !command.shortcut;
        copy.append(title, description);
        item.append(icon, copy, shortcut);
        bindPointerActivation(item, () => state.run(command.id));
        section.appendChild(item);
      });

      this.#list.appendChild(section);
    });

    updateActiveDescendant(this.#root, this.#ownerId, state.commands, state.selectedIndex);
    scrollActiveDescendantIntoView(this.#root, this.#ownerId, state.commands, state.selectedIndex);
    setHidden(this.#root, false);
    placeMenu(this.#root, state.target, this.#window, state.anchorRect);
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
    this.#header = null;
    this.#eyebrow = null;
    this.#title = null;
    this.#list = null;
  }
}

export class TiptapBlockActionMenuController {
  #commands;
  #view;
  #dismiss;
  #document = null;
  #externalContains = () => false;
  #editor = null;
  #entry = null;
  #state = {
    open: false,
    target: null,
    commands: [],
    selectedIndex: 0,
    anchorRect: null,
  };

  constructor({
    commandController = createTiptapBlockActionController(),
    view = null,
    dom = {},
  } = {}) {
    this.#commands = commandController;
    const documentRef = dom.document ?? defaultDocument();
    const windowRef = dom.window ?? defaultWindow(documentRef);
    this.#document = documentRef;
    this.#view =
      view ??
      new TiptapBlockActionMenuView({
        document: documentRef,
        window: windowRef,
      });
    this.#dismiss = createFloatingDismissController({
      document: documentRef,
      window: windowRef,
      contains: (target) =>
        this.contains(target) ||
        this.#externalContains(target) ||
        this.#state.target?.block?.contains?.(target),
      shouldDismiss: (event) => this.#shouldDismiss(event),
      onDismiss: () => this.close(),
    });
  }

  get state() {
    return {
      ...this.#state,
      target: this.#state.target ? { ...this.#state.target } : null,
      commands: this.#state.commands.map((command) => ({ ...command })),
    };
  }

  attach({ editor, root, entry } = {}) {
    this.#editor = editor ?? null;
    this.#entry = entry ?? null;
    this.#view.mount?.(root);
  }

  setExternalContains(contains) {
    this.#externalContains = typeof contains === "function" ? contains : () => false;
  }

  #shouldDismiss(event) {
    if (event?.type !== "focusin") return true;
    const target = event?.target;
    return !(
      target == null ||
      target === this.#document?.body ||
      this.#editor?.view?.dom?.contains?.(target)
    );
  }

  open(target, { anchorRect = null } = {}) {
    if (!this.#editor || this.#entry?.viewMode !== "hybrid" || !target?.block) {
      this.close();
      return this.state;
    }

    this.#state = {
      open: true,
      target,
      commands: this.#commands.list({
        editor: this.#editor,
        entry: this.#entry,
        language: this.#entry?.preferences?.language,
        target,
      }),
      selectedIndex: 0,
      anchorRect,
      language: this.#entry?.preferences?.language,
    };
    this.#view.update?.(
      {
        ...this.#state,
        run: (commandId) => this.run(commandId),
      },
      this.#editor,
    );
    this.#dismiss.open();
    return this.state;
  }

  refresh() {
    if (!this.#state.open || !this.#state.target) return this.state;
    return this.open(this.#state.target, { anchorRect: this.#state.anchorRect });
  }

  moveSelection(delta) {
    if (!this.#state.open || this.#state.commands.length === 0) return this.state;
    const count = this.#state.commands.length;
    this.#state = {
      ...this.#state,
      selectedIndex: (this.#state.selectedIndex + delta + count) % count,
    };
    this.#view.update?.(
      {
        ...this.#state,
        run: (commandId) => this.run(commandId),
      },
      this.#editor,
    );
    return this.state;
  }

  run(commandId = this.#state.commands[this.#state.selectedIndex]?.id) {
    if (!this.#state.open || !commandId || !this.#editor) return false;
    const target = this.#state.target;
    this.close();
    const result = this.#commands.run(commandId, {
      editor: this.#editor,
      entry: this.#entry,
      target,
      source: "block_action_menu",
    });
    return result.ok;
  }

  handleKeyDown(event) {
    if (!this.#state.open) return false;
    if (isComposingKeyboardEvent(event)) return false;

    const shortcutCommandId = shortcutCommandFromEvent(event);
    if (
      shortcutCommandId &&
      this.#state.commands.some((command) => command.id === shortcutCommandId)
    ) {
      event.preventDefault();
      return this.run(shortcutCommandId);
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.moveSelection(1);
      return true;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.moveSelection(-1);
      return true;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      if (this.#state.commands.length === 0) return false;
      event.preventDefault();
      return this.run();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
      return true;
    }

    return false;
  }

  close() {
    if (!this.#state.open) return;
    this.#state = {
      open: false,
      target: null,
      commands: [],
      selectedIndex: 0,
      anchorRect: null,
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
    return this.#view.contains?.(target) ?? false;
  }
}

export function createTiptapBlockActionMenuController(options) {
  return new TiptapBlockActionMenuController(options);
}
