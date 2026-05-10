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
export const TABLE_SELECTED_CELL_EDGE_CLASSES = Object.freeze({
  top: "mn-tiptap-table-cell-selected-edge-top",
  right: "mn-tiptap-table-cell-selected-edge-right",
  bottom: "mn-tiptap-table-cell-selected-edge-bottom",
  left: "mn-tiptap-table-cell-selected-edge-left",
});

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

function selectedCellHeadEntry(state) {
  const positions = state?.selection?.positions;
  if ((positions?.size ?? 0) === 0) return null;
  const headPosition = Number.isFinite(state?.selection?.headCell)
    ? state.selection.headCell
    : [...positions].at(-1);
  return cellEntryByPosition(state?.grid, headPosition);
}

function selectedCellRect(state) {
  const selected = selectedCellEntry(state);
  return normalizedRect(selected?.rect ?? selected?.cell?.getBoundingClientRect?.());
}

function selectedCells(state) {
  const positions = state?.selection?.positions ?? new Set();
  return tableGridCells(state).filter((cell) => positions.has(cell.pos));
}

function tableGridCells(state) {
  return (state?.grid ?? []).flatMap((row) => row.cells ?? []);
}

function hasSelectedNeighbor(cells, positions, cell, rowDelta, columnDelta) {
  return cells.some(
    (candidate) =>
      candidate.rowIndex === cell.rowIndex + rowDelta &&
      candidate.columnIndex === cell.columnIndex + columnDelta &&
      positions.has(candidate.pos),
  );
}

function selectedCellEdgeClassNames(cells, positions, cell) {
  return [
    ["top", -1, 0],
    ["right", 0, 1],
    ["bottom", 1, 0],
    ["left", 0, -1],
  ]
    .filter(([, rowDelta, columnDelta]) =>
      !hasSelectedNeighbor(cells, positions, cell, rowDelta, columnDelta),
    )
    .map(([edge]) => TABLE_SELECTED_CELL_EDGE_CLASSES[edge]);
}

function unionCellRects(cells = []) {
  const rects = cells
    .map((cell) => normalizedRect(cell?.rect ?? cell?.cell?.getBoundingClientRect?.()))
    .filter(Boolean);
  if (rects.length === 0) return null;

  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return normalizedRect({ left, top, right, bottom });
}

export function clearTableCellVisualState(table) {
  table
    ?.querySelectorAll?.(`.${TABLE_SELECTED_CELL_CLASS}`)
    ?.forEach?.((cell) => cell.classList?.remove?.(TABLE_SELECTED_CELL_CLASS));
  Object.values(TABLE_SELECTED_CELL_EDGE_CLASSES).forEach((className) => {
    table
      ?.querySelectorAll?.(`.${className}`)
      ?.forEach?.((cell) => cell.classList?.remove?.(className));
  });
  table
    ?.querySelectorAll?.(`.${TABLE_ACTIVE_CELL_CLASS}`)
    ?.forEach?.((cell) => cell.classList?.remove?.(TABLE_ACTIVE_CELL_CLASS));
}

