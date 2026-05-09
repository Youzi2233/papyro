import {
  hoverIsAtLastColumn,
  hoverIsAtLastRow,
  normalizedRect,
  tableAxisHandleGeometry,
  tableCellMenuTriggerGeometry,
  tableQuickAddGeometry,
} from "./tiptap-table-geometry.js";

export const TABLE_SELECTED_CELL_CLASS = "mn-tiptap-table-cell-selected";
export const TABLE_ACTIVE_CELL_CLASS = "mn-tiptap-table-cell-active";

export function tableMenuAnchorRect(state) {
  if (state?.menuAnchorRect) return state.menuAnchorRect;
  if (state?.mode === "keyboard") return state?.rect ?? null;

  const selectionKind = state?.selection?.kind ?? "cell";
  if (selectionKind === "cell" || selectionKind === "cells") {
    return state?.cellRect ?? state?.menuRect ?? state?.selectionRect ?? state?.rect ?? null;
  }

  return state?.menuRect ?? state?.selectionRect ?? state?.cellRect ?? state?.rect ?? null;
}

function commandById(commands, id) {
  return (commands ?? []).find((command) => command.id === id) ?? null;
}

function cellEntryByPosition(grid, position) {
  if (!Number.isFinite(position)) return null;
  return (grid ?? [])
    .flatMap((row) => row.cells ?? [])
    .find((cell) => cell.pos === position) ?? null;
}

function selectedCellEntry(state) {
  const positions = state?.selection?.positions;
  if ((positions?.size ?? 0) !== 1) return null;
  return cellEntryByPosition(state?.grid, [...positions][0]);
}

function selectedCellRect(state) {
  const selected = selectedCellEntry(state);
  return normalizedRect(selected?.rect ?? selected?.cell?.getBoundingClientRect?.());
}

function tableGridCells(state) {
  return (state?.grid ?? []).flatMap((row) => row.cells ?? []);
}

export function clearTableCellVisualState(table) {
  table
    ?.querySelectorAll?.(`.${TABLE_SELECTED_CELL_CLASS}`)
    ?.forEach?.((cell) => cell.classList?.remove?.(TABLE_SELECTED_CELL_CLASS));
  table
    ?.querySelectorAll?.(`.${TABLE_ACTIVE_CELL_CLASS}`)
    ?.forEach?.((cell) => cell.classList?.remove?.(TABLE_ACTIVE_CELL_CLASS));
}

export function applyTableCellVisualState(state) {
  const table = state?.table ?? null;
  if (!table) return false;

  clearTableCellVisualState(table);

  const selectedPositions = state?.selection?.positions ?? new Set();
  tableGridCells(state).forEach((cell) => {
    cell.cell?.classList?.toggle?.(
      TABLE_SELECTED_CELL_CLASS,
      selectedPositions.has(cell.pos),
    );
  });

  const showActive =
    state?.selection?.kind === "cell" &&
    selectedPositions.size === 0 &&
    state?.cell;
  if (showActive) {
    state.cell.classList?.add?.(TABLE_ACTIVE_CELL_CLASS);
  }

  return true;
}

export function createTableQuickAddChromeState(state, {
  rowHeight = 14,
  columnWidth = 14,
  hitSlop = 3,
} = {}) {
  const rect = normalizedRect(state?.rect);
  if (!rect) return { row: null, column: null };

  const geometry = tableQuickAddGeometry(state?.grid, rect, {
    rowHeight,
    columnWidth,
    hitSlop,
  });
  const addRow = commandById(state?.commands, "add-row-after");
  const addColumn = commandById(state?.commands, "add-column-after");

  return {
    row: geometry.row
      ? {
          ...geometry.row,
          edge: "row",
          command: addRow,
          commandId: "add-row-after",
          disabled: !!addRow?.disabled,
          visible: Boolean(
            !state?.menuOpen &&
              addRow &&
              hoverIsAtLastRow(state?.hover, state?.grid) &&
              state?.hover?.edge === "add-row",
          ),
        }
      : null,
    column: geometry.column
      ? {
          ...geometry.column,
          edge: "column",
          command: addColumn,
          commandId: "add-column-after",
          disabled: !!addColumn?.disabled,
          visible: Boolean(
            !state?.menuOpen &&
              addColumn &&
              hoverIsAtLastColumn(state?.hover, state?.grid) &&
              state?.hover?.edge === "add-column",
          ),
        }
      : null,
  };
}

