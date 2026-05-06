import {
  addColumnRightLabel,
  addRowBelowLabel,
  localizeTableCommand,
  selectTableColumnLabel,
  selectTableLabel,
  selectTableRowLabel,
  tableContextEyebrowLabel,
  tableContextSubtitleLabel,
  tableContextTitleLabel,
  tableCellActionsLabel,
  tableSelectionActionsLabel,
  tableToolsLabel,
} from "./tiptap-i18n.js";
import {
  bindPointerActivation,
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
    icon: "column-left",
  },
  {
    id: "add-column-after",
    group: "Columns",
    title: "Insert column right",
    label: "Right",
    command: "addColumnAfter",
    icon: "column-right",
  },
  {
    id: "delete-column",
    group: "Columns",
    title: "Delete current column",
    label: "Delete",
    command: "deleteColumn",
    icon: "delete-column",
    tone: "danger",
  },
  {
    id: "add-row-before",
    group: "Rows",
    title: "Insert row above",
    label: "Above",
    command: "addRowBefore",
    icon: "row-above",
  },
  {
    id: "add-row-after",
    group: "Rows",
    title: "Insert row below",
    label: "Below",
    command: "addRowAfter",
    icon: "row-below",
  },
  {
    id: "delete-row",
    group: "Rows",
    title: "Delete current row",
    label: "Delete",
    command: "deleteRow",
    icon: "delete-row",
    tone: "danger",
  },
  {
    id: "merge-cells",
    group: "Cells",
    title: "Merge selected cells",
    label: "Merge",
    command: "mergeCells",
    icon: "merge",
  },
  {
    id: "split-cell",
    group: "Cells",
    title: "Split current cell",
    label: "Split",
    command: "splitCell",
    icon: "split",
  },
  {
    id: "merge-or-split",
    group: "Cells",
    title: "Merge or split cells",
    label: "Auto",
    command: "mergeOrSplit",
    icon: "merge",
  },
  {
    id: "toggle-header-row",
    group: "Headers",
    title: "Toggle header row",
    label: "Row",
    command: "toggleHeaderRow",
    icon: "header-row",
  },
  {
    id: "toggle-header-column",
    group: "Headers",
    title: "Toggle header column",
    label: "Column",
    command: "toggleHeaderColumn",
    icon: "header-column",
  },
  {
    id: "toggle-header-cell",
    group: "Headers",
    title: "Toggle header cell",
    label: "Cell",
    command: "toggleHeaderCell",
    icon: "header-cell",
  },
  {
    id: "align-left",
    group: "Align",
    title: "Align current cells left",
    label: "Left",
    command: "setCellAttribute",
    args: ["align", null],
    icon: "align-left",
    variant: "icon",
  },
  {
    id: "align-center",
    group: "Align",
    title: "Align current cells center",
    label: "Center",
    command: "setCellAttribute",
    args: ["align", "center"],
    icon: "align-center",
    variant: "icon",
  },
  {
    id: "align-right",
    group: "Align",
    title: "Align current cells right",
    label: "Right",
    command: "setCellAttribute",
    args: ["align", "right"],
    icon: "align-right",
    variant: "icon",
  },
  {
    id: "cell-bg-clear",
    group: "Cell color",
    title: "Clear cell background",
    label: "Clear",
    command: "setCellAttribute",
    args: ["backgroundColor", null],
    icon: "color-clear",
    variant: "swatch",
  },
  {
    id: "cell-bg-yellow",
    group: "Cell color",
    title: "Use a soft yellow cell background",
    label: "Yellow",
    command: "setCellAttribute",
    args: ["backgroundColor", "rgba(245, 158, 11, 0.16)"],
    icon: "color-yellow",
    variant: "swatch",
  },
  {
    id: "cell-bg-blue",
    group: "Cell color",
    title: "Use a soft blue cell background",
    label: "Blue",
    command: "setCellAttribute",
    args: ["backgroundColor", "rgba(59, 130, 246, 0.14)"],
    icon: "color-blue",
    variant: "swatch",
  },
  {
    id: "cell-bg-green",
    group: "Cell color",
    title: "Use a soft green cell background",
    label: "Green",
    command: "setCellAttribute",
    args: ["backgroundColor", "rgba(16, 185, 129, 0.14)"],
    icon: "color-green",
    variant: "swatch",
  },
  {
    id: "previous-cell",
    group: "Navigate",
    title: "Move to previous cell",
    label: "Prev",
    command: "goToPreviousCell",
    icon: "previous",
  },
  {
    id: "next-cell",
    group: "Navigate",
    title: "Move to next cell",
    label: "Next",
    command: "goToNextCell",
    icon: "next",
  },
  {
    id: "fix-table",
    group: "Table",
    title: "Repair table structure",
    label: "Repair",
    command: "fixTables",
    icon: "repair",
  },
  {
    id: "delete-table",
    group: "Table",
    title: "Delete table",
    label: "Delete",
    command: "deleteTable",
    icon: "delete-table",
    tone: "danger",
  },
]);

