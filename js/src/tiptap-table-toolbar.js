import {
  addColumnRightLabel,
  addRowBelowLabel,
  localizeTableCommand,
  selectTableColumnLabel,
  selectTableLabel,
  selectTableRowLabel,
  tableCellActionsLabel,
  tableToolsLabel,
} from "./tiptap-i18n.js";
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

export const TABLE_COMMANDS = Object.freeze([
  {
    id: "add-column-before",
    group: "Columns",
    title: "Insert column left",
    label: "Left",
    command: "addColumnBefore",
  },
  {
    id: "add-column-after",
    group: "Columns",
    title: "Insert column right",
    label: "Right",
    command: "addColumnAfter",
  },
  {
    id: "delete-column",
    group: "Columns",
    title: "Delete current column",
    label: "Delete",
    command: "deleteColumn",
    tone: "danger",
  },
  {
    id: "add-row-before",
    group: "Rows",
    title: "Insert row above",
    label: "Above",
    command: "addRowBefore",
  },
  {
    id: "add-row-after",
    group: "Rows",
    title: "Insert row below",
    label: "Below",
    command: "addRowAfter",
  },
  {
    id: "delete-row",
    group: "Rows",
    title: "Delete current row",
    label: "Delete",
    command: "deleteRow",
    tone: "danger",
  },
  {
    id: "merge-cells",
    group: "Cells",
    title: "Merge selected cells",
    label: "Merge",
    command: "mergeCells",
  },
  {
    id: "split-cell",
    group: "Cells",
    title: "Split current cell",
    label: "Split",
    command: "splitCell",
  },
  {
    id: "merge-or-split",
    group: "Cells",
    title: "Merge or split cells",
    label: "Auto",
    command: "mergeOrSplit",
  },
  {
    id: "toggle-header-row",
    group: "Headers",
    title: "Toggle header row",
    label: "Row",
    command: "toggleHeaderRow",
  },
  {
    id: "toggle-header-column",
    group: "Headers",
    title: "Toggle header column",
    label: "Column",
    command: "toggleHeaderColumn",
  },
  {
    id: "toggle-header-cell",
    group: "Headers",
    title: "Toggle header cell",
    label: "Cell",
    command: "toggleHeaderCell",
  },
  {
    id: "align-left",
    group: "Align",
    title: "Align current cells left",
    label: "Left",
    command: "setCellAttribute",
    args: ["align", null],
  },
  {
    id: "align-center",
    group: "Align",
    title: "Align current cells center",
    label: "Center",
    command: "setCellAttribute",
    args: ["align", "center"],
  },
  {
    id: "align-right",
    group: "Align",
    title: "Align current cells right",
    label: "Right",
    command: "setCellAttribute",
    args: ["align", "right"],
  },
  {
    id: "cell-bg-clear",
    group: "Cell color",
    title: "Clear cell background",
    label: "Clear",
    command: "setCellAttribute",
    args: ["backgroundColor", null],
  },
  {
    id: "cell-bg-yellow",
    group: "Cell color",
    title: "Use a soft yellow cell background",
    label: "Yellow",
    command: "setCellAttribute",
    args: ["backgroundColor", "rgba(245, 158, 11, 0.16)"],
  },
  {
    id: "cell-bg-blue",
    group: "Cell color",
    title: "Use a soft blue cell background",
    label: "Blue",
    command: "setCellAttribute",
    args: ["backgroundColor", "rgba(59, 130, 246, 0.14)"],
  },
  {
    id: "cell-bg-green",
    group: "Cell color",
    title: "Use a soft green cell background",
    label: "Green",
    command: "setCellAttribute",
    args: ["backgroundColor", "rgba(16, 185, 129, 0.14)"],
  },
  {
    id: "previous-cell",
    group: "Navigate",
    title: "Move to previous cell",
    label: "Prev",
    command: "goToPreviousCell",
  },
  {
    id: "next-cell",
    group: "Navigate",
    title: "Move to next cell",
    label: "Next",
    command: "goToNextCell",
  },
  {
    id: "fix-table",
    group: "Table",
    title: "Repair table structure",
    label: "Repair",
    command: "fixTables",
  },
  {
    id: "delete-table",
    group: "Table",
    title: "Delete table",
    label: "Delete",
    command: "deleteTable",
    tone: "danger",
  },
]);

