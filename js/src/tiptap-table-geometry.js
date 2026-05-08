const COMPLEX_BLOCK_SELECTOR = ".mn-tiptap-table, table, .mn-tiptap-code-block, pre";
const EDGE_HOT_ZONE_PX = 12;
const COMPLEX_BLOCK_INSERT_HOT_ZONE_PX = 18;
const TABLE_CELL_MENU_EDGE_HOT_ZONE_PX = 4;
const TABLE_CELL_MENU_CENTER_HOT_ZONE_PX = 8;

function elementFromTarget(target) {
  if (!target) return null;
  if (target.nodeType === 1 || typeof target.closest === "function") return target;
  return target.parentElement ?? (target.parentNode?.nodeType === 1 ? target.parentNode : null);
}

export function closestTableElement(target, editorDom) {
  const element = elementFromTarget(target);
  if (!element?.closest || !editorDom?.contains) return null;
  const table = element.closest(".mn-tiptap-table, table");
  return table && editorDom.contains(table) ? table : null;
}

export function closestTableCellElement(target) {
  const element = elementFromTarget(target);
  const tagName = String(element?.tagName ?? "").toLowerCase();
  if (tagName === "td" || tagName === "th") return element;
  return element?.closest?.("th,td") ?? null;
}

export function tableRows(table) {
  return Array.from(table?.querySelectorAll?.("tr") ?? []);
}

export function tableCells(row) {
  return Array.from(row?.querySelectorAll?.("th,td") ?? []);
}

export function normalizedRect(rect) {
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

export function tableSelectionGrid(table, view) {
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
                  rowIndex,
                  columnIndex,
                  pos,
                  rect: normalizedRect(cell.getBoundingClientRect?.()),
                }
              : null;
          } catch (_error) {
            return null;
          }
        })
        .filter(Boolean),
      rect: normalizedRect(row.getBoundingClientRect?.()),
    }))
    .filter((row) => row.cells.length > 0);
}

