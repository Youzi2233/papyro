import { createTiptapBlockActionController } from "./tiptap-block-actions.js";
import {
  blockActionTargetLabel,
  blockActionSubmenuDescription,
  blockActionSubmenuLabel,
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
  setHidden,
  syncMenuActiveDescendant,
  viewportSize,
} from "./tiptap-ui-primitives.js";

const DEFAULT_WIDTH = 168;
const DEFAULT_HEIGHT = 340;
const DEFAULT_MARGIN = 10;
const SUBMENU_WIDTH = 160;
const SUBMENU_GAP = 6;
const HOVER_INTENT_DELAY_MS = 90;

const COMPACT_GROUPS = new Set(["Color", "Highlight", "Callout"]);
const SUBMENU_ORDER = ["turn-into", "code-language"];

function submenuOrder(submenu) {
  const index = SUBMENU_ORDER.indexOf(submenu);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

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
    if (command.submenu) return;
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

function submenuGroups(commands) {
  return (commands ?? [])
    .map((command, index) => ({ command, index }))
    .filter(({ command }) => command.submenu && Array.isArray(command.children))
    .map(({ command, index }) => ({
      id: command.submenu,
      name: command.title,
      description: command.description,
      trigger: { ...command, index },
      commands: command.children.map((child) => ({ ...child })),
    }))
    .sort((left, right) => submenuOrder(left.id) - submenuOrder(right.id));
}

function submenuCommandIndex(commands, submenu, commandId) {
  return (commands ?? []).findIndex(
    (command) => command.submenu === submenu && command.id === commandId,
  );
}

function commandSubmenuId(command) {
  if (!command) return "";
  if (command.submenu && Array.isArray(command.children)) return command.submenu;
  return command.submenu ?? "";
}

function firstSubmenuChildIndex(commands, submenu) {
  return (commands ?? []).findIndex(
    (command) => command.submenu === submenu && !Array.isArray(command.children),
  );
}

function submenuParentIndex(commands, submenu) {
  return (commands ?? []).findIndex(
    (command) => command.submenu === submenu && Array.isArray(command.children),
  );
}

function nextCommandIndexInSubmenu(commands, currentIndex, direction) {
  const submenu = commandSubmenuId(commands?.[currentIndex]);
  if (!submenu) return currentIndex;
  const candidates = (commands ?? [])
    .map((command, index) => ({ command, index }))
    .filter(({ command }) => command.submenu === submenu && !Array.isArray(command.children) && command.id !== submenu);
  if (!candidates.length) return currentIndex;
  const currentChildIndex = candidates.findIndex(({ index }) => index === currentIndex);
  const nextChildIndex =
    currentChildIndex < 0
      ? 0
      : (currentChildIndex + direction + candidates.length) % candidates.length;
  return candidates[nextChildIndex]?.index ?? currentIndex;
}

function prepareMenuCommands(commands) {
  const childIds = new Set();
  const childCommands = [];
  const parentCommands = [];
  const topLevelCommands = [];

  (commands ?? []).forEach((command) => {
    if (command.submenu && Array.isArray(command.children)) {
      parentCommands.push(command);
      command.children.forEach((child) => childIds.add(child.id));
    }
  });

  (commands ?? []).forEach((command) => {
    if (command.submenu && Array.isArray(command.children)) {
      topLevelCommands.push(command);
    } else if (command.submenu) {
      childCommands.push(command);
    } else if (!childIds.has(command.id)) {
      topLevelCommands.push(command);
    }
  });

  parentCommands.forEach((parent) => {
    (parent.children ?? []).forEach((child) => {
      if (!childCommands.some((command) => command.id === child.id && command.submenu === parent.submenu)) {
        childCommands.push({ ...child, submenu: parent.submenu });
      }
    });
  });

  const ordered = [...topLevelCommands];
  childCommands.forEach((command) => {
    if (parentCommands.some((parent) => parent.submenu === command.submenu)) {
      ordered.push(command);
    }
  });

  return ordered.map((command, index) => {
    if (command.submenu && Array.isArray(command.children)) {
      return {
        ...command,
        index,
        children: command.children.map((child) => ({ ...child })),
      };
    } else {
      return { ...command, index };
    }
  });
}

function shortcutCommandFromEvent(event) {
  const key = String(event?.key ?? "").toLowerCase();
  const primaryModifier = event?.ctrlKey || event?.metaKey;
  if (event?.altKey && !primaryModifier && key === "arrowup") return "move-block-up";
  if (event?.altKey && !primaryModifier && key === "arrowdown") return "move-block-down";
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

function syncActiveCommand(root, ownerId, commands, selectedIndex, { scroll = true } = {}) {
  return syncMenuActiveDescendant(root, ownerId, commands, selectedIndex, {
    manageTabIndex: true,
    scroll,
  });
}

class TiptapBlockActionMenuView {
  #document;
  #window;
  #ownerId;
  #root = null;
  #header = null;
  #eyebrow = null;
  #title = null;
  #body = null;
  #list = null;
  #submenus = null;
  #submenuHint = null;
  #hoverTimer = null;

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
    const body = createElement(this.#document, "div", "mn-tiptap-block-action-menu-body");
    const list = createElement(this.#document, "div", "mn-tiptap-block-action-menu-list");
    const submenus = createElement(this.#document, "div", "mn-tiptap-block-action-submenus");
    const submenuHint = createElement(this.#document, "div", "mn-tiptap-block-action-submenu-hint");
    if (!root || !header || !eyebrow || !title || !body || !list || !submenus || !submenuHint) return;

    root.id = this.#ownerId;
    root.role = "menu";
    root.setAttribute("aria-label", blockHandleActionsLabel("english"));
    eyebrow.textContent = blockHandleActionsLabel("english");
    title.textContent = blockActionTargetLabel("english", "block");
    header.append(eyebrow, title);
    body.append(list, submenus, submenuHint);
    root.append(header, body);
    mountFloatingRoot(root, container, this.#document);

    this.#root = root;
    this.#header = header;
    this.#eyebrow = eyebrow;
    this.#title = title;
    this.#body = body;
    this.#list = list;
    this.#submenus = submenus;
    this.#submenuHint = submenuHint;
    setHidden(root, true);
  }

  update(state) {
    if (!this.#root || !this.#list || !this.#submenus || !state.open) return;

    this.#root.setAttribute("aria-label", blockHandleActionsLabel(state.language));
    this.#root.dataset.hasSubmenus = submenuGroups(state.commands, state.language).length > 0 ? "true" : "false";
    if (this.#eyebrow) {
      this.#eyebrow.textContent = blockHandleActionsLabel(state.language);
    }
    if (this.#title) {
      this.#title.textContent = blockActionTargetLabel(state.language, state.target?.kind);
    }
    this.#list.replaceChildren();
    this.#submenus.replaceChildren();
    let actionsSection = null;
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
      if (group.key === "Actions") {
        actionsSection = section;
      }

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
        item.dataset.commandIndex = String(command.index);
        item.dataset.submenu = "";
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
        item.addEventListener("pointerenter", () =>
          this.#activateWithIntent(() => state.activate(command.index, { scroll: false })),
        );
        item.addEventListener("focus", () =>
          state.activate(command.index, { scroll: true }),
        );
        bindPointerActivation(item, () => state.run(command.id));
        section.appendChild(item);
      });

      this.#list.appendChild(section);
    });
    const submenus = submenuGroups(state.commands, state.language);
    submenus.forEach((group) => {
      const section = createElement(
        this.#document,
        "section",
        "mn-tiptap-block-action-submenu",
      );
      const trigger = createElement(
        this.#document,
        "button",
        "mn-tiptap-block-action-menu-item mn-tiptap-block-action-submenu-trigger",
      );
      const icon = createElement(
        this.#document,
        "span",
        `mn-tiptap-block-action-menu-icon ${group.id === "code-language" ? "code-language" : "turn-into"}`,
      );
      const copy = createElement(this.#document, "span", "mn-tiptap-block-action-menu-copy");
      const title = createElement(this.#document, "span", "mn-tiptap-block-action-menu-title");
      const description = createElement(
        this.#document,
        "span",
        "mn-tiptap-block-action-menu-description",
      );
      const arrow = createElement(this.#document, "span", "mn-tiptap-block-action-submenu-arrow");
      const panel = createElement(this.#document, "div", "mn-tiptap-block-action-submenu-panel");
      if (!section || !trigger || !icon || !copy || !title || !description || !arrow || !panel) return;

      section.role = "group";
      section.dataset.submenu = group.id;
      section.dataset.active = group.trigger.index === state.selectedIndex ? "true" : "false";
      trigger.type = "button";
      trigger.id = commandElementId(this.#ownerId, group.trigger.index);
      trigger.role = "menuitem";
      trigger.dataset.commandId = group.trigger.id;
      trigger.dataset.commandIndex = String(group.trigger.index);
      trigger.dataset.submenuTrigger = group.id;
      trigger.classList.toggle("active", section.dataset.active === "true");
      trigger.tabIndex = group.trigger.index === state.selectedIndex ? 0 : -1;
      icon.setAttribute("aria-hidden", "true");
      arrow.setAttribute("aria-hidden", "true");
      title.textContent = group.name;
      description.textContent = group.description;
      copy.append(title, description);
      trigger.append(icon, copy, arrow);
      trigger.addEventListener("pointerenter", () => {
        this.#activateWithIntent(() => state.activate(group.trigger.index, { scroll: false }));
      });
      trigger.addEventListener("focus", () =>
        state.activate(group.trigger.index, { scroll: true }),
      );

      group.commands.forEach((command) => {
        const item = createElement(this.#document, "button", "mn-tiptap-block-action-submenu-item");
        const itemIcon = createElement(
          this.#document,
          "span",
          `mn-tiptap-block-action-menu-icon ${command.icon ?? "block"}`,
        );
        const itemCopy = createElement(this.#document, "span", "mn-tiptap-block-action-menu-copy");
        const itemTitle = createElement(this.#document, "span", "mn-tiptap-block-action-menu-title");
        const itemDescription = createElement(
          this.#document,
          "span",
          "mn-tiptap-block-action-menu-description",
        );
        if (!item || !itemIcon || !itemCopy || !itemTitle || !itemDescription) return;

        item.type = "button";
        item.role = "menuitem";
        const commandIndex = Number.isInteger(command.index)
          ? command.index
          : submenuCommandIndex(state.commands, group.id, command.id);
        item.id = commandElementId(this.#ownerId, commandIndex);
        item.dataset.commandId = command.id;
        item.dataset.commandIndex = String(commandIndex);
        item.dataset.submenu = group.id;
        item.dataset.active = command.active ? "true" : "false";
        item.classList.toggle("active", commandIndex === state.selectedIndex);
        item.tabIndex = commandIndex === state.selectedIndex ? 0 : -1;
        itemIcon.setAttribute("aria-hidden", "true");
        itemTitle.textContent = command.title;
        itemDescription.textContent = command.description;
        itemCopy.append(itemTitle, itemDescription);
        item.append(itemIcon, itemCopy);
        item.addEventListener("pointerenter", () => {
          if (commandIndex >= 0) {
            this.#activateWithIntent(() => state.activate(commandIndex, { scroll: false }));
          }
        });
        item.addEventListener("focus", () => {
          if (commandIndex >= 0) {
            state.activate(commandIndex, { scroll: true });
          }
        });
        bindPointerActivation(item, () => state.run(command.id));
        panel.appendChild(item);
      });

      actionsSection?.appendChild(trigger);
      section.appendChild(panel);
      this.#submenus.appendChild(section);
    });
    if (this.#submenuHint) {
      this.#submenuHint.textContent = submenus[0]?.description ?? "";
      setHidden(this.#submenuHint, submenus.length === 0);
    }

    syncActiveCommand(this.#root, this.#ownerId, state.commands, state.selectedIndex);
    this.#syncSubmenuActive(state);
    setHidden(this.#root, false);
    placeMenu(this.#root, state.target, this.#window, state.anchorRect);
    this.#syncSubmenuPlacement(state);
  }

  updateSelection(state, options = {}) {
    if (!this.#root || !state.open) return false;
    syncActiveCommand(this.#root, this.#ownerId, state.commands, state.selectedIndex, options);
    this.#syncSubmenuActive(state);
    return true;
  }

  #activateWithIntent(run) {
    this.#window?.clearTimeout?.(this.#hoverTimer);
    this.#hoverTimer = this.#window?.setTimeout
      ? this.#window.setTimeout(run, HOVER_INTENT_DELAY_MS)
      : null;
    if (this.#hoverTimer == null) {
      run();
    }
  }

  #syncSubmenuActive(state) {
    const activeSubmenu = state.commands[state.selectedIndex]?.submenu ?? "";
    const visit = (element) => {
      if (!element) return;
      const triggerSubmenu = element.dataset?.submenuTrigger;
      if (triggerSubmenu) {
        element.classList?.toggle?.("active", triggerSubmenu === activeSubmenu);
      } else if (element.dataset?.submenu && String(element.className ?? "").includes("submenu") && !element.dataset?.commandId) {
        element.dataset.active = element.dataset.submenu === activeSubmenu ? "true" : "false";
      }
      Array.from(element.children ?? []).forEach(visit);
    };
    visit(this.#submenus);
    visit(this.#list);
  }

  #syncSubmenuPlacement(state) {
    if (!this.#root || !this.#submenus) return;
    const hasActiveSubmenu = Boolean(state.commands[state.selectedIndex]?.submenu);
    if (!hasActiveSubmenu) {
      this.#root.dataset.sidePlacement = "right";
      return;
    }

    const rect = this.#root.getBoundingClientRect?.();
    const viewport = viewportSize(this.#root, this.#window);
    const neededWidth = SUBMENU_WIDTH + SUBMENU_GAP + DEFAULT_MARGIN;
    const shouldFlip =
      rect &&
      rect.right + neededWidth > viewport.width &&
      rect.left - neededWidth > DEFAULT_MARGIN;
    this.#root.dataset.sidePlacement = shouldFlip ? "left" : "right";
  }

  hide() {
    this.#window?.clearTimeout?.(this.#hoverTimer);
    this.#hoverTimer = null;
    setHidden(this.#root, true);
  }

  contains(target) {
    return this.#root?.contains?.(target) ?? false;
  }

  destroy() {
    this.#window?.clearTimeout?.(this.#hoverTimer);
    this.#root?.remove?.();
    this.#root = null;
    this.#header = null;
    this.#eyebrow = null;
    this.#title = null;
    this.#body = null;
    this.#list = null;
    this.#submenus = null;
    this.#submenuHint = null;
  }
}

export class TiptapBlockActionMenuController {
  #commands;
  #view;
  #dismiss;
  #document = null;
  #externalContains = () => false;
  #openStateListener = () => {};
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
      shouldDismissOnScroll: (event) => this.#shouldDismissOnScroll(event),
      onDismiss: () => this.close(),
      pointerDismissEvent: "pointerup",
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

  setOpenStateListener(listener) {
    this.#openStateListener = typeof listener === "function" ? listener : () => {};
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

  #shouldDismissOnScroll(event) {
    const target = event?.target;
    return !(
      target == null ||
      target === this.#document?.body ||
      target === this.#editor?.view?.dom ||
      this.#editor?.view?.dom?.contains?.(target)
    );
  }

  open(target, { anchorRect = null, preserveSelection = false } = {}) {
    if (!this.#editor || this.#entry?.viewMode !== "hybrid" || !target?.block) {
      this.close();
      return this.state;
    }

    const previousCommandId = preserveSelection
      ? this.#state.commands[this.#state.selectedIndex]?.id
      : null;
    const commands = prepareMenuCommands(
      this.#commands.list({
        editor: this.#editor,
        entry: this.#entry,
        language: this.#entry?.preferences?.language,
        target,
      }),
    );
    this.#state = {
      open: true,
      target,
      commands,
      selectedIndex: 0,
      anchorRect,
      language: this.#entry?.preferences?.language,
    };
    const retainedIndex = this.#state.commands.findIndex(
      (command) => command.id === previousCommandId,
    );
    if (retainedIndex >= 0) {
      this.#state.selectedIndex = retainedIndex;
    }
    this.#view.update?.(
      {
        ...this.#state,
        run: (commandId) => this.run(commandId),
        activate: (nextIndex, options) => this.setSelection(nextIndex, options),
      },
      this.#editor,
    );
    this.#dismiss.open();
    this.#openStateListener(this.state);
    return this.state;
  }

  refresh() {
    if (!this.#state.open || !this.#state.target) return this.state;
    return this.open(this.#state.target, {
      anchorRect: this.#state.anchorRect,
      preserveSelection: true,
    });
  }

  moveSelection(delta) {
    if (!this.#state.open || this.#state.commands.length === 0) return this.state;
    const count = this.#state.commands.length;
    return this.setSelection((this.#state.selectedIndex + delta + count) % count);
  }

  setSelection(index, { scroll = true } = {}) {
    const selectedIndex = Number(index);
    if (
      !this.#state.open ||
      !Number.isInteger(selectedIndex) ||
      selectedIndex < 0 ||
      selectedIndex >= this.#state.commands.length ||
      selectedIndex === this.#state.selectedIndex
    ) {
      return this.state;
    }

    this.#state = {
      ...this.#state,
      selectedIndex,
    };
    const viewState = {
      ...this.#state,
      run: (commandId) => this.run(commandId),
      activate: (nextIndex, options) => this.setSelection(nextIndex, options),
    };
    if (this.#view.updateSelection?.(viewState, { scroll }, this.#editor) !== true) {
      this.#view.update?.(viewState, this.#editor);
    }
    return this.state;
  }

  run(commandId = this.#state.commands[this.#state.selectedIndex]?.id) {
    if (!this.#state.open || !commandId || !this.#editor) return false;
    const selectedCommand =
      this.#state.commands.find((command) => command.id === commandId) ?? null;
    if (selectedCommand?.submenu && Array.isArray(selectedCommand.children)) {
      this.setSelection(this.#state.commands.indexOf(selectedCommand), { scroll: false });
      return true;
    }
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

    if (event.key === "ArrowRight") {
      const selectedCommand = this.#state.commands[this.#state.selectedIndex];
      const submenu = commandSubmenuId(selectedCommand);
      const nextIndex =
        selectedCommand?.submenu && Array.isArray(selectedCommand.children)
          ? firstSubmenuChildIndex(this.#state.commands, submenu)
          : nextCommandIndexInSubmenu(this.#state.commands, this.#state.selectedIndex, 1);
      if (nextIndex >= 0 && nextIndex !== this.#state.selectedIndex) {
        event.preventDefault();
        this.setSelection(nextIndex);
        return true;
      }
    }

    if (event.key === "ArrowLeft") {
      const submenu = commandSubmenuId(this.#state.commands[this.#state.selectedIndex]);
      const nextIndex = submenuParentIndex(this.#state.commands, submenu);
      if (nextIndex >= 0 && nextIndex !== this.#state.selectedIndex) {
        event.preventDefault();
        this.setSelection(nextIndex);
        return true;
      }
      if (submenu) {
        event.preventDefault();
        return true;
      }
    }

    if (event.key === "Home" || event.key === "End") {
      if (this.#state.commands.length === 0) return false;
      event.preventDefault();
      const selectedCommand = this.#state.commands[this.#state.selectedIndex];
      const onSubmenuChild =
        selectedCommand?.submenu &&
        !Array.isArray(selectedCommand.children) &&
        selectedCommand.id !== selectedCommand.submenu;
      const submenu = onSubmenuChild
        ? commandSubmenuId(selectedCommand)
        : "";
      if (submenu) {
        const children = this.#state.commands
          .map((command, index) => ({ command, index }))
          .filter(({ command }) => command.submenu === submenu && !Array.isArray(command.children) && command.id !== submenu);
        this.setSelection(event.key === "Home" ? children[0].index : children.at(-1).index);
      } else {
        const topLevel = this.#state.commands
          .map((command, index) => ({ command, index }))
          .filter(({ command }) => !command.submenu || Array.isArray(command.children));
        this.setSelection(event.key === "Home" ? topLevel[0].index : topLevel.at(-1).index);
      }
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
    this.#openStateListener(this.state);
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