const TABLE_AXIS_HANDLE_SIZE = 22;
const CONTEXTUAL_TABLE_COMMAND_IDS = new Set([
  "merge-cells",
  "split-cell",
  "align-left",
  "align-center",
  "align-right",
  "cell-bg-clear",
  "cell-bg-yellow",
  "cell-bg-blue",
  "cell-bg-green",
]);
const KEYBOARD_TABLE_COMMAND_IDS = new Set([
  "add-column-before",
  "add-column-after",
  "delete-column",
  "add-row-before",
  "add-row-after",
  "delete-row",
  "merge-cells",
  "split-cell",
  "toggle-header-row",
  "toggle-header-column",
  "toggle-header-cell",
  "align-left",
  "align-center",
  "align-right",
  "cell-bg-clear",
  "cell-bg-yellow",
  "cell-bg-blue",
  "cell-bg-green",
  "fix-table",
  "delete-table",
]);

function isTableToolbarActivation(event) {
  const key = String(event?.key ?? "").toLowerCase();
  return key === "f10" && event?.shiftKey && !event?.altKey && !event?.ctrlKey && !event?.metaKey;
}

function closestTableElement(target, editorDom) {
  if (!target?.closest || !editorDom?.contains) return null;
  const table = target.closest(".mn-tiptap-table, table");
  return table && editorDom.contains(table) ? table : null;
}

function tableRows(table) {
  return Array.from(table?.querySelectorAll?.("tr") ?? []);
}

function tableCells(row) {
  return Array.from(row?.querySelectorAll?.("th,td") ?? []);
}

function tableSelectionGrid(table, view) {
  if (!table || typeof view?.posAtDOM !== "function") return [];

  return tableRows(table)
    .map((row, rowIndex) => ({
      row,
      rowIndex,
      cells: tableCells(row)
        .map((cell, columnIndex) => {
          try {
            const pos = view.posAtDOM(cell, 0);
            return Number.isFinite(pos)
              ? {
                  cell,
                  columnIndex,
                  pos,
                  rect: cell.getBoundingClientRect?.(),
                }
              : null;
          } catch (_error) {
            return null;
          }
        })
        .filter(Boolean),
      rect: row.getBoundingClientRect?.(),
    }))
    .filter((row) => row.cells.length > 0);
}

function firstRowCells(grid) {
  return grid.find((row) => row.cells.length > 0)?.cells ?? [];
}

function activeCellFromEditor(editor) {
  const selection = editor?.state?.selection;
  const view = editor?.view;
  const domAtPos = typeof view?.domAtPos === "function" && Number.isFinite(selection?.from)
    ? view.domAtPos(selection.from)
    : null;
  const node = domAtPos?.node?.nodeType === 1 ? domAtPos.node : domAtPos?.node?.parentElement;
  return node?.tagName === "TH" || node?.tagName === "TD"
    ? node
    : node?.closest?.("th,td") ?? null;
}

function activeTableContext(editor) {
  const selection = editor?.state?.selection;
  const view = editor?.view;
  const domAtPos = typeof view?.domAtPos === "function" && Number.isFinite(selection?.from)
    ? view.domAtPos(selection.from)
    : null;
  const node = domAtPos?.node?.nodeType === 1 ? domAtPos.node : domAtPos?.node?.parentElement;
  const table = closestTableElement(node, view?.dom);
  if (!table) return null;

  return {
    table,
    rect: table.getBoundingClientRect?.(),
    grid: tableSelectionGrid(table, view),
    cell: activeCellFromEditor(editor),
  };
}

function runEditorCommand(editor, commandName, args = []) {
  const command = editor?.commands?.[commandName];
  if (typeof command !== "function") return false;
  const ok = command(...args) !== false;
  if (ok) editor?.commands?.focus?.();
  return ok;
}