export function applyTableCellVisualState(state) {
  const table = state?.table ?? null;
  if (!table) return false;

  clearTableCellVisualState(table);

  const selectedPositions = state?.selection?.positions ?? new Set();
  const selectionKind = state?.selection?.kind ?? "cell";
  const shouldPaintCellObjects = ["cell", "cells"].includes(selectionKind);
  const cells = tableGridCells(state);
  cells.forEach((cell) => {
    const selected = shouldPaintCellObjects && selectedPositions.has(cell.pos);
    cell.cell?.classList?.toggle?.(
      TABLE_SELECTED_CELL_CLASS,
      selected,
    );
    Object.values(TABLE_SELECTED_CELL_EDGE_CLASSES).forEach((className) => {
      cell.cell?.classList?.remove?.(className);
    });
    if (selected) {
      selectedCellEdgeClassNames(cells, selectedPositions, cell).forEach((className) => {
        cell.cell?.classList?.add?.(className);
      });
    }
  });

  const activeCell =
    state?.selection?.kind === "cell" && selectedPositions.size === 0
      ? state?.cell ?? null
      : null;
  if (activeCell) {
    activeCell.classList?.add?.(TABLE_ACTIVE_CELL_CLASS);
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
  const actionScope = ["cell", "cells", "row", "column", "table"].includes(selectionKind)
    ? selectionKind
    : "cell";
  const selectedCount = state?.selection?.positions?.size ?? 0;
  const edgeIntent = state?.hover?.edge === "cell-menu";
  const selectedHead = ["cell", "cells"].includes(selectionKind)
    ? selectedCellHeadEntry(state)
    : null;
  const selectedRect = selectedCount === 1
    ? selectedCellRect(state)
    : normalizedRect(selectedHead?.rect ?? selectedHead?.cell?.getBoundingClientRect?.());
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
  const selectionRect =
    selectedCount > 1
      ? selectedRect ?? state?.menuRect ?? state?.selectionRect
      : state?.menuOpen
        ? tableMenuAnchorRect(state)
        : null;
  const rect =
    (selectionKind === "cells" && selectedCount > 1 ? normalizedRect(selectionRect) : null) ??
    (singleSelectedCell && selectionKind === "cell"
      ? selectedRect ?? normalizedRect(state?.cellRect ?? state?.cell?.getBoundingClientRect?.())
      : null) ??
    normalizedRect(selectionRect);

  const trigger = tableCellMenuTriggerGeometry({
    rect,
    selectionKind,
    edgeHovered: selectedCount > 0 && (edgeIntent || menuOpen),
    selectedCount,
  });
  const visible = Boolean(
    trigger &&
      (state?.menuOpen || singleSelectedCell || selectedCount > 1),
  );

  return {
    visible,
    trigger,
    edgeIntent,
    menuOpen,
    selectionKind,
    actionScope,
    selectedCount,
    headCell: selectedHead?.cell ?? null,
    headCellPos: selectedHead?.pos ?? null,
  };
}

export function createTableCellObjectSelectionChromeState(state) {
  const selectionKind = state?.selection?.kind ?? "cell";
  const selectedCount = state?.selection?.positions?.size ?? 0;
  if (selectedCount === 0 || !["cell", "cells"].includes(selectionKind)) {
    return {
      visible: false,
      boxes: [],
      outline: null,
      selectionKind,
      selectedCount,
    };
  }

  const cells = selectedCells(state);
  const rects = cells
    .map((cell) => normalizedRect(cell.rect ?? cell.cell?.getBoundingClientRect?.()))
    .filter(Boolean);
  const selectionRect = normalizedRect(state?.selectionRect);
  const left = rects.length > 0 ? Math.min(...rects.map((rect) => rect.left)) : selectionRect?.left;
  const top = rects.length > 0 ? Math.min(...rects.map((rect) => rect.top)) : selectionRect?.top;
  const right = rects.length > 0 ? Math.max(...rects.map((rect) => rect.right)) : selectionRect?.right;
  const bottom = rects.length > 0 ? Math.max(...rects.map((rect) => rect.bottom)) : selectionRect?.bottom;
  const outline = normalizedRect({ left, top, right, bottom });

  return {
    visible: Boolean(outline),
    boxes: rects,
    outline,
    selectionKind,
    selectedCount,
  };
}

export function createTableAxisObjectSelectionChromeState(state) {
  const selectionKind = state?.selection?.kind ?? "cell";
  const selectedCount = state?.selection?.positions?.size ?? 0;
  if (!["row", "column", "table"].includes(selectionKind) || selectedCount === 0) {
    return {
      visible: false,
      outline: null,
      selectionKind,
      selectedCount,
    };
  }

  return {
    visible: Boolean(normalizedRect(state?.selectionRect)),
    outline: normalizedRect(state?.selectionRect),
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
  const cellChrome = createTableCellObjectSelectionChromeState(state);
  const axisChrome = createTableAxisObjectSelectionChromeState(state);
  const rect = cellChrome.outline ?? axisChrome.outline ?? normalizedRect(state?.selectionRect);
  const selectedCount = state?.selection?.positions?.size ?? 0;
  const visible = Boolean(
    rect &&
      selectedCount > 0,
  );
  return {
    visible,
    rect,
    boxes: cellChrome.boxes ?? [],
    selectionKind: state?.selection?.kind ?? "cell",
    selectedCount,
  };
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
  bridgeSize = 10,
} = {}) {
  const tableRect = normalizedRect(state?.rect);
  const grid = state?.grid ?? [];
  if (!tableRect || grid.length === 0) {
    return { rows: [], columns: [] };
  }

  const geometry = tableAxisHandleGeometry(grid, tableRect, {
    handleSize,
    rowHandleWidth,
    columnHandleHeight,
  });
  const hoverEdge = state?.hover?.edge;
  const axisHoverAllowed = Boolean(
    state?.hover?.cell &&
      !["add-row", "add-column"].includes(hoverEdge),
  );
  const hoverRowIndex =
    axisHoverAllowed &&
    Number.isInteger(state?.hover?.rowIndex) &&
    !["column-handle"].includes(hoverEdge)
      ? state.hover.rowIndex
      : null;
  const hoverColumnIndex =
    axisHoverAllowed &&
    Number.isInteger(state?.hover?.columnIndex) &&
    !["row-handle"].includes(hoverEdge)
      ? state.hover.columnIndex
      : null;

  const rowHandle = Number.isInteger(hoverRowIndex)
    ? geometry.rows.find((handle) => handle.index === hoverRowIndex)
    : null;
  const columnHandle = Number.isInteger(hoverColumnIndex)
    ? geometry.columns.find((handle) => handle.index === hoverColumnIndex)
    : null;
  const selectedRows = new Set(state?.selection?.rows ?? []);
  const selectedColumns = new Set(state?.selection?.columns ?? []);
  const selectionKind = state?.selection?.kind ?? "cell";

  const bridge = Math.max(0, Number(bridgeSize) || 0);

  return {
    rows: rowHandle
      ? [{
          ...rowHandle,
          axis: "row",
          active:
            (selectionKind === "row" && selectedRows.has(rowHandle.index)) ||
            selectionKind === "table",
          visible: true,
          bridge: {
            left: rowHandle.left,
            top: rowHandle.top,
            width: rowHandle.width + bridge,
            height: rowHandle.height,
          },
        }]
      : [],
    columns: columnHandle
      ? [{
          ...columnHandle,
          axis: "column",
          active:
            (selectionKind === "column" && selectedColumns.has(columnHandle.index)) ||
            selectionKind === "table",
          visible: true,
          bridge: {
            left: columnHandle.left,
            top: columnHandle.top,
            width: columnHandle.width,
            height: columnHandle.height + bridge,
          },
        }]
      : [],
  };
}