export function createTableCellMenuTriggerChromeState(state) {
  const selectionKind = state?.selection?.kind ?? "cell";
  const selectedCount = state?.selection?.positions?.size ?? 0;
  const edgeIntent = state?.hover?.edge === "cell-menu";
  const selectedRect = selectedCellRect(state);
  const menuOpen = Boolean(
    state?.menuOpen &&
      (selectionKind !== "cell" ||
        (state?.mode === "context" &&
          (state?.cell === state?.hover?.cell || selectedCount > 0))),
  );
  const singleSelectedCell =
    selectionKind === "cell" &&
    selectedCount === 1 &&
    (selectedRect || state?.cellRect || state?.cell);
  const hoveredEdgeCell =
    selectionKind === "cell" &&
    selectedCount === 0 &&
    edgeIntent &&
    state?.hover?.cell &&
    (state?.hover?.cellRect || state?.hover?.cell);
  const selectionRect =
    selectedCount > 1
      ? state?.menuRect ?? state?.selectionRect
      : state?.menuOpen
        ? tableMenuAnchorRect(state)
        : null;
  const rect =
    (selectedCount > 1 ? normalizedRect(selectionRect) : null) ??
    (singleSelectedCell && selectionKind === "cell"
      ? selectedRect ?? normalizedRect(state?.cellRect ?? state?.cell?.getBoundingClientRect?.())
      : null) ??
    (hoveredEdgeCell
      ? normalizedRect(state?.hover?.cellRect ?? state?.hover?.cell?.getBoundingClientRect?.())
      : null) ??
    normalizedRect(selectionRect);

  const trigger = tableCellMenuTriggerGeometry({
    rect,
    selectionKind,
    edgeHovered: edgeIntent || menuOpen,
    selectedCount,
  });
  const visible = Boolean(
    trigger &&
      (state?.menuOpen || singleSelectedCell || hoveredEdgeCell || selectedCount > 1),
  );

  return {
    visible,
    trigger,
    edgeIntent,
    menuOpen,
    selectionKind,
    selectedCount,
  };
}

export function createComplexBlockInsertChromeState(state) {
  const blockRect = normalizedRect(state?.complexRect ?? state?.rect);
  const block = state?.complexBlock ?? state?.table;
  if (!blockRect || !block) {
    return {
      visible: false,
      block: null,
      blockKind: "complex",
      rect: null,
    };
  }

  const edge = state?.hover?.edge === "block-before" ? "before" : "after";
  const top = edge === "before" ? blockRect.top - 20 : blockRect.bottom + 2;

  return {
    visible: Boolean(
      (state?.hover?.edge === "block-after" || state?.hover?.edge === "block-before") &&
        state?.hover?.block === block &&
        block !== state?.table &&
        !state?.menuOpen,
    ),
    block,
    blockKind: block === state?.table ? "table" : "complex",
    edge,
    rect: {
      left: blockRect.left,
      top,
      width: Math.max(42, blockRect.width),
    },
  };
}

export function createTableSelectionBackdropChromeState(state) {
  const rect = normalizedRect(state?.selectionRect);
  const visible = Boolean(
    rect &&
      state?.selection?.kind !== "cell" &&
      (state?.selection?.positions?.size ?? 0) > 0,
  );
  return { visible, rect };
}

export function hoveredTableCellIsSelected(state) {
  const hoverCell = state?.hover?.cell ?? null;
  if (!hoverCell) return false;
  const selected = state?.selection?.positions;
  if (!selected || selected.size === 0) return false;
  const match = (state?.grid ?? [])
    .flatMap((row) => row.cells ?? [])
    .find((cell) => cell.cell === hoverCell);
  return Number.isFinite(match?.pos) && selected.has(match.pos);
}

export function createTableAxisHandleChromeState(state, {
  handleSize = 12,
  rowHandleWidth = 20,
  columnHandleHeight = 20,
} = {}) {
  const tableRect = normalizedRect(state?.rect);
  const grid = state?.grid ?? [];
  if (!tableRect || grid.length === 0 || state?.menuOpen) {
    return { rows: [], columns: [] };
  }

  const geometry = tableAxisHandleGeometry(grid, tableRect, {
    handleSize,
    rowHandleWidth,
    columnHandleHeight,
  });
  const hoverSelected = hoveredTableCellIsSelected(state);
  const hoverEdge = state?.hover?.edge;
  const axisHoverAllowed = Boolean(
    state?.hover?.cell &&
      !hoverSelected &&
      state?.selection?.kind === "cell" &&
      !["add-row", "add-column", "cell-menu"].includes(hoverEdge),
  );
  const hoverRowIndex =
    axisHoverAllowed &&
    (hoverEdge === "row-handle" || hoverEdge === "axis-corner") &&
    state?.hover?.columnIndex === 0
      ? state.hover.rowIndex
      : null;
  const hoverColumnIndex =
    axisHoverAllowed &&
    (hoverEdge === "column-handle" || hoverEdge === "axis-corner") &&
    state?.hover?.rowIndex === 0
      ? state.hover.columnIndex
      : null;

  const rowHandle = Number.isInteger(hoverRowIndex)
    ? geometry.rows.find((handle) => handle.index === hoverRowIndex)
    : null;
  const columnHandle = Number.isInteger(hoverColumnIndex)
    ? geometry.columns.find((handle) => handle.index === hoverColumnIndex)
    : null;

  return {
    rows: rowHandle && !state?.selection?.rows?.includes?.(rowHandle.index)
      ? [{ ...rowHandle, axis: "row", active: false, visible: true }]
      : [],
    columns: columnHandle && !state?.selection?.columns?.includes?.(columnHandle.index)
      ? [{ ...columnHandle, axis: "column", active: false, visible: true }]
      : [],
  };
}