export function firstRowCells(grid) {
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

export function cellPosition(grid, element) {
  if (!element) return null;
  const cell = (grid ?? [])
    .flatMap((row) => row.cells)
    .find((item) => item.cell === element);
  return Number.isFinite(cell?.pos) ? cell.pos : null;
}

export function tableSelectionState(selection, grid) {
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

function tableSelectionRect(grid, selection, tableRect, rawSelection = null) {
  if (selection?.table) return normalizedRect(tableRect);

  const positions = selection?.positions ?? new Set();
  const selectedCells = (grid ?? [])
    .flatMap((row) => row.cells)
    .filter((cell) => positions.has(cell.pos));
  const selectedColumns = new Set(selectedCells.map((cell) => cell.columnIndex));
  const selectedRows = new Set(selectedCells.map((cell) => cell.rowIndex));
  const selectedRects = selectedCells.map((cell) => cell.rect).filter(Boolean);

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

  if (positions.size > 0) {
    if (selectedColumns.size > 1 || selectedRows.size > 1) {
      return unionRects(selectedRects);
    }

    const headPos = Number.isFinite(rawSelection?.$headCell?.pos)
      ? rawSelection.$headCell.pos
      : [...positions].at(-1);
    const headCell = cellByPosition(grid, headPos);
    if (headCell?.rect) return normalizedRect(headCell.rect);

    return unionRects(
      (grid ?? [])
        .flatMap((row) => row.cells)
        .filter((cell) => positions.has(cell.pos))
        .map((cell) => cell.rect),
    );
  }

  return null;
}

export function tableSelectionMenuRect(grid, selection, tableRect, rawSelection = null) {
  const positions = selection?.positions ?? new Set();
  if (selection?.kind === "cells" && positions.size > 1) {
    const headPos = Number.isFinite(rawSelection?.$headCell?.pos)
      ? rawSelection.$headCell.pos
      : [...positions].at(-1);
    const headCell = cellByPosition(grid, headPos);
    if (headCell?.rect) return normalizedRect(headCell.rect);
  }

  return tableSelectionRect(grid, selection, tableRect, rawSelection);
}

export function lastTableRowRect(grid, fallbackRect = null) {
  const lastRow = [...(grid ?? [])].reverse().find((row) => row?.rect);
  return normalizedRect(lastRow?.rect) ?? normalizedRect(fallbackRect);
}

export function lastTableColumnRect(grid, fallbackRect = null) {
  const firstRow = firstRowCells(grid);
  const lastColumnIndex = firstRow.at(-1)?.columnIndex;
  if (!Number.isInteger(lastColumnIndex)) return normalizedRect(fallbackRect);
  return unionRects(
    (grid ?? [])
      .map((row) => row.cells.find((cell) => cell.columnIndex === lastColumnIndex)?.rect)
      .filter(Boolean),
  ) ?? normalizedRect(fallbackRect);
}

function cellAtPoint(grid, clientX, clientY) {
  const x = Number(clientX);
  const y = Number(clientY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  for (const row of grid ?? []) {
    for (const item of row?.cells ?? []) {
      const rect = normalizedRect(item?.rect ?? item?.cell?.getBoundingClientRect?.());
      if (!rect || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        continue;
      }
      return item;
    }
  }

  return null;
}

export function tableCellAtPoint(grid, clientX, clientY) {
  return cellAtPoint(grid, clientX, clientY);
}

export function pointerAnchorRect(event, fallbackRect = null) {
  const x = Number(event?.clientX);
  const y = Number(event?.clientY);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    return normalizedRect({ left: x, top: y, right: x, bottom: y });
  }
  return normalizedRect(fallbackRect);
}

export function tableQuickAddGeometry(grid, tableRect, {
  rowHeight = 12,
  columnWidth = 12,
  minimumRailSize = 42,
  gap = 0,
} = {}) {
  const rect = normalizedRect(tableRect);
  if (!rect) return { row: null, column: null };

  const rowRect = lastTableRowRect(grid, rect);
  const columnRect = lastTableColumnRect(grid, rect);
  const rowWidth = Math.max(minimumRailSize, rowRect?.width ?? rect.width);
  const columnHeight = Math.max(minimumRailSize, columnRect?.height ?? rect.height);

  return {
    row: rowRect
      ? {
        left: rowRect.left,
          top: rowRect.bottom + gap,
          width: rowWidth,
          height: rowHeight,
          rail: rowWidth,
        }
      : null,
    column: columnRect
      ? {
          left: columnRect.right + gap,
          top: columnRect.top,
          width: columnWidth,
          height: columnHeight,
          rail: columnHeight,
        }
      : null,
  };
}

export function tableAxisHandleGeometry(grid, tableRect, {
  handleSize = 12,
  rowHandleWidth = 18,
  columnHandleHeight = 18,
  gap = 2,
} = {}) {
  const rect = normalizedRect(tableRect);
  if (!rect) return { table: null, rows: [], columns: [] };

  return {
    table: null,
    rows: (grid ?? [])
      .map((row, index) => {
        const rowRect = normalizedRect(row?.rect);
        const firstCellRect = normalizedRect(row?.cells?.[0]?.rect);
        if (!rowRect) return null;
        const top = firstCellRect?.top ?? rowRect.top;
        const height = Math.max(handleSize, firstCellRect?.height ?? rowRect.height);
        return {
          index,
          left: rect.left - rowHandleWidth - gap,
          top,
          width: rowHandleWidth,
          height,
        };
      })
      .filter(Boolean),
    columns: firstRowCells(grid)
      .map((cell, index) => {
        const cellRect = normalizedRect(cell?.rect);
        if (!cellRect) return null;
        return {
          index,
          left: cellRect.left,
          top: rect.top - columnHandleHeight - gap,
          width: Math.max(handleSize, cellRect.width),
          height: columnHandleHeight,
        };
      })
      .filter(Boolean),
  };
}

export function tableCellMenuTriggerGeometry({
  rect,
  selectionKind = "cell",
  edgeHovered = false,
  selectedCount = 0,
} = {}) {
  const normalized = normalizedRect(rect);
  if (!normalized) return null;

  const centeredCellSelection = selectionKind === "cells" && selectedCount > 1;
  const edgeCellTrigger = selectionKind === "cell" && edgeHovered;
  const left = normalized.right;
  const top = normalized.top + normalized.height / 2;

  return {
    left,
    top,
    placement: centeredCellSelection ? "center" : "edge",
  };
}

export function activeCellFromEditor(editor, grid = []) {
  const selection = editor?.state?.selection;
  const positions = selectionCellPositions(selection);
  if (positions.length === 1) {
    const selectedHeadCell = cellByPosition(grid, positions[0]);
    if (selectedHeadCell?.cell) return selectedHeadCell.cell;
  }

  const view = editor?.view;
  const domAtPos = typeof view?.domAtPos === "function" && Number.isFinite(selection?.from)
    ? view.domAtPos(selection.from)
    : null;
  const node = domAtPos?.node?.nodeType === 1 ? domAtPos.node : domAtPos?.node?.parentElement;
  return node?.tagName === "TH" || node?.tagName === "TD"
    ? node
    : node?.closest?.("th,td") ?? null;
}

export function activeTableContext(editor) {
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
    selectionRect: tableSelectionRect(grid, tableSelection, rect, selection),
    menuRect: tableSelectionMenuRect(grid, tableSelection, rect, selection),
    cell: activeCellFromEditor(editor, grid),
  };
}

export function closestComplexBlockElement(target, editorDom) {
  const element = elementFromTarget(target);
  if (!element?.closest || !editorDom?.contains) return null;
  const block = element.closest(COMPLEX_BLOCK_SELECTOR);
  return block && editorDom.contains(block) ? block : null;
}

export function complexBlockHoverContext(target, editorDom) {
  const block = closestComplexBlockElement(target, editorDom);
  const wrapper = block?.closest?.(".tableWrapper") ?? null;
  const anchor = wrapper && editorDom?.contains?.(wrapper) ? wrapper : block;
  const rect = normalizedRect(anchor?.getBoundingClientRect?.());
  return block && rect ? { block, rect } : null;
}

export function hoverIsNearComplexBlockBottom(rect, y) {
  return (
    rect &&
    Number.isFinite(y) &&
    y >= rect.bottom - COMPLEX_BLOCK_INSERT_HOT_ZONE_PX &&
    y <= rect.bottom + COMPLEX_BLOCK_INSERT_HOT_ZONE_PX
  );
}

function complexBlockElementPosition(view, block) {
  if (!block || typeof view?.posAtDOM !== "function") return null;
  const doc = view.state?.doc;
  const candidates = [block];
  const firstCell = block.matches?.(".mn-tiptap-table, table")
    ? tableCells(tableRows(block)[0])[0] ?? null
    : null;
  if (firstCell) candidates.push(firstCell);

  for (const candidate of candidates) {
    try {
      const pos = view.posAtDOM(candidate, 0);
      if (!Number.isFinite(pos)) continue;
      const directNode = doc?.nodeAt?.(pos);
      if (directNode?.type?.name === "table" || directNode?.type?.name === "codeBlock") {
        return pos;
      }
      if (!directNode && !doc?.resolve) {
        return pos;
      }
      const resolved = doc?.resolve?.(pos) ?? null;
      for (let depth = resolved?.depth ?? 0; depth > 0; depth -= 1) {
        const typeName = resolved.node?.(depth)?.type?.name;
        if (typeName === "table" || typeName === "codeBlock") {
          return resolved.before(depth);
        }
      }
    } catch (_error) {
      // Try the next candidate; ProseMirror DOM resolution differs for wrappers.
    }
  }

  return null;
}

export function complexBlockTarget(editor, block) {
  const doc = editor?.state?.doc;
  const view = editor?.view;
  const pos = complexBlockElementPosition(view, block);
  if (!doc || !block || !Number.isFinite(pos)) return null;

  const node = doc.nodeAt?.(pos) ?? block?.pmViewDesc?.node ?? null;
  const typeName = node?.type?.name ?? "";
  const tagName = String(block?.tagName ?? "").toLowerCase();
  const kind =
    typeName === "table" || tagName === "table"
      ? "table"
      : typeName === "codeBlock" || tagName === "pre"
        ? "code_block"
        : typeName || tagName || "block";

  return {
    block,
    kind,
    node,
    pos,
  };
}

export function insertParagraphAfterComplexBlock(editor, block) {
  const doc = editor?.state?.doc;
  const view = editor?.view;
  if (!doc || !block) return false;

  const blockPos = complexBlockElementPosition(view, block);
  const node = Number.isFinite(blockPos) ? doc.nodeAt?.(blockPos) : null;
  const insertPos = Number.isFinite(blockPos)
    ? blockPos + Math.max(1, node?.nodeSize ?? 1)
    : null;
  if (!Number.isFinite(insertPos)) return false;

  const ok = editor?.commands?.insertContentAt?.(
    insertPos,
    { type: "paragraph" },
    { updateSelection: true },
  ) !== false;
  if (!ok) return false;

  editor.commands?.setTextSelection?.(insertPos + 1);
  editor.commands?.focus?.();
  return true;
}

export function tableHoverContext(target, table, grid) {
  const element = elementFromTarget(target);
  const cell = closestTableCellElement(element);
  if (!cell || !table?.contains?.(cell)) {
    return table?.contains?.(element)
      ? { table: true, rowIndex: null, columnIndex: null, cell: null }
      : null;
  }

  const match = (grid ?? [])
    .flatMap((row) => row.cells.map((item) => ({ ...item, rowIndex: row.rowIndex })))
    .find((item) => item.cell === cell);
  if (!match) {
    return { table: true, rowIndex: null, columnIndex: null, cell };
  }

  return {
    table: true,
    rowIndex: match.rowIndex,
    columnIndex: match.columnIndex,
    cell,
    cellRect: normalizedRect(match.rect ?? cell.getBoundingClientRect?.()),
  };
}

function tableHoverContextAtPoint(table, grid, clientX, clientY) {
  const x = Number(clientX);
  const y = Number(clientY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const item = cellAtPoint(grid, x, y);
  if (item) {
    return {
      table: true,
      rowIndex: item.rowIndex,
      columnIndex: item.columnIndex,
      cell: item.cell,
      cellRect: normalizedRect(item.rect ?? item.cell?.getBoundingClientRect?.()),
    };
  }

  return null;
}

function tableRowHoverContextAtY(table, grid, clientY) {
  const y = Number(clientY);
  if (!Number.isFinite(y)) return null;

  for (const row of grid ?? []) {
    const rowRect = normalizedRect(row?.rect);
    const firstCell = row?.cells?.[0] ?? null;
    if (!rowRect || y < rowRect.top || y > rowRect.bottom) continue;
    return {
      table: true,
      rowIndex: row.rowIndex,
      columnIndex: 0,
      cell: firstCell?.cell ?? null,
      cellRect: normalizedRect(firstCell?.rect ?? firstCell?.cell?.getBoundingClientRect?.()) ?? rowRect,
    };
  }

  return null;
}

function tableColumnHoverContextAtX(table, grid, clientX) {
  const x = Number(clientX);
  if (!Number.isFinite(x)) return null;

  for (const item of firstRowCells(grid)) {
    const rect = normalizedRect(item?.rect ?? item?.cell?.getBoundingClientRect?.());
    if (!rect || x < rect.left || x > rect.right) continue;
    return {
      table: true,
      rowIndex: 0,
      columnIndex: item.columnIndex,
      cell: item.cell,
      cellRect: rect,
    };
  }

  return null;
}

function tableLastRowHoverContextAtX(table, grid, clientX, clientY) {
  const row = [...(grid ?? [])].reverse().find((candidate) => candidate?.rect);
  const rowRect = normalizedRect(row?.rect);
  const x = Number(clientX);
  const y = Number(clientY);
  if (
    !row ||
    !rowRect ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < rowRect.left ||
    x > rowRect.right
  ) {
    return null;
  }

  const matchedCell = cellAtPoint(grid, x, y) ?? row.cells[0] ?? null;

  return {
    table: true,
    rowIndex: row.rowIndex,
    columnIndex: matchedCell?.columnIndex ?? 0,
    cell: matchedCell?.cell ?? null,
    cellRect: normalizedRect(matchedCell?.rect ?? matchedCell?.cell?.getBoundingClientRect?.()) ?? rowRect,
  };
}

function tableLastColumnHoverContextAtY(table, grid, clientY) {
  const firstRow = firstRowCells(grid);
  const lastColumnIndex = firstRow.at(-1)?.columnIndex;
  const columnRect = lastTableColumnRect(grid);
  const y = Number(clientY);
  if (
    !Number.isInteger(lastColumnIndex) ||
    !columnRect ||
    !Number.isFinite(y) ||
    y < columnRect.top ||
    y > columnRect.bottom
  ) {
    return null;
  }

  const matchedCell =
    cellAtPoint(grid, Math.max(columnRect.left, columnRect.right - 1), y) ??
    firstRow.find((item) => item.columnIndex === lastColumnIndex) ??
    null;

  return {
    table: true,
    rowIndex: matchedCell?.rowIndex ?? 0,
    columnIndex: lastColumnIndex,
    cell: matchedCell?.cell ?? null,
    cellRect: normalizedRect(matchedCell?.rect ?? matchedCell?.cell?.getBoundingClientRect?.()) ?? columnRect,
  };
}

export function sameTableHover(left, right) {
  return (
    left?.table === right?.table &&
    left?.block === right?.block &&
    left?.rowIndex === right?.rowIndex &&
    left?.columnIndex === right?.columnIndex &&
    left?.cell === right?.cell &&
    left?.edge === right?.edge &&
    left?.clientX === right?.clientX &&
    left?.clientY === right?.clientY
  );
}

export function hoverIsAtLastRow(hover, grid = []) {
  return Number.isInteger(hover?.rowIndex) && hover.rowIndex === grid.length - 1;
}

export function hoverIsAtLastColumn(hover, grid = []) {
  const lastColumn = firstRowCells(grid).at(-1)?.columnIndex;
  return Number.isInteger(hover?.columnIndex) && hover.columnIndex === lastColumn;
}

export function hoverIsNearBottomEdge(hover, clientY) {
  const rect = normalizedRect(hover?.cellRect ?? hover?.cell?.getBoundingClientRect?.());
  const y = Number(clientY);
  return rect && Number.isFinite(y) && rect.bottom - y <= EDGE_HOT_ZONE_PX;
}

export function hoverIsNearRightEdge(hover, clientX) {
  const rect = normalizedRect(hover?.cellRect ?? hover?.cell?.getBoundingClientRect?.());
  const x = Number(clientX);
  return rect && Number.isFinite(x) && rect.right - x <= EDGE_HOT_ZONE_PX;
}

export function hoverIsNearCellMenuEdge(hover, clientX, clientY = null) {
  const rect = normalizedRect(hover?.cellRect ?? hover?.cell?.getBoundingClientRect?.());
  const x = Number(clientX);
  const y = Number(clientY);
  if (!rect || !Number.isFinite(x) || rect.right - x > TABLE_CELL_MENU_EDGE_HOT_ZONE_PX) {
    return false;
  }

  if (!Number.isFinite(y)) return true;

  const centerY = rect.top + rect.height / 2;
  const centerZone = Math.max(
    8,
    Math.min(TABLE_CELL_MENU_CENTER_HOT_ZONE_PX, rect.height * 0.38),
  );
  return Math.abs(y - centerY) <= centerZone && x >= rect.right - TABLE_CELL_MENU_EDGE_HOT_ZONE_PX;
}

export function hoverIsNearTableBottom(tableRect, clientY) {
  const y = Number(clientY);
  return tableRect && Number.isFinite(y) && tableRect.bottom - y <= EDGE_HOT_ZONE_PX;
}

export function tableHoverWithIntent({
  target,
  table,
  grid,
  tableRect,
  clientX,
  clientY,
  rowHandleWidth = 18,
  columnHandleHeight = 18,
} = {}) {
  const normalizedTableRect = normalizedRect(tableRect);
  const x = Number(clientX);
  const y = Number(clientY);

  const insideLeftGutter =
    normalizedTableRect &&
    Number.isFinite(x) &&
    x >= normalizedTableRect.left - rowHandleWidth - 6 &&
    x <= normalizedTableRect.left - 1;
  const insideTopGutter =
    normalizedTableRect &&
    Number.isFinite(y) &&
    y >= normalizedTableRect.top - columnHandleHeight - 6 &&
    y <= normalizedTableRect.top - 1;
  const insideBottomRail =
    normalizedTableRect &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= normalizedTableRect.left &&
    x <= normalizedTableRect.right &&
    y >= normalizedTableRect.bottom + 1 &&
    y <= normalizedTableRect.bottom + 18;
  const insideRightRail =
    normalizedTableRect &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= normalizedTableRect.right + 1 &&
    x <= normalizedTableRect.right + 18 &&
    y >= normalizedTableRect.top &&
    y <= normalizedTableRect.bottom;

  let hover = tableHoverContext(target, table, grid);

  if (!hover) {
    if (insideLeftGutter) {
      hover = tableRowHoverContextAtY(table, grid, y);
    } else if (insideTopGutter) {
      hover = tableColumnHoverContextAtX(table, grid, x);
    } else if (insideBottomRail) {
      hover = tableLastRowHoverContextAtX(table, grid, x, y);
    } else if (insideRightRail) {
      hover = tableLastColumnHoverContextAtY(table, grid, y);
    }
  }

  if (!hover) return null;

  if (!hover.cell && insideLeftGutter) {
    hover = tableRowHoverContextAtY(table, grid, y) ?? hover;
  } else if (!hover.cell && insideTopGutter) {
    hover = tableColumnHoverContextAtX(table, grid, x) ?? hover;
  } else if (!hover.cell && insideBottomRail) {
    hover = tableLastRowHoverContextAtX(table, grid, x, y) ?? hover;
  } else if (!hover.cell && insideRightRail) {
    hover = tableLastColumnHoverContextAtY(table, grid, y) ?? hover;
  } else if (!hover.cell) {
    hover = tableHoverContextAtPoint(table, grid, x, y) ?? hover;
  }

  const cellRect = normalizedRect(hover.cellRect);
  hover.clientX = Number.isFinite(x) ? x : null;
  hover.clientY = Number.isFinite(y) ? y : null;
  hover.block = table;

  if (!cellRect) {
    hover.edge = "cell";
    return hover;
  }

  const wantsAddColumn = insideRightRail && hoverIsAtLastColumn(hover, grid);
  const wantsAddRow = insideBottomRail && hoverIsAtLastRow(hover, grid);

  if (wantsAddColumn && wantsAddRow) {
    hover.edge = (cellRect.right - x) <= (cellRect.bottom - y) ? "add-column" : "add-row";
  } else if (wantsAddColumn) {
    hover.edge = "add-column";
  } else if (wantsAddRow) {
    hover.edge = "add-row";
  } else if (
    insideLeftGutter &&
    hover.columnIndex === 0 &&
    !insideBottomRail
  ) {
    hover.edge = "row-handle";
  } else if (
    insideTopGutter &&
    hover.rowIndex === 0 &&
    !insideRightRail
  ) {
    hover.edge = "column-handle";
  } else {
    hover.edge = "cell";
  }

  return hover;
}