function canRunEditorCommand(editor, commandName, args = []) {
  if (typeof editor?.commands?.[commandName] !== "function") return false;
  const canCommands = typeof editor?.can === "function" ? editor.can() : null;
  const canCommand = canCommands?.[commandName];
  if (typeof canCommand !== "function") return true;

  try {
    return canCommand(...args) !== false;
  } catch (_error) {
    return false;
  }
}

function cellValue(editor, name) {
  const cell = activeCellFromEditor(editor);
  if (!cell) return null;

  if (name === "backgroundColor") {
    return cell.getAttribute?.("data-cell-background") || cell.style?.backgroundColor || null;
  }

  if (name === "align") {
    return cell.style?.textAlign || cell.getAttribute?.("align") || null;
  }

  return null;
}

function normalizeCellAttributeValue(name, value) {
  if (name === "align") {
    const align = String(value ?? "").trim().toLowerCase();
    return align === "left" ? null : align || null;
  }
  return value ?? null;
}

function enabledCommandIds(commands) {
  return (commands ?? [])
    .filter((command) => !command.disabled)
    .map((command) => command.id);
}

function visibleCommands(commands, mode = "context") {
  const allowed = mode === "keyboard" ? KEYBOARD_TABLE_COMMAND_IDS : CONTEXTUAL_TABLE_COMMAND_IDS;
  return (commands ?? []).filter((command) => allowed.has(command.id));
}

function entryLanguage(entry) {
  return entry?.preferences?.language ?? "english";
}

