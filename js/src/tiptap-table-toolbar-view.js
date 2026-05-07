import {
  addColumnRightLabel,
  addRowBelowLabel,
  insertBlockAfterLabel,
  selectTableColumnLabel,
  selectTableRowLabel,
  tableContextEyebrowLabel,
  tableContextSubtitleLabel,
  tableContextTitleLabel,
  tableCellActionsLabel,
  tableSelectionActionsLabel,
  tableToolsLabel,
} from "./tiptap-i18n.js";
import {
  hoverIsAtLastColumn,
  hoverIsAtLastRow,
  normalizedRect,
  tableAxisHandleGeometry,
  tableCellMenuTriggerGeometry,
  tableQuickAddGeometry,
} from "./tiptap-table-geometry.js";
import {
  tableCommandLayoutGroup,
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

function tableMenuAnchorRect(state) {
  if (state?.menuAnchorRect) return state.menuAnchorRect;
  if (state?.mode === "keyboard") return state?.rect ?? null;

  const selectionKind = state?.selection?.kind ?? "cell";
  if (selectionKind === "cell" || selectionKind === "cells") {
    return state?.cellRect ?? state?.menuRect ?? state?.selectionRect ?? state?.rect ?? null;
  }

  return state?.menuRect ?? state?.selectionRect ?? state?.cellRect ?? state?.rect ?? null;
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

function hoveredCellIsSelected(state) {
  const hoverCell = state?.hover?.cell ?? null;
  if (!hoverCell) return false;
  const selected = state?.selection?.positions;
  if (!selected || selected.size === 0) return false;
  const match = (state?.grid ?? [])
    .flatMap((row) => row.cells ?? [])
    .find((cell) => cell.cell === hoverCell);
  return Number.isFinite(match?.pos) && selected.has(match.pos);
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
  #lastTable = null;
  #lastActiveCell = null;
  #menuCommands = [];

  constructor({ document = defaultDocument(), window = defaultWindow(document) } = {}) {
    this.#document = document;
    this.#window = window;
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
      !selectionBackdrop
    ) return;

    root.id = TABLE_TOOLBAR_OWNER_ID;
    root.role = "toolbar";
    header.append(eyebrow, title, subtitle);
    addRowButton.type = "button";
    addColumnButton.type = "button";
    cellMenuButton.type = "button";
    cellMenuButton.setAttribute("aria-hidden", "false");
    cellMenuButton.setAttribute("aria-haspopup", "menu");
    blockInsertButton.type = "button";
    root.append(header, list);
    mountFloatingRoot(root, container, this.#document);
    mountFloatingRoot(addRowButton, container, this.#document);
    mountFloatingRoot(addColumnButton, container, this.#document);
    mountFloatingRoot(cellMenuButton, container, this.#document);
    mountFloatingRoot(blockInsertButton, container, this.#document);
    mountFloatingRoot(selectionBackdrop, container, this.#document);
    this.#root = root;
    this.#header = header;
    this.#eyebrow = eyebrow;
    this.#title = title;
    this.#subtitle = subtitle;
    this.#list = list;
    this.#addRowButton = addRowButton;
    this.#addColumnButton = addColumnButton;
    this.#cellMenuButton = cellMenuButton;
    this.#blockInsertButton = blockInsertButton;
    this.#selectionBackdrop = selectionBackdrop;
    setHidden(root, true);
    setHidden(addRowButton, true);
    setHidden(addColumnButton, true);
    setHidden(cellMenuButton, true);
    setHidden(blockInsertButton, true);
    setHidden(selectionBackdrop, true);
  }

  update(state) {
    if (!this.#root || !this.#list) return;
    if (!state.open) {
      this.hide();
      return;
    }

    this.#list.replaceChildren();
    this.#root.setAttribute("aria-label", tableToolsLabel(state.language));
    this.#root.dataset.mode = state.mode;
    this.#root.dataset.open = state.menuOpen ? "true" : "false";
    this.#root.dataset.selectionKind = state.selection?.kind ?? "cell";
    if (this.#lastTable && this.#lastTable !== state.table) {
      this.#lastTable
        .querySelectorAll?.(".mn-tiptap-table-cell-selected")
        ?.forEach?.((cell) => cell.classList?.remove?.("mn-tiptap-table-cell-selected"));
      this.#lastTable
        .querySelectorAll?.(".mn-tiptap-table-cell-active")
        ?.forEach?.((cell) => cell.classList?.remove?.("mn-tiptap-table-cell-active"));
      this.#lastActiveCell = null;
    }
    this.#lastTable = state.table ?? null;
    if (this.#header && this.#eyebrow && this.#title && this.#subtitle) {
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
    this.#addRowButton.title = addRowBelowLabel(state.language);
    this.#addRowButton.setAttribute("aria-label", addRowBelowLabel(state.language));
    this.#addColumnButton.title = addColumnRightLabel(state.language);
    this.#addColumnButton.setAttribute("aria-label", addColumnRightLabel(state.language));
    if (this.#cellMenuButton) {
      const cellMenuLabel =
        state.selection?.kind === "cells"
          ? tableSelectionActionsLabel(state.language)
          : tableCellActionsLabel(state.language);
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
    const commandGroups = [];
    menuCommands.forEach((command, commandIndex) => {
      const layoutGroup = command.layoutGroup ?? tableCommandLayoutGroup(command);
      const groupKey = layoutGroup === "danger" ? "danger" : command.groupKey ?? command.group;
      if (commandGroups.at(-1)?.dataset?.groupKey !== groupKey) {
        const groupElement = createElement(this.#document, "div", "mn-tiptap-table-toolbar-group");
        if (!groupElement) return;
        groupElement.dataset.groupKey = groupKey;
        groupElement.dataset.group = command.group;
        groupElement.dataset.layoutGroup = layoutGroup;
        const label =
          layoutGroup === "danger"
            ? null
            : createElement(this.#document, "div", "mn-tiptap-table-toolbar-group-label");
        if (label) {
          label.textContent = command.group;
          groupElement.appendChild(label);
        }
        commandGroups.push(groupElement);
      }

      const button = createElement(this.#document, "button", "mn-tiptap-table-toolbar-button");
      if (!button) return;

      button.type = "button";
      button.id = commandElementId(TABLE_TOOLBAR_OWNER_ID, commandIndex);
      button.role = state.mode === "context" ? "menuitem" : "button";
      button.title = command.title;
      button.setAttribute("aria-label", command.title);
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
        if (command.variant === "icon" || command.variant === "swatch") {
          button.replaceChildren(visual);
        } else if (state.mode === "context") {
          const label = createElement(
            this.#document,
            "span",
            "mn-tiptap-table-toolbar-button-label",
          );
          if (label) {
            label.textContent = command.title;
            button.replaceChildren(visual, label);
          }
        }
      }
      commandGroups.at(-1)?.appendChild(button);
    });
    this.#list.append(...commandGroups);

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
    this.#applySelectionState(state);
    this.#applyActiveCellState(state);
    this.#updateSelectionBackdrop(state);
    this.#updateQuickAdd(state);
    this.#updateCellMenuTrigger(state);
    this.#updateComplexBlockInsert(state);
    this.#updateAxisHandles(state);
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

  #updateQuickAdd(state) {
    const rect = state.rect;
    if (!this.#addRowButton || !this.#addColumnButton) return;
    if (!rect) {
      setHidden(this.#addRowButton, true);
      setHidden(this.#addColumnButton, true);
      return;
    }

    const addRow = state.commands.find((command) => command.id === "add-row-after");
    const addColumn = state.commands.find((command) => command.id === "add-column-after");
    const geometry = tableQuickAddGeometry(state.grid, rect, {
      rowHeight: TABLE_ADD_ROW_HEIGHT,
      columnWidth: TABLE_ADD_COLUMN_WIDTH,
    });
    if (!geometry.row || !geometry.column) {
      setHidden(this.#addRowButton, true);
      setHidden(this.#addColumnButton, true);
      return;
    }
    this.#addRowButton.style.left = `${geometry.row.left}px`;
    this.#addRowButton.style.top = `${geometry.row.top}px`;
    this.#addRowButton.style.width = `${geometry.row.width}px`;
    this.#addRowButton.style.height = `${geometry.row.height}px`;
    this.#addColumnButton.style.left = `${geometry.column.left}px`;
    this.#addColumnButton.style.top = `${geometry.column.top}px`;
    this.#addColumnButton.style.width = `${geometry.column.width}px`;
    this.#addColumnButton.style.height = `${geometry.column.height}px`;
    this.#addRowButton.dataset.edge = "row";
    this.#addRowButton.style.setProperty("--mn-table-quick-add-rail", `${geometry.row.rail}px`);
    this.#addColumnButton.dataset.edge = "column";
    this.#addColumnButton.style.setProperty("--mn-table-quick-add-rail", `${geometry.column.rail}px`);

    this.#addRowButton._mnCommand = addRow;
    this.#addColumnButton._mnCommand = addColumn;
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
    this.#addRowButton.disabled = !!addRow?.disabled;
    this.#addRowButton.dataset.disabled = addRow?.disabled ? "true" : "false";
    this.#addRowButton.setAttribute("aria-disabled", addRow?.disabled ? "true" : "false");
    this.#addColumnButton.disabled = !!addColumn?.disabled;
    this.#addColumnButton.dataset.disabled = addColumn?.disabled ? "true" : "false";
    this.#addColumnButton.setAttribute("aria-disabled", addColumn?.disabled ? "true" : "false");
    const showRow =
      !state.menuOpen &&
      addRow &&
      hoverIsAtLastRow(state.hover, state.grid) &&
      state.hover?.edge === "add-row";
    const showColumn =
      !state.menuOpen &&
      addColumn &&
      hoverIsAtLastColumn(state.hover, state.grid) &&
      state.hover?.edge === "add-column";
    setHidden(this.#addRowButton, !showRow);
    setHidden(this.#addColumnButton, !showColumn);
  }

  #updateCellMenuTrigger(state) {
    const selectionKind = state.selection?.kind ?? "cell";
    const selectedCount = state.selection?.positions?.size ?? 0;
    const singleSelectedCell =
      selectionKind === "cell" &&
      selectedCount === 1 &&
      (state.cellRect || state.cell);
    const selectionRect =
      selectedCount > 1
        ? state.menuRect ?? state.selectionRect
        : state.menuOpen
          ? tableMenuAnchorRect(state)
          : null;
    const rect =
      (selectedCount > 1 ? normalizedRect(selectionRect) : null) ??
      (singleSelectedCell && selectionKind === "cell"
        ? normalizedRect(state.cellRect ?? state.cell?.getBoundingClientRect?.())
        : null) ??
      normalizedRect(selectionRect);
    if (!this.#cellMenuButton) return;
    if (!rect) {
      setHidden(this.#cellMenuButton, true);
      return;
    }

    const trigger = tableCellMenuTriggerGeometry({
      rect,
      selectionKind,
      edgeHovered: selectionKind === "cell",
      selectedCount,
    });
    if (!trigger) {
      setHidden(this.#cellMenuButton, true);
      return;
    }
    this.#cellMenuButton.style.left = `${trigger.left}px`;
    this.#cellMenuButton.style.top = `${trigger.top}px`;
    this.#cellMenuButton.dataset.placement = trigger.placement;
    setHidden(
      this.#cellMenuButton,
      !state.menuOpen && !singleSelectedCell && selectedCount <= 1,
    );
  }

  #updateComplexBlockInsert(state) {
    if (!this.#blockInsertButton) return;
    const blockRect = normalizedRect(state.complexRect ?? state.rect);
    const block = state.complexBlock ?? state.table;
    if (!blockRect || !block) {
      setHidden(this.#blockInsertButton, true);
      return;
    }

    this.#blockInsertButton.title = insertBlockAfterLabel(state.language);
    this.#blockInsertButton.setAttribute("aria-label", insertBlockAfterLabel(state.language));
    this.#blockInsertButton.style.left = `${blockRect.left}px`;
    this.#blockInsertButton.style.top = `${blockRect.bottom + 2}px`;
    this.#blockInsertButton.style.width = `${Math.max(42, blockRect.width)}px`;
    this.#blockInsertButton.dataset.edge = "after-block";
    this.#blockInsertButton.dataset.blockKind =
      block === state.table ? "table" : "complex";
    this.#blockInsertButton._mnRun = () => state.insertParagraphAfterBlock?.(block) !== false;
    if (!this.#blockInsertButton._mnBound) {
      bindPointerCommand(this.#blockInsertButton, null, () => this.#blockInsertButton?._mnRun?.());
      this.#blockInsertButton._mnBound = true;
    }

    const show =
      state.hover?.edge === "block-after" &&
      state.hover?.block === block &&
      block !== state.table &&
      !state.menuOpen;
    setHidden(this.#blockInsertButton, !show);
  }

  #updateSelectionBackdrop(state) {
    if (!this.#selectionBackdrop) return;
    const rect = state.selectionRect;
    const show =
      rect &&
      state.selection?.kind !== "cell" &&
      state.selection?.positions?.size > 0;
    if (!show) {
      setHidden(this.#selectionBackdrop, true);
      return;
    }

    this.#selectionBackdrop.style.left = `${rect.left}px`;
    this.#selectionBackdrop.style.top = `${rect.top}px`;
    this.#selectionBackdrop.style.width = `${Math.max(0, rect.width)}px`;
    this.#selectionBackdrop.style.height = `${Math.max(0, rect.height)}px`;
    setHidden(this.#selectionBackdrop, false);
  }

  #updateAxisHandles(state) {
    this.#clearAxisHandles();
    const tableRect = state.rect;
    const grid = state.grid ?? [];
    if (!tableRect || grid.length === 0 || state.menuOpen) return;
    const geometry = tableAxisHandleGeometry(grid, tableRect, {
      handleSize: TABLE_AXIS_HANDLE_SIZE,
      rowHandleWidth: TABLE_ROW_HANDLE_WIDTH,
      columnHandleHeight: TABLE_COLUMN_HANDLE_HEIGHT,
    });
    const hoverSelected = hoveredCellIsSelected(state);
    const hoverRowIndex =
      state.hover?.cell &&
      !hoverSelected &&
      state.hover?.columnIndex === 0
        ? state.hover.rowIndex
        : null;
    const hoverColumnIndex =
      state.hover?.cell &&
      !hoverSelected &&
      state.hover?.rowIndex === 0
        ? state.hover.columnIndex
        : null;

    const rowHandle = Number.isInteger(hoverRowIndex)
      ? geometry.rows.find((handle) => handle.index === hoverRowIndex)
      : null;
    if (rowHandle) {
      const handle = rowHandle;
      const index = handle.index;
      const active = state.selection?.rows?.includes?.(index);
      const button = createElement(this.#document, "button", "mn-tiptap-table-axis-handle row");
      if (!button) return;
      button.type = "button";
      button.title = selectTableRowLabel(state.language, index);
      button.setAttribute("aria-label", selectTableRowLabel(state.language, index));
      button.dataset.active = active ? "true" : "false";
      button.style.left = `${handle.left}px`;
      button.style.top = `${handle.top}px`;
      button.style.width = `${handle.width}px`;
      button.style.height = `${handle.height}px`;
      button.dataset.axis = "row";
      button.dataset.index = String(index);
      bindPointerCommand(button, null, () => {
        state.selectAxis("row", index);
        return state.toggleMenu("context", {
          open: true,
          anchorRect: button.getBoundingClientRect?.(),
        });
      });
      mountFloatingRoot(button, state.table, this.#document);
      const visible =
        !active &&
        state.selection?.kind === "cell" &&
        hoverRowIndex === index &&
        !state.menuOpen;
      setHidden(button, !visible);
      this.#rowHandles.push(button);
    }

    const columnHandle = Number.isInteger(hoverColumnIndex)
      ? geometry.columns.find((handle) => handle.index === hoverColumnIndex)
      : null;
    if (columnHandle) {
      const handle = columnHandle;
      const index = handle.index;
      const active = state.selection?.columns?.includes?.(index);
      const button = createElement(this.#document, "button", "mn-tiptap-table-axis-handle column");
      if (!button) return;
      button.type = "button";
      button.title = selectTableColumnLabel(state.language, index);
      button.setAttribute("aria-label", selectTableColumnLabel(state.language, index));
      button.dataset.active = active ? "true" : "false";
      button.style.left = `${handle.left}px`;
      button.style.top = `${handle.top}px`;
      button.style.width = `${handle.width}px`;
      button.style.height = `${handle.height}px`;
      button.dataset.axis = "column";
      button.dataset.index = String(index);
      bindPointerCommand(button, null, () => {
        state.selectAxis("column", index);
        return state.toggleMenu("context", {
          open: true,
          anchorRect: button.getBoundingClientRect?.(),
        });
      });
      mountFloatingRoot(button, state.table, this.#document);
      const visible =
        !active &&
        state.selection?.kind === "cell" &&
        hoverColumnIndex === index &&
        !state.menuOpen;
      setHidden(button, !visible);
      this.#columnHandles.push(button);
    }
  }

  #clearAxisHandles() {
    this.#rowHandles.forEach((button) => button.remove?.());
    this.#columnHandles.forEach((button) => button.remove?.());
    this.#rowHandles = [];
    this.#columnHandles = [];
  }

  #applySelectionState(state) {
    state.table
      ?.querySelectorAll?.(".mn-tiptap-table-cell-selected")
      ?.forEach?.((cell) => cell.classList?.remove?.("mn-tiptap-table-cell-selected"));

    const selectedPositions = state.selection?.positions ?? new Set();
    (state.grid ?? []).forEach((row) => {
      row.cells.forEach((cell) => {
        cell.cell?.classList?.toggle?.(
          "mn-tiptap-table-cell-selected",
          selectedPositions.has(cell.pos),
        );
      });
    });
  }

  #applyActiveCellState(state) {
    if (this.#lastActiveCell && this.#lastActiveCell !== state.cell) {
      this.#lastActiveCell.classList?.remove?.("mn-tiptap-table-cell-active");
    }

    const showActive =
      state.selection?.kind === "cell" &&
      (state.selection?.positions?.size ?? 0) === 0 &&
      state.cell;

    if (showActive) {
      state.cell.classList?.add?.("mn-tiptap-table-cell-active");
      this.#lastActiveCell = state.cell;
      return;
    }

    this.#lastActiveCell?.classList?.remove?.("mn-tiptap-table-cell-active");
    this.#lastActiveCell = null;
  }

  hide() {
    setHidden(this.#root, true);
    setHidden(this.#addRowButton, true);
    setHidden(this.#addColumnButton, true);
    setHidden(this.#cellMenuButton, true);
    setHidden(this.#blockInsertButton, true);
    setHidden(this.#selectionBackdrop, true);
    this.#lastTable
      ?.querySelectorAll?.(".mn-tiptap-table-cell-selected")
      ?.forEach?.((cell) => cell.classList?.remove?.("mn-tiptap-table-cell-selected"));
    this.#lastTable
      ?.querySelectorAll?.(".mn-tiptap-table-cell-active")
      ?.forEach?.((cell) => cell.classList?.remove?.("mn-tiptap-table-cell-active"));
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
    this.#root?.remove?.();
    this.#addRowButton?.remove?.();
    this.#addColumnButton?.remove?.();
    this.#cellMenuButton?.remove?.();
    this.#blockInsertButton?.remove?.();
    this.#selectionBackdrop?.remove?.();
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
    this.#lastActiveCell = null;
    this.#menuCommands = [];
  }
}
