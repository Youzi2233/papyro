import {
  addColumnRightLabel,
  addRowBelowLabel,
  insertBlockAtEdgeLabel,
  selectTableColumnLabel,
  selectTableRowLabel,
  tableContextEyebrowLabel,
  tableContextSubtitleLabel,
  tableContextTitleLabel,
  tableCommandMenuSectionLabel,
  tableToolsLabel,
} from "./tiptap-i18n.js";
import { normalizedRect } from "./tiptap-table-geometry.js";
import {
  applyTableCellVisualState,
  clearTableCellVisualState,
  createComplexBlockInsertChromeState,
  createTableAxisHoverChromeState,
  createTableAxisHandleChromeState,
  createTableCellMenuTriggerChromeState,
  createTableQuickAddChromeState,
  createTableSelectionBackdropChromeState,
  tableMenuAnchorRect,
} from "./tiptap-table-chrome-model.js";
import {
  createTableCommandMenuModel,
  tableCommandVariant,
  visibleTableCommands,
} from "./tiptap-table-commands.js";
import {
  bindPointerActivation,
  commandElementId,
  createElement,
  defaultDocument,
  defaultWindow,
  menuCommandItems,
  mountFloatingRoot,
  positionFloatingElement,
  setHidden,
  syncMenuActiveDescendant,
  viewportSize,
} from "./tiptap-ui-primitives.js";

const TABLE_AXIS_HANDLE_SIZE = 12;
export const TABLE_ROW_HANDLE_WIDTH = 20;
export const TABLE_COLUMN_HANDLE_HEIGHT = 20;
const TABLE_ADD_ROW_HEIGHT = 14;
const TABLE_ADD_COLUMN_WIDTH = 14;
const TABLE_CONTEXT_MENU_WIDTH = 176;
const TABLE_KEYBOARD_MENU_WIDTH = 520;
const TABLE_TOOLBAR_OWNER_ID = "mn-tiptap-table-toolbar";
const TABLE_CHROME_HIDDEN_OPTIONS = {
  visibilityAttributes: true,
  inertFocus: true,
};
const TABLE_DECORATION_HIDDEN_OPTIONS = {
  visibilityAttributes: true,
};

function setTableChromeHidden(element, hidden) {
  setHidden(element, hidden, TABLE_CHROME_HIDDEN_OPTIONS);
}

function setTableDecorationHidden(element, hidden) {
  setHidden(element, hidden, TABLE_DECORATION_HIDDEN_OPTIONS);
}

function commandButtonById(root, commandId) {
  if (!root || !commandId) return null;
  const selector = `[data-command-id="${commandId}"]`;
  if (typeof root.querySelector === "function") {
    try {
      const found = root.querySelector(selector);
      if (found) return found;
    } catch (_error) {
      // Fall through to the small tree walk used by tests and non-standard DOMs.
    }
  }

  const children = Array.from(root.children ?? []);
  for (const child of children) {
    if (child?.dataset?.commandId === commandId) return child;
    const found = commandButtonById(child, commandId);
    if (found) return found;
  }
  return null;
}

function bindPointerCommand(button, command, run) {
  if (!button || typeof run !== "function") return;
  const execute = () => {
    if (command?.disabled) return false;
    return run() !== false;
  };

  bindPointerActivation(button, execute);
}

function axisHandleAnchorRect(button, handle) {
  const domRect = normalizedRect(button?.getBoundingClientRect?.());
  if (domRect) return domRect;
  return normalizedRect({
    left: handle?.left,
    top: handle?.top,
    right: Number(handle?.left) + Number(handle?.width),
    bottom: Number(handle?.top) + Number(handle?.height),
    width: handle?.width,
    height: handle?.height,
  });
}

function syncTableToolbarActiveCommand(
  root,
  ownerId,
  commands,
  activeCommandId,
  { keyboardActive = true, scroll = true } = {},
) {
  if (!root) return false;

  const selectedIndex = commands.findIndex(
    (command) => command.id === activeCommandId && !command.disabled,
  );
  const hasSelection = selectedIndex >= 0;
  const syncCommands = hasSelection ? commands : [];
  syncMenuActiveDescendant(root, ownerId, syncCommands, selectedIndex, {
    manageTabIndex: true,
    scroll: hasSelection && scroll,
  });
  menuCommandItems(root).forEach((button) => {
    const active = Number(button.dataset?.commandIndex) === selectedIndex;
    button.dataset.keyboardActive = active ? "true" : "false";
  });
  root.dataset.keyboardActive = keyboardActive ? "true" : "false";
  return hasSelection;
}