function nextEnabledCommandId(commands, currentId, direction) {
  const ids = enabledCommandIds(commands);
  if (ids.length === 0) return null;
  const currentIndex = ids.indexOf(currentId);
  const startIndex = currentIndex < 0 ? 0 : currentIndex;
  return ids[(startIndex + direction + ids.length) % ids.length];
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

export function selectTableAxis(editor, grid, axis, index) {
  if (!editor || typeof editor.commands?.setCellSelection !== "function") return false;
  const axisIndex = Number(index);
  if (!Number.isInteger(axisIndex) || axisIndex < 0) return false;

  let positions = [];
  if (axis === "row") {
    positions = grid?.[axisIndex]?.cells?.map((cell) => cell.pos) ?? [];
  } else if (axis === "column") {
    positions = (grid ?? [])
      .map((row) => row.cells.find((cell) => cell.columnIndex === axisIndex)?.pos)
      .filter(Number.isFinite);
  } else if (axis === "table") {
    positions = (grid ?? [])
      .flatMap((row) => row.cells.map((cell) => cell.pos))
      .filter(Number.isFinite);
  }

  if (positions.length === 0) return false;
  const ok =
    editor.commands.setCellSelection({
      anchorCell: positions[0],
      headCell: positions[positions.length - 1],
    }) !== false;
  if (ok) editor.commands?.focus?.();
  return ok;
}

class TiptapTableToolbarView {
  #document;
  #window;
  #root = null;
  #list = null;
  #addRowButton = null;
  #addColumnButton = null;
  #tableSelectButton = null;
  #cellMenuButton = null;
  #rowHandles = [];
  #columnHandles = [];

  constructor({ document = defaultDocument(), window = defaultWindow(document) } = {}) {
    this.#document = document;
    this.#window = window;
  }

  mount(container) {
    if (this.#root || !this.#document) return;

    const root = createElement(this.#document, "div", "mn-tiptap-table-toolbar hidden");
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
    const tableSelectButton = createElement(
      this.#document,
      "button",
      "mn-tiptap-table-axis-handle table hidden",
    );
    const cellMenuButton = createElement(
      this.#document,
      "button",
      "mn-tiptap-table-cell-menu-trigger hidden",
    );
    if (!root || !list || !addRowButton || !addColumnButton || !tableSelectButton || !cellMenuButton) return;

    root.role = "toolbar";
    addRowButton.type = "button";
    addRowButton.textContent = "+";
    addColumnButton.type = "button";
    addColumnButton.textContent = "+";
    tableSelectButton.type = "button";
    cellMenuButton.type = "button";
    cellMenuButton.textContent = "•••";
    cellMenuButton.setAttribute("aria-haspopup", "menu");
    root.appendChild(list);
    mountFloatingRoot(root, container, this.#document);
    mountFloatingRoot(addRowButton, container, this.#document);
    mountFloatingRoot(addColumnButton, container, this.#document);
    mountFloatingRoot(tableSelectButton, container, this.#document);
    mountFloatingRoot(cellMenuButton, container, this.#document);
    this.#root = root;
    this.#list = list;
    this.#addRowButton = addRowButton;
    this.#addColumnButton = addColumnButton;
    this.#tableSelectButton = tableSelectButton;
    this.#cellMenuButton = cellMenuButton;
    setHidden(root, true);
    setHidden(addRowButton, true);
    setHidden(addColumnButton, true);
    setHidden(tableSelectButton, true);
    setHidden(cellMenuButton, true);
  }

  update(state) {
    if (!this.#root || !this.#list || !state.open) return;

    this.#list.replaceChildren();
    this.#root.setAttribute("aria-label", tableToolsLabel(state.language));
    this.#root.dataset.mode = state.mode;
    this.#root.dataset.open = state.menuOpen ? "true" : "false";
    this.#addRowButton.title = addRowBelowLabel(state.language);
    this.#addRowButton.setAttribute("aria-label", addRowBelowLabel(state.language));
    this.#addColumnButton.title = addColumnRightLabel(state.language);
    this.#addColumnButton.setAttribute("aria-label", addColumnRightLabel(state.language));
    if (this.#cellMenuButton) {
      this.#cellMenuButton.title = tableCellActionsLabel(state.language);
      this.#cellMenuButton.setAttribute("aria-label", tableCellActionsLabel(state.language));
      this.#cellMenuButton.dataset.open = state.menuOpen ? "true" : "false";
      this.#cellMenuButton.onpointerdown = (event) => {
        event.preventDefault();
        event.stopPropagation?.();
        state.toggleMenu?.("context");
      };
      this.#cellMenuButton.onmousedown = (event) => event.preventDefault();
    }
    let lastGroup = null;
    const menuCommands = state.menuOpen ? visibleCommands(state.commands, state.mode) : [];
    menuCommands.forEach((command) => {
      if (lastGroup && lastGroup !== command.group) {
        const divider = createElement(this.#document, "span", "mn-tiptap-table-toolbar-divider");
        divider?.setAttribute?.("aria-hidden", "true");
        if (divider) this.#list.appendChild(divider);
      }
      lastGroup = command.group;

      const button = createElement(this.#document, "button", "mn-tiptap-table-toolbar-button");
      if (!button) return;

      button.type = "button";
      button.title = command.title;
      button.setAttribute("aria-label", command.title);
      button.textContent = command.label;
      button.dataset.commandId = command.id;
      button.dataset.group = command.group;
      button.dataset.tone = command.tone ?? "default";
      button.dataset.active = command.active ? "true" : "false";
      button.dataset.keyboardActive = state.activeCommandId === command.id ? "true" : "false";
      button.dataset.disabled = command.disabled ? "true" : "false";
      button.tabIndex = state.activeCommandId === command.id ? 0 : -1;
      button.disabled = !!command.disabled;
      button.setAttribute("aria-disabled", command.disabled ? "true" : "false");
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation?.();
        if (command.disabled) return;
        state.run(command.id);
      });
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      this.#list.appendChild(button);
    });

    setHidden(this.#root, !state.menuOpen || menuCommands.length === 0);
    this.#root.dataset.keyboardActive = state.keyboardActive ? "true" : "false";
    this.#root.onkeydown = (event) => state.handleKeyDown?.(event);
    this.#updateQuickAdd(state);
    this.#updateTableHandle(state);
    this.#updateCellMenuTrigger(state);
    this.#updateAxisHandles(state);
    const anchorRect = state.mode === "keyboard" ? state.rect : state.cellRect ?? state.rect;
    positionFloatingElement(this.#root, anchorRect, {
      viewport: viewportSize(state.table, this.#window),
      size: {
        width: state.mode === "keyboard" ? 520 : 280,
        height: state.mode === "keyboard" ? 42 : 220,
        margin: 10,
      },
      placement: state.mode === "keyboard" ? "top" : "right",
    });
  }

  #updateQuickAdd(state) {
    const rect = state.rect;
    if (!rect || !this.#addRowButton || !this.#addColumnButton) return;

    const addRow = state.commands.find((command) => command.id === "add-row-after");
    const addColumn = state.commands.find((command) => command.id === "add-column-after");
    this.#addRowButton.style.left = `${rect.left + Math.max(0, rect.width ?? rect.right - rect.left) / 2 - 12}px`;
    this.#addRowButton.style.top = `${rect.bottom + 6}px`;
    this.#addColumnButton.style.left = `${rect.right + 6}px`;
    this.#addColumnButton.style.top = `${rect.top + Math.max(0, rect.height ?? rect.bottom - rect.top) / 2 - 12}px`;

    this.#addRowButton.onpointerdown = (event) => {
      event.preventDefault();
      event.stopPropagation?.();
      if (addRow?.disabled) return;
      state.run("add-row-after");
    };
    this.#addColumnButton.onpointerdown = (event) => {
      event.preventDefault();
      event.stopPropagation?.();
      if (addColumn?.disabled) return;
      state.run("add-column-after");
    };
    this.#addRowButton.disabled = !!addRow?.disabled;
    this.#addRowButton.dataset.disabled = addRow?.disabled ? "true" : "false";
    this.#addRowButton.setAttribute("aria-disabled", addRow?.disabled ? "true" : "false");
    this.#addColumnButton.disabled = !!addColumn?.disabled;
    this.#addColumnButton.dataset.disabled = addColumn?.disabled ? "true" : "false";
    this.#addColumnButton.setAttribute("aria-disabled", addColumn?.disabled ? "true" : "false");
    setHidden(this.#addRowButton, !addRow);
    setHidden(this.#addColumnButton, !addColumn);
  }

  #updateTableHandle(state) {
    const rect = state.rect;
    if (!rect || !this.#tableSelectButton) return;

    this.#tableSelectButton.style.left = `${rect.left - TABLE_AXIS_HANDLE_SIZE - 6}px`;
    this.#tableSelectButton.style.top = `${rect.top - TABLE_AXIS_HANDLE_SIZE - 6}px`;
    this.#tableSelectButton.title = selectTableLabel(state.language);
    this.#tableSelectButton.setAttribute("aria-label", selectTableLabel(state.language));
    this.#tableSelectButton.onpointerdown = (event) => {
      event.preventDefault();
      event.stopPropagation?.();
      state.selectAxis("table", 0);
    };
    this.#tableSelectButton.onmousedown = (event) => event.preventDefault();
    setHidden(this.#tableSelectButton, (state.grid ?? []).length === 0);
  }

  #updateCellMenuTrigger(state) {
    const rect = state.cellRect;
    if (!this.#cellMenuButton) return;
    if (!rect) {
      setHidden(this.#cellMenuButton, true);
      return;
    }

    this.#cellMenuButton.style.left = `${rect.right - 11}px`;
    this.#cellMenuButton.style.top = `${rect.top + Math.max(0, rect.height - 22) / 2}px`;
    setHidden(this.#cellMenuButton, !state.cellRect);
  }

  #updateAxisHandles(state) {
    this.#clearAxisHandles();
    const tableRect = state.rect;
    const grid = state.grid ?? [];
    if (!tableRect || grid.length === 0) return;

    grid.forEach((row, index) => {
      const rect = row.rect;
      if (!rect) return;
      const button = createElement(this.#document, "button", "mn-tiptap-table-axis-handle row");
      if (!button) return;
      button.type = "button";
      button.title = selectTableRowLabel(state.language, index);
      button.setAttribute("aria-label", selectTableRowLabel(state.language, index));
      button.style.left = `${tableRect.left - TABLE_AXIS_HANDLE_SIZE - 6}px`;
      button.style.top = `${rect.top + Math.max(0, rect.height - TABLE_AXIS_HANDLE_SIZE) / 2}px`;
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation?.();
        state.selectAxis("row", index);
      });
      button.addEventListener("mousedown", (event) => event.preventDefault());
      mountFloatingRoot(button, state.table, this.#document);
      this.#rowHandles.push(button);
    });

    firstRowCells(grid).forEach((cell, index) => {
      const rect = cell.rect;
      if (!rect) return;
      const button = createElement(this.#document, "button", "mn-tiptap-table-axis-handle column");
      if (!button) return;
      button.type = "button";
      button.title = selectTableColumnLabel(state.language, index);
      button.setAttribute("aria-label", selectTableColumnLabel(state.language, index));
      button.style.left = `${rect.left + Math.max(0, rect.width - TABLE_AXIS_HANDLE_SIZE) / 2}px`;
      button.style.top = `${tableRect.top - TABLE_AXIS_HANDLE_SIZE - 6}px`;
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation?.();
        state.selectAxis("column", index);
      });
      button.addEventListener("mousedown", (event) => event.preventDefault());
      mountFloatingRoot(button, state.table, this.#document);
      this.#columnHandles.push(button);
    });
  }

  #clearAxisHandles() {
    this.#rowHandles.forEach((button) => button.remove?.());
    this.#columnHandles.forEach((button) => button.remove?.());
    this.#rowHandles = [];
    this.#columnHandles = [];
  }

  hide() {
    setHidden(this.#root, true);
    setHidden(this.#addRowButton, true);
    setHidden(this.#addColumnButton, true);
    setHidden(this.#tableSelectButton, true);
    setHidden(this.#cellMenuButton, true);
    this.#clearAxisHandles();
  }

  contains(target) {
    return (
      this.#root?.contains?.(target) ||
      this.#addRowButton?.contains?.(target) ||
      this.#addColumnButton?.contains?.(target) ||
      this.#tableSelectButton?.contains?.(target) ||
      this.#cellMenuButton?.contains?.(target) ||
      this.#rowHandles.some((button) => button.contains?.(target)) ||
      this.#columnHandles.some((button) => button.contains?.(target)) ||
      false
    );
  }

  setActiveCommand(commandId, keyboardActive = true) {
    if (!this.#root) return false;

    const buttons = Array.from(this.#list?.children ?? []).filter(
      (child) => child?.dataset?.commandId,
    );
    buttons.forEach((button) => {
      const active = button.dataset.commandId === commandId;
      button.dataset.keyboardActive = active ? "true" : "false";
      button.tabIndex = active ? 0 : -1;
    });
    this.#root.dataset.keyboardActive = keyboardActive ? "true" : "false";
    return true;
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
    this.#tableSelectButton?.remove?.();
    this.#cellMenuButton?.remove?.();
    this.#clearAxisHandles();
    this.#root = null;
    this.#list = null;
    this.#addRowButton = null;
    this.#addColumnButton = null;
    this.#tableSelectButton = null;
    this.#cellMenuButton = null;
  }
}

export class TiptapTableToolbarController {
  #view;
  #dismiss;
  #editor = null;
  #entry = null;
  #state = {
    open: false,
    menuOpen: false,
    mode: "context",
    table: null,
    rect: null,
    cell: null,
    cellRect: null,
    grid: [],
    commands: [],
    activeCommandId: null,
    keyboardActive: false,
    language: "english",
  };

  constructor({ view = null, dom = {} } = {}) {
    const documentRef = dom.document ?? defaultDocument();
    const windowRef = dom.window ?? defaultWindow(documentRef);
    this.#view =
      view ??
      new TiptapTableToolbarView({
        document: documentRef,
        window: windowRef,
      });
    this.#dismiss = createFloatingDismissController({
      document: documentRef,
      window: windowRef,
      contains: (target) =>
        this.contains(target) || this.#state.table?.contains?.(target),
      onDismiss: () => this.close(),
    });
  }

  get state() {
    return {
      ...this.#state,
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

    const context = activeTableContext(editor);
    if (!context?.rect) {
      this.close();
      return this.state;
    }

    const language = entryLanguage(this.#entry);
    const commands = TABLE_COMMANDS.filter(
      (command) => typeof editor.commands?.[command.command] === "function",
    ).map((command) => {
      const disabled = !canRunEditorCommand(editor, command.command, command.args);
      return localizeTableCommand({
        ...command,
        disabled,
        active:
          command.command === "setCellAttribute" &&
          command.args?.length >= 2 &&
          normalizeCellAttributeValue(command.args[0], cellValue(editor, command.args[0])) ===
            normalizeCellAttributeValue(command.args[0], command.args[1]),
      }, language);
    });
    const currentVisibleCommands = visibleCommands(
      commands,
      this.#state.menuOpen ? this.#state.mode : "context",
    );
    const activeCommandId = currentVisibleCommands.some(
      (command) => command.id === this.#state.activeCommandId && !command.disabled,
    )
      ? this.#state.activeCommandId
      : enabledCommandIds(currentVisibleCommands)[0] ?? null;

    this.#state = {
      open: true,
      menuOpen: this.#state.menuOpen,
      mode: this.#state.mode,
      table: context.table,
      rect: context.rect,
      cell: context.cell,
      cellRect: context.cell?.getBoundingClientRect?.() ?? null,
      grid: context.grid,
      commands,
      activeCommandId,
      keyboardActive: this.#state.keyboardActive,
      language,
    };
    this.#view.update?.({
      ...this.#state,
      run: (commandId) => this.run(commandId),
      selectAxis: (axis, index) => this.selectAxis(axis, index),
      toggleMenu: (mode) => this.toggleMenu(mode),
      handleKeyDown: (event) => this.handleKeyDown(event),
    });
    this.#dismiss.open();
    return this.state;
  }

  setActiveCommand(commandId, { focus = false, keyboardActive = true } = {}) {
    if (!this.#state.open) return false;
    const command = visibleCommands(this.#state.commands, this.#state.mode).find(
      (item) => item.id === commandId && !item.disabled,
    );
    if (!command) return false;

    this.#state = {
      ...this.#state,
      activeCommandId: command.id,
      keyboardActive,
    };
    this.#view.setActiveCommand?.(command.id, keyboardActive);
    if (focus) this.#view.focusCommand?.(command.id);
    return true;
  }

  #moveActiveCommand(direction, event) {
    const nextId = nextEnabledCommandId(
      visibleCommands(this.#state.commands, this.#state.mode),
      this.#state.activeCommandId,
      direction,
    );
    if (!nextId) return false;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    return this.setActiveCommand(nextId, { focus: true, keyboardActive: true });
  }

  handleKeyDown(event) {
    if (!this.#state.open && isTableToolbarActivation(event)) {
      this.refresh(this.#editor);
    }

    if (!this.#state.open) return false;

    if (isTableToolbarActivation(event)) {
      this.#state = {
        ...this.#state,
        menuOpen: true,
        mode: "keyboard",
        keyboardActive: true,
      };
      this.#view.update?.({
        ...this.#state,
        run: (commandId) => this.run(commandId),
        selectAxis: (axis, index) => this.selectAxis(axis, index),
        toggleMenu: (mode) => this.toggleMenu(mode),
        handleKeyDown: (keyboardEvent) => this.handleKeyDown(keyboardEvent),
      });
      const firstId = enabledCommandIds(visibleCommands(this.#state.commands, "keyboard"))[0] ?? null;
      if (!firstId) return false;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      return this.setActiveCommand(firstId, { focus: true, keyboardActive: true });
    }

    const key = String(event?.key ?? "");
    if (key === "Escape") {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (this.#state.menuOpen) {
        this.toggleMenu(this.#state.mode, { open: false });
      } else {
        this.close();
      }
      return true;
    }

    const targetInsideToolbar = this.contains(event?.target);
    if (!targetInsideToolbar && !this.#state.keyboardActive) return false;

    if (key === "ArrowRight" || key === "ArrowDown") {
      return this.#moveActiveCommand(1, event);
    }
    if (key === "ArrowLeft" || key === "ArrowUp") {
      return this.#moveActiveCommand(-1, event);
    }
    if (key === "Home") {
      const firstId = enabledCommandIds(visibleCommands(this.#state.commands, this.#state.mode))[0] ?? null;
      if (!firstId) return false;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      return this.setActiveCommand(firstId, { focus: true, keyboardActive: true });
    }
    if (key === "End") {
      const ids = enabledCommandIds(visibleCommands(this.#state.commands, this.#state.mode));
      const lastId = ids.at(-1) ?? null;
      if (!lastId) return false;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      return this.setActiveCommand(lastId, { focus: true, keyboardActive: true });
    }
    if (key === "Enter" || key === " ") {
      const commandId = this.#state.activeCommandId;
      if (!commandId) return false;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      return this.run(commandId);
    }

    return false;
  }

  run(commandId) {
    const command = TABLE_COMMANDS.find((item) => item.id === commandId);
    if (!command || !this.#editor) return false;
    if (!canRunEditorCommand(this.#editor, command.command, command.args)) {
      this.refresh(this.#editor);
      return false;
    }
    const keepToolbarFocus = this.#state.keyboardActive && this.#state.menuOpen;
    const ok = runEditorCommand(this.#editor, command.command, command.args);
    this.refresh(this.#editor);
    if (keepToolbarFocus && this.#state.open && this.#state.activeCommandId) {
      this.#view.focusCommand?.(this.#state.activeCommandId);
    }
    return ok;
  }

  toggleMenu(mode = "context", { open = null } = {}) {
    if (!this.#state.open) return false;
    const nextMode = mode === "keyboard" ? "keyboard" : "context";
    const nextOpen = open === null ? !(this.#state.menuOpen && this.#state.mode === nextMode) : !!open;
    const scopedCommands = visibleCommands(this.#state.commands, nextMode);
    if (nextOpen && scopedCommands.length === 0) return false;
    const activeCommandId = scopedCommands.some(
      (command) => command.id === this.#state.activeCommandId && !command.disabled,
    )
      ? this.#state.activeCommandId
      : enabledCommandIds(scopedCommands)[0] ?? null;

    this.#state = {
      ...this.#state,
      menuOpen: nextOpen,
      mode: nextMode,
      activeCommandId,
      keyboardActive: nextMode === "keyboard" && nextOpen ? this.#state.keyboardActive : false,
    };
    this.#view.update?.({
      ...this.#state,
      run: (commandId) => this.run(commandId),
      selectAxis: (axis, index) => this.selectAxis(axis, index),
      toggleMenu: (menuMode) => this.toggleMenu(menuMode),
      handleKeyDown: (event) => this.handleKeyDown(event),
    });
    return true;
  }

  selectAxis(axis, index) {
    const ok = selectTableAxis(this.#editor, this.#state.grid, axis, index);
    const nextMode = axis === "table" ? "keyboard" : "context";
    const nextCommands = visibleCommands(this.#state.commands, nextMode);
    this.#state = {
      ...this.#state,
      menuOpen: axis === "table" && nextCommands.length > 0,
      mode: nextMode,
      activeCommandId: enabledCommandIds(nextCommands)[0] ?? null,
      keyboardActive: axis === "table",
    };
    this.refresh(this.#editor);
    return ok;
  }

  close() {
    if (!this.#state.open) return;
    this.#state = {
      open: false,
      menuOpen: false,
      mode: "context",
      table: null,
      rect: null,
      cell: null,
      cellRect: null,
      grid: [],
      commands: [],
      activeCommandId: null,
      keyboardActive: false,
      language: "english",
    };
    this.#view.hide?.();
    this.#dismiss.close();
  }

  contains(target) {
    return this.#view.contains?.(target) ?? false;
  }

  destroy() {
    this.close();
    this.#dismiss.close();
    this.#view.destroy?.();
    this.#editor = null;
    this.#entry = null;
  }
}

export function createTiptapTableToolbarController(options) {
  return new TiptapTableToolbarController(options);
}