const TABLE_AXIS_HANDLE_SIZE = 22;
const TABLE_ADD_ROW_WIDTH = 42;
const TABLE_ADD_ROW_HEIGHT = 22;
const TABLE_ADD_COLUMN_WIDTH = 22;
const TABLE_ADD_COLUMN_HEIGHT = 42;
const TABLE_CONTEXT_MENU_WIDTH = 264;
const TABLE_KEYBOARD_MENU_WIDTH = 520;
const TABLE_MENU_COMMAND_SCOPE = Object.freeze({
  cell: new Set([
    "align-left",
    "align-center",
    "align-right",
    "cell-bg-clear",
    "cell-bg-yellow",
    "cell-bg-blue",
    "cell-bg-green",
  ]),
  cells: new Set([
    "merge-cells",
    "align-left",
    "align-center",
    "align-right",
    "cell-bg-clear",
    "cell-bg-yellow",
    "cell-bg-blue",
    "cell-bg-green",
  ]),
  row: new Set([
    "add-row-before",
    "add-row-after",
    "delete-row",
    "toggle-header-row",
  ]),
  column: new Set([
    "add-column-before",
    "add-column-after",
    "delete-column",
    "toggle-header-column",
  ]),
  table: new Set([
    "toggle-header-row",
    "toggle-header-column",
    "delete-table",
  ]),
});
const TABLE_COMMAND_CONTEXT_ORDER = Object.freeze({
  row: [
    "add-row-after",
    "add-row-before",
    "toggle-header-row",
    "delete-row",
  ],
  column: [
    "add-column-after",
    "add-column-before",
    "toggle-header-column",
    "delete-column",
  ],
  table: [
    "toggle-header-row",
    "toggle-header-column",
    "delete-table",
  ],
});
const CONTEXTUAL_TABLE_COMMAND_IDS = TABLE_MENU_COMMAND_SCOPE.cell;
const SELECTION_TABLE_COMMAND_IDS = new Set([
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

function closestTableCellElement(target) {
  const tagName = String(target?.tagName ?? "").toLowerCase();
  if (tagName === "td" || tagName === "th") return target;
  return target?.closest?.("th,td") ?? null;
}

function tableRows(table) {
  return Array.from(table?.querySelectorAll?.("tr") ?? []);
}

function tableCells(row) {
  return Array.from(row?.querySelectorAll?.("th,td") ?? []);
}

function normalizedRect(rect) {
  if (!rect) return null;
  const left = Number(rect.left);
  const top = Number(rect.top);
  const right = Number(rect.right ?? left + Number(rect.width ?? 0));
  const bottom = Number(rect.bottom ?? top + Number(rect.height ?? 0));
  if (![left, top, right, bottom].every(Number.isFinite)) return null;
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function unionRects(rects) {
  const normalized = (rects ?? []).map(normalizedRect).filter(Boolean);
  if (normalized.length === 0) return null;

  const left = Math.min(...normalized.map((rect) => rect.left));
  const top = Math.min(...normalized.map((rect) => rect.top));
  const right = Math.max(...normalized.map((rect) => rect.right));
  const bottom = Math.max(...normalized.map((rect) => rect.bottom));
  return normalizedRect({ left, top, right, bottom });
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
  return (grid ?? []).find((row) => row.cells.length > 0)?.cells ?? [];
}

function selectionCellPositions(selection) {
  const positions = [];
  if (typeof selection?.forEachCell === "function") {
    try {
      selection.forEachCell((_node, pos) => {
        if (Number.isFinite(pos) && !positions.includes(pos)) {
          positions.push(pos);
        }
      });
    } catch (_error) {
      // Some lightweight test doubles expose only anchor/head positions.
    }
  }

  [selection?.$anchorCell?.pos, selection?.$headCell?.pos].forEach((pos) => {
    if (Number.isFinite(pos) && !positions.includes(pos)) {
      positions.push(pos);
    }
  });
  return positions;
}

function cellByPosition(grid, pos) {
  if (!Number.isFinite(pos)) return null;
  return (grid ?? [])
    .flatMap((row) => row.cells)
    .find((cell) => cell.pos === pos) ?? null;
}

function cellPosition(grid, element) {
  if (!element) return null;
  const cell = (grid ?? [])
    .flatMap((row) => row.cells)
    .find((item) => item.cell === element);
  return Number.isFinite(cell?.pos) ? cell.pos : null;
}

function tableSelectionState(selection, grid) {
  const positions = new Set(selectionCellPositions(selection));
  const rows = [];
  const columns = [];
  const totalCellCount = (grid ?? []).reduce((count, row) => count + row.cells.length, 0);

  (grid ?? []).forEach((row, rowIndex) => {
    if (row.cells.length > 0 && row.cells.every((cell) => positions.has(cell.pos))) {
      rows.push(rowIndex);
    }
  });

  firstRowCells(grid).forEach((_cell, columnIndex) => {
    const columnCells = (grid ?? [])
      .map((row) => row.cells.find((item) => item.columnIndex === columnIndex))
      .filter(Boolean);
    if (columnCells.length > 0 && columnCells.every((cell) => positions.has(cell.pos))) {
      columns.push(columnIndex);
    }
  });

  const selectedCount = positions.size;
  const tableSelected = totalCellCount > 0 && selectedCount === totalCellCount;
  const kind = tableSelected
    ? "table"
    : rows.length > 0
      ? "row"
      : columns.length > 0
        ? "column"
        : selectedCount > 1
          ? "cells"
          : "cell";

  return {
    kind,
    positions,
    rows,
    columns,
    table: tableSelected,
  };
}

function tableSelectionRect(grid, selection, tableRect) {
  if (selection?.table) return normalizedRect(tableRect);

  if (selection?.rows?.length > 0) {
    return unionRects(
      selection.rows
        .map((rowIndex) => grid?.[rowIndex]?.rect)
        .filter(Boolean),
    );
  }

  if (selection?.columns?.length > 0) {
    return unionRects(
      selection.columns.flatMap((columnIndex) =>
        (grid ?? [])
          .map((row) => row.cells.find((cell) => cell.columnIndex === columnIndex)?.rect)
          .filter(Boolean),
      ),
    );
  }

  const positions = selection?.positions ?? new Set();
  if (positions.size > 0) {
    return unionRects(
      (grid ?? [])
        .flatMap((row) => row.cells)
        .filter((cell) => positions.has(cell.pos))
        .map((cell) => cell.rect),
    );
  }

  return null;
}

function lastTableRowRect(grid, fallbackRect = null) {
  const lastRow = [...(grid ?? [])].reverse().find((row) => row?.rect);
  return normalizedRect(lastRow?.rect) ?? normalizedRect(fallbackRect);
}

function lastTableColumnRect(grid, fallbackRect = null) {
  const firstRow = firstRowCells(grid);
  const lastColumnIndex = firstRow.at(-1)?.columnIndex;
  if (!Number.isInteger(lastColumnIndex)) return normalizedRect(fallbackRect);
  return unionRects(
    (grid ?? [])
      .map((row) => row.cells.find((cell) => cell.columnIndex === lastColumnIndex)?.rect)
      .filter(Boolean),
  ) ?? normalizedRect(fallbackRect);
}

function tableMenuAnchorRect(state) {
  if (state?.menuAnchorRect) return state.menuAnchorRect;
  if (state?.mode === "keyboard") return state?.rect ?? null;

  const selectionKind = state?.selection?.kind ?? "cell";
  if (selectionKind === "cell" || selectionKind === "cells") {
    return state?.cellRect ?? state?.selectionRect ?? state?.rect ?? null;
  }

  return state?.selectionRect ?? state?.cellRect ?? state?.rect ?? null;
}

function pointerAnchorRect(event, fallbackRect = null) {
  const x = Number(event?.clientX);
  const y = Number(event?.clientY);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    return normalizedRect({ left: x, top: y, right: x, bottom: y });
  }
  return normalizedRect(fallbackRect);
}

function activeCellFromEditor(editor, grid = []) {
  const selection = editor?.state?.selection;
  const selectedHeadCell = cellByPosition(grid, selection?.$headCell?.pos);
  if (selectedHeadCell?.cell) return selectedHeadCell.cell;

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
  const grid = tableSelectionGrid(table, view);
  const rect = normalizedRect(table.getBoundingClientRect?.());
  const tableSelection = tableSelectionState(selection, grid);

  return {
    table,
    rect,
    grid,
    selection: tableSelection,
    selectionRect: tableSelectionRect(grid, tableSelection, rect),
    cell: activeCellFromEditor(editor, grid),
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

function cellValue(editor, name, grid = []) {
  const cell = activeCellFromEditor(editor, grid);
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

function tableCommandVariant(command) {
  if (command?.variant) return command.variant;
  const groupKey = command?.groupKey ?? command?.group;
  if (groupKey === "Align") return "icon";
  if (groupKey === "Cell color") return "swatch";
  return "text";
}

function tableCommandLayoutGroup(command) {
  const variant = tableCommandVariant(command);
  if (variant === "icon") return "align";
  if (variant === "swatch") return "cell-color";
  if (command?.tone === "danger") return "danger";
  return "actions";
}

function visibleCommands(commands, mode = "context", selectionKind = "cell") {
  const allowed = mode === "keyboard"
    ? KEYBOARD_TABLE_COMMAND_IDS
    : TABLE_MENU_COMMAND_SCOPE[selectionKind] ?? SELECTION_TABLE_COMMAND_IDS;
  const visible = (commands ?? []).filter((command) => allowed.has(command.id));
  const order = mode === "context" ? TABLE_COMMAND_CONTEXT_ORDER[selectionKind] : null;
  if (!order) return visible;
  return [...visible].sort((left, right) => {
    const leftIndex = order.indexOf(left.id);
    const rightIndex = order.indexOf(right.id);
    return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) -
      (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex);
  });
}

function firstEnabledCommandId(commands, mode = "context", selectionKind = "cell") {
  return enabledCommandIds(visibleCommands(commands, mode, selectionKind))[0] ?? null;
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

function commandButtons(root) {
  if (!root) return [];
  const buttons = [];
  const walk = (element) => {
    if (!element) return;
    if (element.dataset?.commandId) {
      buttons.push(element);
    }
    Array.from(element.children ?? []).forEach(walk);
  };
  walk(root);
  return buttons;
}

function guardPointerEvent(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
}

function bindPointerCommand(button, command, run) {
  if (!button || typeof run !== "function") return;
  const execute = () => {
    if (command?.disabled) return false;
    return run() !== false;
  };

  bindPointerActivation(button, execute);
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
  #header = null;
  #eyebrow = null;
  #title = null;
  #subtitle = null;
  #list = null;
  #addRowButton = null;
  #addColumnButton = null;
  #tableSelectButton = null;
  #cellMenuButton = null;
  #rowHandles = [];
  #columnHandles = [];
  #selectionBackdrop = null;
  #lastTable = null;

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
      !tableSelectButton ||
      !cellMenuButton ||
      !selectionBackdrop
    ) return;

    root.role = "toolbar";
    header.append(eyebrow, title, subtitle);
    addRowButton.type = "button";
    addColumnButton.type = "button";
    tableSelectButton.type = "button";
    cellMenuButton.type = "button";
    cellMenuButton.setAttribute("aria-hidden", "false");
    cellMenuButton.setAttribute("aria-haspopup", "menu");
    root.append(header, list);
    mountFloatingRoot(root, container, this.#document);
    mountFloatingRoot(addRowButton, container, this.#document);
    mountFloatingRoot(addColumnButton, container, this.#document);
    mountFloatingRoot(tableSelectButton, container, this.#document);
    mountFloatingRoot(cellMenuButton, container, this.#document);
    mountFloatingRoot(selectionBackdrop, container, this.#document);
    this.#root = root;
    this.#header = header;
    this.#eyebrow = eyebrow;
    this.#title = title;
    this.#subtitle = subtitle;
    this.#list = list;
    this.#addRowButton = addRowButton;
    this.#addColumnButton = addColumnButton;
    this.#tableSelectButton = tableSelectButton;
    this.#cellMenuButton = cellMenuButton;
    this.#selectionBackdrop = selectionBackdrop;
    setHidden(root, true);
    setHidden(addRowButton, true);
    setHidden(addColumnButton, true);
    setHidden(tableSelectButton, true);
    setHidden(cellMenuButton, true);
    setHidden(selectionBackdrop, true);
  }

  update(state) {
    if (!this.#root || !this.#list || !state.open) return;

    this.#list.replaceChildren();
    this.#root.setAttribute("aria-label", tableToolsLabel(state.language));
    this.#root.dataset.mode = state.mode;
    this.#root.dataset.open = state.menuOpen ? "true" : "false";
    this.#root.dataset.selectionKind = state.selection?.kind ?? "cell";
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
      this.#cellMenuButton._mnRun = () => state.openCellMenu?.("context") !== false;
      if (!this.#cellMenuButton._mnBound) {
        bindPointerCommand(this.#cellMenuButton, null, () => this.#cellMenuButton?._mnRun?.());
        this.#cellMenuButton._mnBound = true;
      }
    }
    const menuCommands = state.menuOpen ? visibleCommands(state.commands, state.mode, state.selection?.kind) : [];
    const commandGroups = [];
    menuCommands.forEach((command) => {
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
      button.title = command.title;
      button.setAttribute("aria-label", command.title);
      button.textContent = state.mode === "context" ? command.title : command.label;
      button.dataset.commandId = command.id;
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
      bindPointerCommand(button, command, () => state.run(command.id));
      if (command.variant === "icon" || command.variant === "swatch") {
        const visual = createElement(
          this.#document,
          "span",
          "mn-tiptap-table-toolbar-button-visual",
        );
        if (visual) {
          visual.setAttribute("aria-hidden", "true");
          visual.dataset.icon = command.icon ?? command.id;
          button.replaceChildren(visual);
        }
      }
      commandGroups.at(-1)?.appendChild(button);
    });
    this.#list.append(...commandGroups);

    setHidden(this.#root, !state.menuOpen || menuCommands.length === 0);
    this.#root.dataset.keyboardActive = state.keyboardActive ? "true" : "false";
    this.#root.onkeydown = (event) => state.handleKeyDown?.(event);
    this.#applySelectionState(state);
    this.#updateSelectionBackdrop(state);
    this.#updateQuickAdd(state);
    this.#updateTableHandle(state);
    this.#updateCellMenuTrigger(state);
    this.#updateAxisHandles(state);
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
    if (!rect || !this.#addRowButton || !this.#addColumnButton) return;

    const addRow = state.commands.find((command) => command.id === "add-row-after");
    const addColumn = state.commands.find((command) => command.id === "add-column-after");
    const rowRect = lastTableRowRect(state.grid, rect);
    const columnRect = lastTableColumnRect(state.grid, rect);
    this.#addRowButton.style.left = `${rowRect.left + Math.max(0, rowRect.width) / 2 - TABLE_ADD_ROW_WIDTH / 2}px`;
    this.#addRowButton.style.top = `${rowRect.bottom + 6}px`;
    this.#addColumnButton.style.left = `${columnRect.right + 6}px`;
    this.#addColumnButton.style.top = `${columnRect.top + Math.max(0, columnRect.height) / 2 - TABLE_ADD_COLUMN_HEIGHT / 2}px`;
    this.#addRowButton.dataset.edge = "row";
    this.#addRowButton.style.setProperty("--mn-table-quick-add-rail", `${Math.max(42, rowRect.width)}px`);
    this.#addColumnButton.dataset.edge = "column";
    this.#addColumnButton.style.setProperty("--mn-table-quick-add-rail", `${Math.max(42, columnRect.height)}px`);

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
    this.#tableSelectButton.dataset.active = state.selection?.table ? "true" : "false";
    this.#tableSelectButton._mnRun = () => {
      state.selectAxis("table", 0);
      return state.toggleMenu("context", { open: true });
    };
    if (!this.#tableSelectButton._mnBound) {
      bindPointerCommand(this.#tableSelectButton, null, () => this.#tableSelectButton?._mnRun?.());
      this.#tableSelectButton._mnBound = true;
    }
    setHidden(this.#tableSelectButton, (state.grid ?? []).length === 0);
  }

  #updateCellMenuTrigger(state) {
    const rect = tableMenuAnchorRect(state);
    if (!this.#cellMenuButton) return;
    if (!rect) {
      setHidden(this.#cellMenuButton, true);
      return;
    }

    const selectionKind = state.selection?.kind ?? "cell";
    const triggerLeft = selectionKind === "cell" || selectionKind === "cells"
      ? rect.left + Math.max(0, rect.width - 22) / 2
      : rect.right - 11;
    const triggerTop = selectionKind === "column"
      ? rect.bottom - 11
      : rect.top + Math.max(0, rect.height - 22) / 2;
    this.#cellMenuButton.style.left = `${triggerLeft}px`;
    this.#cellMenuButton.style.top = `${triggerTop}px`;
    setHidden(this.#cellMenuButton, !rect);
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
    if (!tableRect || grid.length === 0) return;

    grid.forEach((row, index) => {
      const rect = row.rect;
      if (!rect) return;
      const button = createElement(this.#document, "button", "mn-tiptap-table-axis-handle row");
      if (!button) return;
      button.type = "button";
      button.title = selectTableRowLabel(state.language, index);
      button.setAttribute("aria-label", selectTableRowLabel(state.language, index));
      button.dataset.active = state.selection?.rows?.includes?.(index) ? "true" : "false";
      button.style.left = `${tableRect.left - TABLE_AXIS_HANDLE_SIZE - 6}px`;
      button.style.top = `${rect.top + Math.max(0, rect.height - TABLE_AXIS_HANDLE_SIZE) / 2}px`;
      bindPointerCommand(button, null, () => {
        state.selectAxis("row", index);
        return state.toggleMenu("context", { open: true });
      });
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
      button.dataset.active = state.selection?.columns?.includes?.(index) ? "true" : "false";
      button.style.left = `${rect.left + Math.max(0, rect.width - TABLE_AXIS_HANDLE_SIZE) / 2}px`;
      button.style.top = `${tableRect.top - TABLE_AXIS_HANDLE_SIZE - 6}px`;
      bindPointerCommand(button, null, () => {
        state.selectAxis("column", index);
        return state.toggleMenu("context", { open: true });
      });
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

  hide() {
    setHidden(this.#root, true);
    setHidden(this.#addRowButton, true);
    setHidden(this.#addColumnButton, true);
    setHidden(this.#tableSelectButton, true);
    setHidden(this.#cellMenuButton, true);
    setHidden(this.#selectionBackdrop, true);
    this.#lastTable
      ?.querySelectorAll?.(".mn-tiptap-table-cell-selected")
      ?.forEach?.((cell) => cell.classList?.remove?.("mn-tiptap-table-cell-selected"));
    this.#clearAxisHandles();
    this.#lastTable = null;
  }

  contains(target) {
    return (
      this.#root?.contains?.(target) ||
      this.#addRowButton?.contains?.(target) ||
      this.#addColumnButton?.contains?.(target) ||
      this.#tableSelectButton?.contains?.(target) ||
      this.#cellMenuButton?.contains?.(target) ||
      this.#selectionBackdrop?.contains?.(target) ||
      this.#rowHandles.some((button) => button.contains?.(target)) ||
      this.#columnHandles.some((button) => button.contains?.(target)) ||
      false
    );
  }

  setActiveCommand(commandId, keyboardActive = true) {
    if (!this.#root) return false;

    const buttons = commandButtons(this.#list);
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
    this.#tableSelectButton = null;
    this.#cellMenuButton = null;
    this.#selectionBackdrop = null;
  }
}

export class TiptapTableToolbarController {
  #view;
  #dismiss;
  #document = null;
  #editor = null;
  #entry = null;
  #removeListeners = [];
  #state = {
    open: false,
    menuOpen: false,
    mode: "context",
    table: null,
    rect: null,
    cell: null,
    cellRect: null,
    selectionRect: null,
    menuAnchorRect: null,
    grid: [],
    selection: tableSelectionState(null, []),
    commands: [],
    activeCommandId: null,
    keyboardActive: false,
    language: "english",
  };

  constructor({ view = null, dom = {} } = {}) {
    const documentRef = dom.document ?? defaultDocument();
    const windowRef = dom.window ?? defaultWindow(documentRef);
    this.#document = documentRef;
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
      shouldDismiss: (event) => this.#shouldDismiss(event),
      onDismiss: () => this.close(),
    });
  }

  get state() {
    return {
      ...this.#state,
      commands: this.#state.commands.map((command) => ({ ...command })),
      selection: {
        ...this.#state.selection,
        positions: new Set(this.#state.selection?.positions ?? []),
        rows: [...(this.#state.selection?.rows ?? [])],
        columns: [...(this.#state.selection?.columns ?? [])],
      },
    };
  }

  attach({ editor, root, entry } = {}) {
    this.#editor = editor ?? null;
    this.#entry = entry ?? null;
    this.#view.mount?.(root);
    this.#bind(editor?.view?.dom ?? root);
    this.refresh(editor);
  }

  shouldKeepOpenOnEditorBlur(activeElement = null) {
    return Boolean(
      this.#state.open &&
        (this.contains(activeElement) ||
          this.#state.table?.contains?.(activeElement) ||
          activeElement == null ||
          activeElement === this.#document?.body),
    );
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

  #bind(target) {
    this.#unbind();
    if (!target?.addEventListener) return;

    const onContextMenu = (event) => this.handleContextMenu(event);
    target.addEventListener("contextmenu", onContextMenu, true);
    this.#removeListeners = [
      () => target.removeEventListener?.("contextmenu", onContextMenu, true),
    ];
  }

  #unbind() {
    this.#removeListeners.forEach((remove) => remove());
    this.#removeListeners = [];
  }

  refresh(editor = this.#editor) {
    if (!editor || this.#entry?.viewMode !== "hybrid") {
      this.close();
      return this.state;
    }

    const previousTable = this.#state.table;
    const previousKind = this.#state.selection.kind;
    const previousPositions = this.#state.selection.positions ?? new Set();
    const context = activeTableContext(editor);
    const previousMenuAnchorRect =
      this.#state.open && this.#state.menuOpen && previousTable === context?.table
        ? this.#state.menuAnchorRect
        : null;
    if (!context?.rect) {
      this.close();
      return this.state;
    }
    const selectionChanged =
      this.#state.open &&
      previousTable === context.table &&
      (previousKind !== context.selection.kind ||
        previousPositions.size !== (context.selection.positions?.size ?? 0) ||
        [...previousPositions].some((pos) => !context.selection.positions.has(pos)));

    const language = entryLanguage(this.#entry);
    const commands = TABLE_COMMANDS.filter(
      (command) => typeof editor.commands?.[command.command] === "function",
    ).map((command) => {
      const disabled = !canRunEditorCommand(editor, command.command, command.args);
      return localizeTableCommand({
        ...command,
        disabled,
        variant: tableCommandVariant(command),
        layoutGroup: tableCommandLayoutGroup(command),
        active:
          command.command === "setCellAttribute" &&
          command.args?.length >= 2 &&
          normalizeCellAttributeValue(command.args[0], cellValue(editor, command.args[0], context.grid)) ===
            normalizeCellAttributeValue(command.args[0], command.args[1]),
      }, language);
    });
    const currentVisibleCommands = visibleCommands(
      commands,
      this.#state.menuOpen ? this.#state.mode : "context",
      context.selection.kind,
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
      selectionRect: context.selectionRect,
      menuAnchorRect: previousMenuAnchorRect,
      grid: context.grid,
      selection: context.selection,
      commands,
      activeCommandId,
      keyboardActive: this.#state.keyboardActive,
      language,
    };
    if (selectionChanged) {
      this.#state.menuOpen = false;
      this.#state.mode = "context";
      this.#state.keyboardActive = false;
      this.#state.menuAnchorRect = null;
    }
    this.#view.update?.({
      ...this.#state,
      run: (commandId) => this.run(commandId),
      selectAxis: (axis, index) => this.selectAxis(axis, index),
      toggleMenu: (mode, options) => this.toggleMenu(mode, options),
      openCellMenu: (mode, options) => this.openCellMenu(mode, options),
      handleKeyDown: (event) => this.handleKeyDown(event),
    });
    this.#dismiss.open();
    return this.state;
  }

  setActiveCommand(commandId, { focus = false, keyboardActive = true } = {}) {
    if (!this.#state.open) return false;
    const command = visibleCommands(this.#state.commands, this.#state.mode, this.#state.selection.kind).find(
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
      visibleCommands(this.#state.commands, this.#state.mode, this.#state.selection.kind),
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
        menuAnchorRect: null,
        keyboardActive: true,
      };
      this.#view.update?.({
        ...this.#state,
        run: (commandId) => this.run(commandId),
        selectAxis: (axis, index) => this.selectAxis(axis, index),
        toggleMenu: (mode, options) => this.toggleMenu(mode, options),
        openCellMenu: (mode, options) => this.openCellMenu(mode, options),
        handleKeyDown: (keyboardEvent) => this.handleKeyDown(keyboardEvent),
      });
      const firstId = enabledCommandIds(visibleCommands(this.#state.commands, "keyboard", this.#state.selection.kind))[0] ?? null;
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
      const firstId = enabledCommandIds(visibleCommands(this.#state.commands, this.#state.mode, this.#state.selection.kind))[0] ?? null;
      if (!firstId) return false;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      return this.setActiveCommand(firstId, { focus: true, keyboardActive: true });
    }
    if (key === "End") {
      const ids = enabledCommandIds(visibleCommands(this.#state.commands, this.#state.mode, this.#state.selection.kind));
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

  handleContextMenu(event) {
    if (!this.#editor || this.#entry?.viewMode !== "hybrid") return false;

    const target = event?.target;
    const table = closestTableElement(target, this.#editor?.view?.dom);
    if (!table) return false;

    event?.preventDefault?.();
    event?.stopPropagation?.();

    const cell = closestTableCellElement(target);
    if (cell && table.contains?.(cell) && typeof this.#editor?.view?.posAtDOM === "function") {
      try {
        const pos = this.#editor.view.posAtDOM(cell, 0);
        if (
          Number.isFinite(pos) &&
          typeof this.#editor.commands?.setCellSelection === "function"
        ) {
          this.#editor.commands.setCellSelection({
            anchorCell: pos,
            headCell: pos,
          });
        }
      } catch (_error) {
        // Fall through to refreshing the existing table selection.
      }
    }

    this.#editor.commands?.focus?.();
    const anchorRect = pointerAnchorRect(event, cell?.getBoundingClientRect?.());
    this.refresh(this.#editor);
    return this.toggleMenu("context", { open: true, anchorRect });
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

  toggleMenu(mode = "context", { open = null, anchorRect = null } = {}) {
    if (!this.#state.open) return false;
    const nextMode = mode === "keyboard" ? "keyboard" : "context";
    const nextOpen = open === null ? !(this.#state.menuOpen && this.#state.mode === nextMode) : !!open;
    const scopedCommands = visibleCommands(this.#state.commands, nextMode, this.#state.selection.kind);
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
      menuAnchorRect: nextOpen
        ? normalizedRect(anchorRect) ?? this.#state.menuAnchorRect ?? null
        : null,
      activeCommandId,
      keyboardActive: nextMode === "keyboard" && nextOpen ? this.#state.keyboardActive : false,
    };
    this.#view.update?.({
      ...this.#state,
      run: (commandId) => this.run(commandId),
      selectAxis: (axis, index) => this.selectAxis(axis, index),
      toggleMenu: (menuMode, options) => this.toggleMenu(menuMode, options),
      openCellMenu: (menuMode, options) => this.openCellMenu(menuMode, options),
      handleKeyDown: (event) => this.handleKeyDown(event),
    });
    return true;
  }

  openCellMenu(mode = "context", { open = null } = {}) {
    if (!this.#state.open) return false;
    const isPlainCellContext =
      this.#state.selection?.kind === "cell" &&
      (this.#state.selection?.positions?.size ?? 0) === 0;
    const pos = isPlainCellContext ? cellPosition(this.#state.grid, this.#state.cell) : null;
    if (
      Number.isFinite(pos) &&
      typeof this.#editor?.commands?.setCellSelection === "function"
    ) {
      const ok =
        this.#editor.commands.setCellSelection({
          anchorCell: pos,
          headCell: pos,
        }) !== false;
      if (ok) {
        this.#editor.commands?.focus?.();
        this.refresh(this.#editor);
      }
    }
    return this.toggleMenu(mode, { open });
  }

  selectAxis(axis, index) {
    const ok = selectTableAxis(this.#editor, this.#state.grid, axis, index);
    this.refresh(this.#editor);
    this.#state = {
      ...this.#state,
      menuOpen: false,
      mode: "context",
      activeCommandId: firstEnabledCommandId(this.#state.commands, "context", this.#state.selection.kind),
      keyboardActive: false,
      menuAnchorRect: null,
    };
    this.#view.update?.({
      ...this.#state,
      run: (commandId) => this.run(commandId),
      selectAxis: (selectedAxis, selectedIndex) => this.selectAxis(selectedAxis, selectedIndex),
      toggleMenu: (menuMode, options) => this.toggleMenu(menuMode, options),
      openCellMenu: (menuMode, options) => this.openCellMenu(menuMode, options),
      handleKeyDown: (event) => this.handleKeyDown(event),
    });
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
      selectionRect: null,
      menuAnchorRect: null,
      grid: [],
      selection: tableSelectionState(null, []),
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
    this.#unbind();
    this.#dismiss.close();
    this.#view.destroy?.();
    this.#editor = null;
    this.#entry = null;
  }
}

export function createTiptapTableToolbarController(options) {
  return new TiptapTableToolbarController(options);
}