export class TiptapTableToolbarView {
  #document;
  #window;
  #root = null;
  #header = null;
  #eyebrow = null;
  #title = null;
  #subtitle = null;
  #list = null;
  #addRowButton = null;
  #addColumnButton = null;
  #cellMenuButton = null;
  #blockInsertButton = null;
  #rowHandles = [];
  #columnHandles = [];
  #selectionBackdrop = null;
  #selectionCells = [];
  #axisHoverBackdrops = [];
  #chromeRoot = null;
  #reactChrome = null;
  #reactMenu = null;
  #menuRendererFactory = null;
  #chromeRendererFactory = null;
  #lastTable = null;
  #lastActiveCell = null;
  #menuCommands = [];

  constructor({
    document = defaultDocument(),
    window = defaultWindow(document),
    menuRendererFactory = null,
    chromeRendererFactory = null,
  } = {}) {
    this.#document = document;
    this.#window = window;
    this.#menuRendererFactory = menuRendererFactory;
    this.#chromeRendererFactory = chromeRendererFactory;
  }

  mount(container) {
    if (this.#root || !this.#document) return;

    const root = createElement(this.#document, "div", "mn-tiptap-table-toolbar hidden");
    const header = createElement(this.#document, "div", "mn-tiptap-table-toolbar-header");
    const eyebrow = createElement(this.#document, "div", "mn-tiptap-table-toolbar-eyebrow");
    const title = createElement(this.#document, "div", "mn-tiptap-table-toolbar-title");
    const subtitle = createElement(this.#document, "div", "mn-tiptap-table-toolbar-subtitle");
    const list = createElement(this.#document, "div", "mn-tiptap-table-toolbar-list");
    const addRowButton = createElement(
      this.#document,
      "button",
      "mn-tiptap-table-quick-add mn-tiptap-table-add-row hidden",
    );
    const addColumnButton = createElement(
      this.#document,
      "button",
      "mn-tiptap-table-quick-add mn-tiptap-table-add-column hidden",
    );
    const cellMenuButton = createElement(
      this.#document,
      "button",
      "mn-tiptap-table-cell-menu-trigger hidden",
    );
    const blockInsertButton = createElement(
      this.#document,
      "button",
      "mn-tiptap-complex-block-insert hidden",
    );
    const selectionBackdrop = createElement(
      this.#document,
      "div",
      "mn-tiptap-table-selection-backdrop hidden",
    );
    const chromeRoot = createElement(
      this.#document,
      "div",
      "mn-tiptap-table-chrome-root hidden",
    );
    if (
      !root ||
      !header ||
      !eyebrow ||
      !title ||
      !subtitle ||
      !list ||
      !addRowButton ||
      !addColumnButton ||
      !cellMenuButton ||
      !blockInsertButton ||
      !selectionBackdrop ||
      !chromeRoot
    ) return;

    root.id = TABLE_TOOLBAR_OWNER_ID;
    root.role = "toolbar";
    const reactMenu =
      typeof this.#menuRendererFactory === "function"
        ? this.#menuRendererFactory({
            root,
            ownerId: TABLE_TOOLBAR_OWNER_ID,
          })
        : null;
    const reactChrome =
      typeof this.#chromeRendererFactory === "function"
        ? this.#chromeRendererFactory({
            root: chromeRoot,
            ownerId: `${TABLE_TOOLBAR_OWNER_ID}-chrome`,
          })
        : null;
    if (!reactChrome) {
      addRowButton.type = "button";
      addColumnButton.type = "button";
      cellMenuButton.type = "button";
      cellMenuButton.setAttribute("aria-hidden", "false");
      cellMenuButton.setAttribute("aria-haspopup", "menu");
      blockInsertButton.type = "button";
    }
    if (!reactMenu) {
      header.append(eyebrow, title, subtitle);
      root.append(header, list);
    }
    mountFloatingRoot(root, container, this.#document);
    mountFloatingRoot(chromeRoot, container, this.#document);
    if (!reactChrome) {
      mountFloatingRoot(addRowButton, container, this.#document);
      mountFloatingRoot(addColumnButton, container, this.#document);
      mountFloatingRoot(cellMenuButton, container, this.#document);
      mountFloatingRoot(blockInsertButton, container, this.#document);
      mountFloatingRoot(selectionBackdrop, container, this.#document);
    }
    this.#root = root;
    this.#header = header;
    this.#eyebrow = eyebrow;
    this.#title = title;
    this.#subtitle = subtitle;
    this.#list = list;
    this.#addRowButton = reactChrome ? null : addRowButton;
    this.#addColumnButton = reactChrome ? null : addColumnButton;
    this.#cellMenuButton = reactChrome ? null : cellMenuButton;
    this.#blockInsertButton = reactChrome ? null : blockInsertButton;
    this.#selectionBackdrop = reactChrome ? null : selectionBackdrop;
    this.#chromeRoot = chromeRoot;
    this.#reactChrome = reactChrome;
    this.#reactMenu = reactMenu;
    setHidden(root, true);
    if (!reactChrome) {
      setTableChromeHidden(addRowButton, true);
      setTableChromeHidden(addColumnButton, true);
      setTableChromeHidden(cellMenuButton, true);
      setTableChromeHidden(blockInsertButton, true);
      setTableDecorationHidden(selectionBackdrop, true);
    }
    setTableDecorationHidden(chromeRoot, true);
  }

  update(state) {
    if (!this.#root || !this.#list) return;
    if (!state.open) {
      this.hide();
      return;
    }

    if (!this.#reactMenu) {
      this.#list.replaceChildren();
    }
    this.#root.setAttribute("aria-label", tableToolsLabel(state.language));
    this.#root.dataset.mode = state.mode;
    this.#root.dataset.open = state.menuOpen ? "true" : "false";
    this.#root.dataset.selectionKind = state.selection?.kind ?? "cell";
    if (this.#lastTable && this.#lastTable !== state.table) {
      clearTableCellVisualState(this.#lastTable);
      this.#lastActiveCell = null;
    }
    this.#lastTable = state.table ?? null;
    if (!this.#reactMenu && this.#header && this.#eyebrow && this.#title && this.#subtitle) {
      this.#eyebrow.textContent = tableContextEyebrowLabel(state.language);
      this.#title.textContent =
        state.mode === "context"
          ? tableContextTitleLabel(state.language, state.selection?.kind)
          : tableToolsLabel(state.language);
      this.#subtitle.textContent =
        state.mode === "context"
          ? tableContextSubtitleLabel(state.language, state.selection)
          : "";
    }
    if (this.#addRowButton) {
      this.#addRowButton.title = addRowBelowLabel(state.language);
      this.#addRowButton.setAttribute("aria-label", addRowBelowLabel(state.language));
    }
    if (this.#addColumnButton) {
      this.#addColumnButton.title = addColumnRightLabel(state.language);
      this.#addColumnButton.setAttribute("aria-label", addColumnRightLabel(state.language));
    }
    if (this.#cellMenuButton) {
      const cellMenuLabel = tableContextTitleLabel(
        state.language,
        state.selection?.kind ?? "cell",
      );
      this.#cellMenuButton.title = cellMenuLabel;
      this.#cellMenuButton.setAttribute("aria-label", cellMenuLabel);
      this.#cellMenuButton.dataset.open = state.menuOpen ? "true" : "false";
      this.#cellMenuButton.dataset.selectionKind = state.selection?.kind ?? "cell";
      this.#cellMenuButton.dataset.selectedCount = String(
        state.selection?.positions?.size ?? 0,
      );
      this.#cellMenuButton.setAttribute("aria-expanded", state.menuOpen ? "true" : "false");
      this.#cellMenuButton._mnRun = () =>
        state.openCellMenu?.("context", {
          anchorRect: this.#cellMenuButton?.getBoundingClientRect?.(),
          cell: state.hover?.cell ?? state.cell ?? null,
        }) !== false;
      if (!this.#cellMenuButton._mnBound) {
        bindPointerCommand(this.#cellMenuButton, null, () => this.#cellMenuButton?._mnRun?.());
        this.#cellMenuButton._mnBound = true;
      }
    }
    const menuCommands = state.menuOpen
      ? visibleTableCommands(state.commands, state.mode, state.selection?.kind)
      : [];
    this.#menuCommands = menuCommands;
    if (this.#reactMenu) {
      this.#reactMenu.render({
        state,
        commands: menuCommands,
        language: state.language,
      });
    } else {
      this.#renderLegacyMenu(state, menuCommands);
    }

    setHidden(this.#root, !state.menuOpen || menuCommands.length === 0);
    syncTableToolbarActiveCommand(
      this.#root,
      TABLE_TOOLBAR_OWNER_ID,
      menuCommands,
      state.activeCommandId,
      {
        keyboardActive: state.keyboardActive,
        scroll: state.keyboardActive,
      },
    );
    this.#root.onkeydown = (event) => state.handleKeyDown?.(event);
    if (this.#reactChrome) {
      this.#hideLegacyChrome();
      this.#reactChrome.render(state);
    } else {
      this.#applySelectionState(state);
      this.#applyActiveCellState(state);
      this.#updateSelectionBackdrop(state);
      this.#updateAxisHoverBackdrop(state);
      this.#updateQuickAdd(state);
      this.#updateCellMenuTrigger(state);
      this.#updateComplexBlockInsert(state);
      this.#updateAxisHandles(state);
    }
    if (!state.menuOpen || menuCommands.length === 0) {
      return;
    }
    const anchorRect = tableMenuAnchorRect(state);
    positionFloatingElement(this.#root, anchorRect, {
      viewport: viewportSize(state.table, this.#window),
      size: {
        width: state.mode === "keyboard" ? TABLE_KEYBOARD_MENU_WIDTH : TABLE_CONTEXT_MENU_WIDTH,
        height: state.mode === "keyboard" ? 42 : 310,
        margin: 10,
      },
      placement: state.mode === "keyboard" ? "top" : "bottom",
    });
  }

  #renderLegacyMenu(state, menuCommands) {
    if (!this.#list) return;
    const commandGroups = [];
    createTableCommandMenuModel(menuCommands, {
      mode: state.mode,
      selectionKind: state.selection?.kind,
      activeCommandId: state.activeCommandId,
      sectionLabel: (section) => tableCommandMenuSectionLabel(state.language, section),
    }).groups.forEach((group) => {
      const layoutGroup = group.layoutGroup;
      const groupKey = group.groupKey;
      const groupElement = createElement(this.#document, "div", "mn-tiptap-table-toolbar-group");
      if (!groupElement) return;
      groupElement.dataset.groupKey = groupKey;
      groupElement.dataset.group = group.group;
      groupElement.dataset.layoutGroup = layoutGroup;
      groupElement.dataset.menuSection = group.menuSection;
      const label = group.showLabel
        ? createElement(this.#document, "div", "mn-tiptap-table-toolbar-group-label")
        : null;
      if (label) {
        label.textContent = group.group;
        groupElement.appendChild(label);
      }
      commandGroups.push(groupElement);

      group.commands.forEach((command) => {
        const commandIndex = command.index;
        const button = createElement(this.#document, "button", "mn-tiptap-table-toolbar-button");
        if (!button) return;

        button.type = "button";
        button.id = commandElementId(TABLE_TOOLBAR_OWNER_ID, commandIndex);
        button.role = state.mode === "context" ? "menuitem" : "button";
        button.title = command.title;
        button.setAttribute(
          "aria-label",
          command.description ? `${command.title}. ${command.description}` : command.title,
        );
        button.textContent = state.mode === "context" ? command.title : command.label;
        button.dataset.commandId = command.id;
        button.dataset.commandIndex = String(commandIndex);
        button.dataset.group = command.group;
        button.dataset.icon = command.icon ?? command.id;
        button.dataset.variant = command.variant ?? tableCommandVariant(command);
        button.dataset.tone = command.tone ?? "default";
        button.dataset.active = command.active ? "true" : "false";
        button.dataset.keyboardActive = state.activeCommandId === command.id ? "true" : "false";
        button.dataset.disabled = command.disabled ? "true" : "false";
        button.tabIndex = state.activeCommandId === command.id ? 0 : -1;
        button.disabled = !!command.disabled;
        button.setAttribute("aria-disabled", command.disabled ? "true" : "false");
        button.addEventListener("pointerenter", () =>
          state.setActiveCommand?.(command.id, { keyboardActive: false }),
        );
        button.addEventListener("focus", () =>
          state.setActiveCommand?.(command.id, { keyboardActive: true }),
        );
        bindPointerCommand(button, command, () => state.run(command.id));
        const visual = createElement(
          this.#document,
          "span",
          "mn-tiptap-table-toolbar-button-visual",
        );
        if (visual) {
          visual.setAttribute("aria-hidden", "true");
          visual.dataset.icon = command.icon ?? command.id;
          visual.dataset.variant = command.variant ?? tableCommandVariant(command);
          if (
            command.variant === "icon" ||
            command.variant === "swatch" ||
            command.variant === "text-swatch"
          ) {
            button.replaceChildren(visual);
          } else if (state.mode === "context") {
            const copy = createElement(
              this.#document,
              "span",
              "mn-tiptap-table-toolbar-button-copy",
            );
            const label = createElement(
              this.#document,
              "span",
              "mn-tiptap-table-toolbar-button-label",
            );
            const description = command.description
              ? createElement(
                  this.#document,
                  "span",
                  "mn-tiptap-table-toolbar-button-description",
                )
              : null;
            if (copy && label) {
              label.textContent = command.title;
              copy.appendChild(label);
              if (description) {
                description.textContent = command.description;
                copy.appendChild(description);
              }
              button.replaceChildren(visual, copy);
            }
          }
        }
        groupElement.appendChild(button);
      });
    });
    this.#list.append(...commandGroups);
  }

  #updateQuickAdd(state) {
    if (!this.#addRowButton || !this.#addColumnButton) return;
    const quickAdd = createTableQuickAddChromeState(state, {
      rowHeight: TABLE_ADD_ROW_HEIGHT,
      columnWidth: TABLE_ADD_COLUMN_WIDTH,
    });
    if (!quickAdd.row || !quickAdd.column) {
      setTableChromeHidden(this.#addRowButton, true);
      setTableChromeHidden(this.#addColumnButton, true);
      return;
    }

    this.#addRowButton.style.left = `${quickAdd.row.left}px`;
    this.#addRowButton.style.top = `${quickAdd.row.top}px`;
    this.#addRowButton.style.width = `${quickAdd.row.width}px`;
    this.#addRowButton.style.height = `${quickAdd.row.height}px`;
    this.#addColumnButton.style.left = `${quickAdd.column.left}px`;
    this.#addColumnButton.style.top = `${quickAdd.column.top}px`;
    this.#addColumnButton.style.width = `${quickAdd.column.width}px`;
    this.#addColumnButton.style.height = `${quickAdd.column.height}px`;
    this.#addRowButton.dataset.edge = quickAdd.row.edge;
    this.#addRowButton.style.setProperty("--mn-table-quick-add-rail", `${quickAdd.row.rail}px`);
    if (quickAdd.row.visual) {
      this.#addRowButton.style.setProperty(
        "--mn-table-quick-add-visual-left",
        `${quickAdd.row.visual.left - quickAdd.row.left}px`,
      );
      this.#addRowButton.style.setProperty(
        "--mn-table-quick-add-visual-top",
        `${quickAdd.row.visual.top - quickAdd.row.top}px`,
      );
      this.#addRowButton.style.setProperty(
        "--mn-table-quick-add-visual-width",
        `${quickAdd.row.visual.width}px`,
      );
      this.#addRowButton.style.setProperty(
        "--mn-table-quick-add-visual-height",
        `${quickAdd.row.visual.height}px`,
      );
      this.#addRowButton.style.setProperty(
        "--mn-table-quick-add-visual-center-x",
        `${quickAdd.row.visual.left - quickAdd.row.left + quickAdd.row.visual.width / 2}px`,
      );
      this.#addRowButton.style.setProperty(
        "--mn-table-quick-add-visual-center-y",
        `${quickAdd.row.visual.top - quickAdd.row.top + quickAdd.row.visual.height / 2}px`,
      );
    }
    this.#addColumnButton.dataset.edge = quickAdd.column.edge;
    this.#addColumnButton.style.setProperty("--mn-table-quick-add-rail", `${quickAdd.column.rail}px`);
    if (quickAdd.column.visual) {
      this.#addColumnButton.style.setProperty(
        "--mn-table-quick-add-visual-left",
        `${quickAdd.column.visual.left - quickAdd.column.left}px`,
      );
      this.#addColumnButton.style.setProperty(
        "--mn-table-quick-add-visual-top",
        `${quickAdd.column.visual.top - quickAdd.column.top}px`,
      );
      this.#addColumnButton.style.setProperty(
        "--mn-table-quick-add-visual-width",
        `${quickAdd.column.visual.width}px`,
      );
      this.#addColumnButton.style.setProperty(
        "--mn-table-quick-add-visual-height",
        `${quickAdd.column.visual.height}px`,
      );
      this.#addColumnButton.style.setProperty(
        "--mn-table-quick-add-visual-center-x",
        `${quickAdd.column.visual.left - quickAdd.column.left + quickAdd.column.visual.width / 2}px`,
      );
      this.#addColumnButton.style.setProperty(
        "--mn-table-quick-add-visual-center-y",
        `${quickAdd.column.visual.top - quickAdd.column.top + quickAdd.column.visual.height / 2}px`,
      );
    }

    this.#addRowButton._mnCommand = quickAdd.row.command;
    this.#addColumnButton._mnCommand = quickAdd.column.command;
    this.#addRowButton._mnRun = () => state.run("add-row-after");
    this.#addColumnButton._mnRun = () => state.run("add-column-after");
    if (!this.#addRowButton._mnBound) {
      bindPointerCommand(this.#addRowButton, null, () => {
        if (this.#addRowButton?._mnCommand?.disabled) return false;
        return this.#addRowButton?._mnRun?.() !== false;
      });
      this.#addRowButton._mnBound = true;
    }
    if (!this.#addColumnButton._mnBound) {
      bindPointerCommand(this.#addColumnButton, null, () => {
        if (this.#addColumnButton?._mnCommand?.disabled) return false;
        return this.#addColumnButton?._mnRun?.() !== false;
      });
      this.#addColumnButton._mnBound = true;
    }
    this.#addRowButton.disabled = quickAdd.row.disabled;
    this.#addRowButton.dataset.disabled = quickAdd.row.disabled ? "true" : "false";
    this.#addRowButton.setAttribute("aria-disabled", quickAdd.row.disabled ? "true" : "false");
    this.#addColumnButton.disabled = quickAdd.column.disabled;
    this.#addColumnButton.dataset.disabled = quickAdd.column.disabled ? "true" : "false";
    this.#addColumnButton.setAttribute("aria-disabled", quickAdd.column.disabled ? "true" : "false");
    setTableChromeHidden(this.#addRowButton, !quickAdd.row.visible);
    setTableChromeHidden(this.#addColumnButton, !quickAdd.column.visible);
  }

  #updateCellMenuTrigger(state) {
    if (!this.#cellMenuButton) return;
    const triggerState = createTableCellMenuTriggerChromeState(state);
    const trigger = triggerState.trigger;
    if (!trigger) {
      setTableChromeHidden(this.#cellMenuButton, true);
      return;
    }
    this.#cellMenuButton.style.left = `${trigger.left}px`;
    this.#cellMenuButton.style.top = `${trigger.top}px`;
    this.#cellMenuButton.dataset.placement = trigger.placement;
    this.#cellMenuButton.dataset.edgeIntent = triggerState.edgeIntent ? "true" : "false";
    this.#cellMenuButton.dataset.actionScope = triggerState.actionScope;
    setTableChromeHidden(this.#cellMenuButton, !triggerState.visible);
  }

  #updateComplexBlockInsert(state) {
    if (!this.#blockInsertButton) return;
    const insertState = createComplexBlockInsertChromeState(state);
    if (!insertState.block || !insertState.rect) {
      setTableChromeHidden(this.#blockInsertButton, true);
      return;
    }

    const label = insertBlockAtEdgeLabel(state.language, insertState.edge);
    this.#blockInsertButton.title = label;
    this.#blockInsertButton.setAttribute("aria-label", label);
    this.#blockInsertButton.style.left = `${insertState.rect.left}px`;
    this.#blockInsertButton.style.top = `${insertState.rect.top}px`;
    this.#blockInsertButton.style.width = `${insertState.rect.width}px`;
    this.#blockInsertButton.dataset.edge = "after-block";
    this.#blockInsertButton.dataset.insertEdge = insertState.edge;
    this.#blockInsertButton.dataset.blockKind = insertState.blockKind;
    this.#blockInsertButton._mnRun = () =>
      state.insertParagraphAfterBlock?.(insertState.block, { edge: insertState.edge }) !== false;
    bindPointerCommand(this.#blockInsertButton, null, () => this.#blockInsertButton?._mnRun?.());

    setTableChromeHidden(this.#blockInsertButton, !insertState.visible);
  }

  #updateSelectionBackdrop(state) {
    if (!this.#selectionBackdrop) return;
    this.#clearSelectionCells();
    const backdrop = createTableSelectionBackdropChromeState(state);
    if (!backdrop.visible || !backdrop.rect) {
      setTableDecorationHidden(this.#selectionBackdrop, true);
      return;
    }

    const rect = backdrop.rect;
    this.#selectionBackdrop.style.left = `${rect.left}px`;
    this.#selectionBackdrop.style.top = `${rect.top}px`;
    this.#selectionBackdrop.style.width = `${Math.max(0, rect.width)}px`;
    this.#selectionBackdrop.style.height = `${Math.max(0, rect.height)}px`;
    this.#selectionBackdrop.dataset.selectionKind = backdrop.selectionKind;
    this.#selectionBackdrop.dataset.selectedCount = String(backdrop.selectedCount ?? 0);
    setTableDecorationHidden(this.#selectionBackdrop, false);

    for (const box of backdrop.boxes ?? []) {
      const cellBox = createElement(this.#document, "div", "mn-tiptap-table-selection-cell");
      if (!cellBox) continue;
      cellBox.style.left = `${box.left}px`;
      cellBox.style.top = `${box.top}px`;
      cellBox.style.width = `${Math.max(0, box.width)}px`;
      cellBox.style.height = `${Math.max(0, box.height)}px`;
      cellBox.dataset.selectionKind = backdrop.selectionKind;
      cellBox.dataset.selectedCount = String(backdrop.selectedCount ?? 0);
      mountFloatingRoot(cellBox, state.table, this.#document);
      this.#selectionCells.push(cellBox);
    }
  }

  #updateAxisHandles(state) {
    this.#clearAxisHandles();
    const axisChrome = createTableAxisHandleChromeState(state, {
      handleSize: TABLE_AXIS_HANDLE_SIZE,
      rowHandleWidth: TABLE_ROW_HANDLE_WIDTH,
      columnHandleHeight: TABLE_COLUMN_HANDLE_HEIGHT,
    });
    for (const handle of axisChrome.rows) {
      const index = handle.index;
      const button = createElement(this.#document, "button", "mn-tiptap-table-axis-handle row");
      if (!button) return;
      button.type = "button";
      button.title = selectTableRowLabel(state.language, index);
      button.setAttribute("aria-label", selectTableRowLabel(state.language, index));
      button.dataset.active = handle.active ? "true" : "false";
      button.style.left = `${handle.left}px`;
      button.style.top = `${handle.top}px`;
      button.style.width = `${handle.width}px`;
      button.style.height = `${handle.height}px`;
      button.dataset.axis = "row";
      button.dataset.index = String(index);
      bindPointerCommand(button, null, () => {
        const anchorRect = axisHandleAnchorRect(button, handle);
        const selected = state.selectAxis("row", index) === true;
        if (!selected) return false;
        return state.toggleMenu("context", {
          open: true,
          anchorRect,
        });
      });
      mountFloatingRoot(button, state.table, this.#document);
      setTableChromeHidden(button, !handle.visible);
      this.#rowHandles.push(button);
    }

    for (const handle of axisChrome.columns) {
      const index = handle.index;
      const button = createElement(this.#document, "button", "mn-tiptap-table-axis-handle column");
      if (!button) return;
      button.type = "button";
      button.title = selectTableColumnLabel(state.language, index);
      button.setAttribute("aria-label", selectTableColumnLabel(state.language, index));
      button.dataset.active = handle.active ? "true" : "false";
      button.style.left = `${handle.left}px`;
      button.style.top = `${handle.top}px`;
      button.style.width = `${handle.width}px`;
      button.style.height = `${handle.height}px`;
      button.dataset.axis = "column";
      button.dataset.index = String(index);
      bindPointerCommand(button, null, () => {
        const anchorRect = axisHandleAnchorRect(button, handle);
        const selected = state.selectAxis("column", index) === true;
        if (!selected) return false;
        return state.toggleMenu("context", {
          open: true,
          anchorRect,
        });
      });
      mountFloatingRoot(button, state.table, this.#document);
      setTableChromeHidden(button, !handle.visible);
      this.#columnHandles.push(button);
    }
  }

  #clearAxisHandles() {
    this.#rowHandles.forEach((button) => button.remove?.());
    this.#columnHandles.forEach((button) => button.remove?.());
    this.#rowHandles = [];
    this.#columnHandles = [];
  }

  #updateAxisHoverBackdrop(state) {
    this.#clearAxisHoverBackdrops();
    const hover = createTableAxisHoverChromeState(state);
    for (const item of [...(hover.rows ?? []), ...(hover.columns ?? [])]) {
      const backdrop = createElement(this.#document, "div", "mn-tiptap-table-axis-hover-backdrop");
      if (!backdrop) continue;
      backdrop.style.left = `${item.rect.left}px`;
      backdrop.style.top = `${item.rect.top}px`;
      backdrop.style.width = `${Math.max(0, item.rect.width)}px`;
      backdrop.style.height = `${Math.max(0, item.rect.height)}px`;
      backdrop.dataset.axis = item.axis;
      backdrop.dataset.index = String(item.index);
      mountFloatingRoot(backdrop, state.table, this.#document);
      this.#axisHoverBackdrops.push(backdrop);
    }
  }

  #clearAxisHoverBackdrops() {
    this.#axisHoverBackdrops.forEach((backdrop) => backdrop.remove?.());
    this.#axisHoverBackdrops = [];
  }

  #clearSelectionCells() {
    this.#selectionCells.forEach((cell) => cell.remove?.());
    this.#selectionCells = [];
  }

  #hideLegacyChrome() {
    setTableChromeHidden(this.#addRowButton, true);
    setTableChromeHidden(this.#addColumnButton, true);
    setTableChromeHidden(this.#cellMenuButton, true);
    setTableChromeHidden(this.#blockInsertButton, true);
    setTableDecorationHidden(this.#selectionBackdrop, true);
    this.#clearSelectionCells();
    this.#clearAxisHoverBackdrops();
    this.#clearAxisHandles();
  }

  #applySelectionState(state) {
    applyTableCellVisualState(state);
  }

  #applyActiveCellState(state) {
    this.#lastActiveCell =
      state.selection?.kind === "cell" &&
      (state.selection?.positions?.size ?? 0) === 0
        ? state.cell ?? null
        : null;
  }

  hide() {
    setHidden(this.#root, true);
    setTableChromeHidden(this.#addRowButton, true);
    setTableChromeHidden(this.#addColumnButton, true);
    setTableChromeHidden(this.#cellMenuButton, true);
    setTableChromeHidden(this.#blockInsertButton, true);
    setTableDecorationHidden(this.#selectionBackdrop, true);
    this.#reactChrome?.hide?.();
    setTableDecorationHidden(this.#chromeRoot, true);
    clearTableCellVisualState(this.#lastTable);
    this.#clearSelectionCells();
    this.#clearAxisHoverBackdrops();
    this.#clearAxisHandles();
    this.#lastTable = null;
    this.#lastActiveCell = null;
  }

  contains(target) {
    return (
      this.#root?.contains?.(target) ||
      this.#addRowButton?.contains?.(target) ||
      this.#addColumnButton?.contains?.(target) ||
      this.#cellMenuButton?.contains?.(target) ||
      this.#blockInsertButton?.contains?.(target) ||
      this.#selectionBackdrop?.contains?.(target) ||
      this.#selectionCells.some((cell) => cell.contains?.(target)) ||
      this.#axisHoverBackdrops.some((backdrop) => backdrop.contains?.(target)) ||
      this.#reactChrome?.contains?.(target) ||
      this.#chromeRoot?.contains?.(target) ||
      this.#rowHandles.some((button) => button.contains?.(target)) ||
      this.#columnHandles.some((button) => button.contains?.(target)) ||
      false
    );
  }

  setActiveCommand(commandId, keyboardActive = true) {
    if (!this.#root) return false;

    return syncTableToolbarActiveCommand(
      this.#root,
      TABLE_TOOLBAR_OWNER_ID,
      this.#menuCommands,
      commandId,
      {
        keyboardActive,
        scroll: keyboardActive,
      },
    );
  }

  focusCommand(commandId) {
    const button = commandButtonById(this.#root, commandId);
    if (!button) return false;
    button.focus?.();
    return true;
  }

  destroy() {
    this.#reactMenu?.destroy?.();
    this.#reactChrome?.destroy?.();
    this.#root?.remove?.();
    this.#addRowButton?.remove?.();
    this.#addColumnButton?.remove?.();
    this.#cellMenuButton?.remove?.();
    this.#blockInsertButton?.remove?.();
    this.#selectionBackdrop?.remove?.();
    this.#chromeRoot?.remove?.();
    this.#clearSelectionCells();
    this.#clearAxisHoverBackdrops();
    this.#clearAxisHandles();
    this.#root = null;
    this.#header = null;
    this.#eyebrow = null;
    this.#title = null;
    this.#subtitle = null;
    this.#list = null;
    this.#addRowButton = null;
    this.#addColumnButton = null;
    this.#cellMenuButton = null;
    this.#blockInsertButton = null;
    this.#selectionBackdrop = null;
    this.#selectionCells = [];
    this.#axisHoverBackdrops = [];
    this.#chromeRoot = null;
    this.#reactChrome = null;
    this.#reactMenu = null;
    this.#menuRendererFactory = null;
    this.#chromeRendererFactory = null;
    this.#lastActiveCell = null;
    this.#menuCommands = [];
  }
}
