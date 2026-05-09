import {
  Table,
  TableKit,
  TableView,
  renderTableToMarkdown,
} from "@tiptap/extension-table";
import { Extension } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import {
  CellSelection,
  TableMap,
  deleteCellSelection,
  moveTableColumn,
  moveTableRow,
  selectedRect,
} from "@tiptap/pm/tables";

export const PAPYRO_TABLE_CELL_RESET_ATTRS = Object.freeze([
  "align",
  "backgroundColor",
]);

function escapeHtmlAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeCellAlign(value) {
  const align = String(value ?? "").trim().toLowerCase();
  return align === "left" || align === "center" || align === "right" ? align : null;
}

function tableCellNodes(rowNode) {
  return Array.isArray(rowNode?.content) ? rowNode.content : [];
}

function isDefaultSpan(value) {
  return value === null || value === undefined || value === 1;
}

function hasColumnWidth(cellNode) {
  return Array.isArray(cellNode?.attrs?.colwidth) &&
    cellNode.attrs.colwidth.some((width) => Number.isFinite(Number(width)));
}

function tableNeedsHtmlMarkdown(node) {
  const rows = Array.isArray(node?.content) ? node.content : [];
  if (rows.length === 0) return false;

  const firstRowCells = tableCellNodes(rows[0]);
  const firstRowIsHeader = firstRowCells.length > 0 &&
    firstRowCells.every((cell) => cell?.type === "tableHeader");
  if (!firstRowIsHeader) return true;

  const columnAlignments = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const cells = tableCellNodes(rows[rowIndex]);
    for (let columnIndex = 0; columnIndex < cells.length; columnIndex += 1) {
      const cell = cells[columnIndex];
      const attrs = cell?.attrs ?? {};
      const isHeader = cell?.type === "tableHeader";

      if (rowIndex > 0 && isHeader) return true;
      if (!isDefaultSpan(attrs.colspan) || !isDefaultSpan(attrs.rowspan)) return true;
      if (hasColumnWidth(cell)) return true;
      if (attrs.backgroundColor) return true;

      const align = normalizeCellAlign(attrs.align);
      if (columnAlignments[columnIndex] === undefined) {
        columnAlignments[columnIndex] = align;
      } else if (columnAlignments[columnIndex] !== align) {
        return true;
      }
    }
  }

  return false;
}

function htmlAttributes(attributes) {
  const rendered = Object.entries(attributes)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([name, value]) => `${name}="${escapeHtmlAttribute(value)}"`);
  return rendered.length > 0 ? ` ${rendered.join(" ")}` : "";
}

function renderHtmlTableCell(cellNode, helpers) {
  const attrs = cellNode?.attrs ?? {};
  const tag = cellNode?.type === "tableHeader" ? "th" : "td";
  const style = [];
  const align = normalizeCellAlign(attrs.align);
  const backgroundColor = attrs.backgroundColor ?? null;
  const htmlAttrs = {};

  if (align) style.push(`text-align: ${align}`);
  if (backgroundColor) {
    style.push(`background-color: ${backgroundColor}`);
    htmlAttrs["data-cell-background"] = backgroundColor;
  }
  if (!isDefaultSpan(attrs.colspan)) htmlAttrs.colspan = attrs.colspan;
  if (!isDefaultSpan(attrs.rowspan)) htmlAttrs.rowspan = attrs.rowspan;
  if (hasColumnWidth(cellNode)) htmlAttrs.colwidth = attrs.colwidth.join(",");
  if (style.length > 0) htmlAttrs.style = style.join("; ");

  const content = Array.isArray(cellNode?.content)
    ? helpers.renderChildren(cellNode.content, "<br>")
    : "";
  return `<${tag}${htmlAttributes(htmlAttrs)}>${content}</${tag}>`;
}

function renderHtmlTableMarkdown(node, helpers) {
  const rows = Array.isArray(node?.content) ? node.content : [];
  const body = rows
    .map((rowNode) =>
      `<tr>${tableCellNodes(rowNode)
        .map((cellNode) => renderHtmlTableCell(cellNode, helpers))
        .join("")}</tr>`,
    )
    .join("");
  return `<table><tbody>${body}</tbody></table>`;
}

function parseCellBackgroundColor(element) {
  return (
    element.getAttribute("data-cell-background") ||
    element.style.backgroundColor ||
    null
  );
}

function renderCellBackgroundColor(attributes) {
  if (!attributes.backgroundColor) return {};
  return {
    "data-cell-background": attributes.backgroundColor,
    style: `background-color: ${attributes.backgroundColor}`,
  };
}

function createPapyroCellAttributes() {
  return {
    backgroundColor: {
      default: null,
      parseHTML: parseCellBackgroundColor,
      renderHTML: renderCellBackgroundColor,
    },
  };
}

function resetTableCellAttrs(attrs, names = PAPYRO_TABLE_CELL_RESET_ATTRS) {
  const nextAttrs = { ...(attrs ?? {}) };
  let changed = false;

  names.forEach((name) => {
    if (nextAttrs[name] !== null && nextAttrs[name] !== undefined) {
      nextAttrs[name] = null;
      changed = true;
    }
  });

  return changed ? nextAttrs : null;
}

function isTextNode(node) {
  return node?.isText === true || node?.type?.name === "text" || node?.type === "text";
}

function clipboardApi() {
  if (typeof globalThis === "undefined") return null;
  return globalThis.navigator?.clipboard ?? null;
}

function tableCellClipboardText(cell) {
  if (!cell) return "";
  const text =
    typeof cell.textBetween === "function"
      ? cell.textBetween(0, cell.content?.size ?? cell.nodeSize ?? 0, "\n", "\n")
      : cell.textContent ?? "";
  return String(text ?? "")
    .replace(/\t/g, " ")
    .replace(/\r?\n/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

function tableSortText(cell) {
  return tableCellClipboardText(cell).toLocaleLowerCase();
}

function compareTableSortEntries(left, right, direction = "asc") {
  const leftEmpty = left.value.length === 0;
  const rightEmpty = right.value.length === 0;
  if (leftEmpty || rightEmpty) {
    if (leftEmpty && rightEmpty) return left.index - right.index;
    return leftEmpty ? 1 : -1;
  }

  const compared = left.value.localeCompare(right.value, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (compared !== 0) {
    return direction === "desc" ? -compared : compared;
  }
  return left.index - right.index;
}

function currentSelectedTableRect(state) {
  try {
    return selectedRect(state);
  } catch (_error) {
    return null;
  }
}

export function moveSelectedTableAxis(state, dispatch, axis, direction) {
  const rect = currentSelectedTableRect(state);
  const normalizedDirection = String(direction ?? "").toLowerCase();
  if (!["up", "down", "left", "right"].includes(normalizedDirection)) return false;
  const delta = normalizedDirection === "up" || normalizedDirection === "left" ? -1 : 1;
  if (!rect?.map) return false;

  if (axis === "row") {
    if (delta < 0 && rect.top <= 0) return false;
    if (delta > 0 && rect.bottom >= rect.map.height) return false;
    const from = delta < 0 ? rect.top : rect.bottom - 1;
    const to = delta < 0 ? rect.top - 1 : rect.bottom;
    return moveTableRow({ from, to, select: true })(state, dispatch);
  }

  if (axis === "column") {
    if (delta < 0 && rect.left <= 0) return false;
    if (delta > 0 && rect.right >= rect.map.width) return false;
    const from = delta < 0 ? rect.left : rect.right - 1;
    const to = delta < 0 ? rect.left - 1 : rect.right;
    return moveTableColumn({ from, to, select: true })(state, dispatch);
  }

  return false;
}

function tableHasSpanningCells(table) {
  let spanning = false;
  table?.descendants?.((node) => {
    const typeName = String(node?.type?.name ?? "");
    if (typeName !== "tableCell" && typeName !== "tableHeader") return true;

    const attrs = node?.attrs ?? {};
    if (!isDefaultSpan(attrs.colspan) || !isDefaultSpan(attrs.rowspan)) {
      spanning = true;
      return false;
    }

    return true;
  });
  return spanning;
}

function tableRowInsertPosition(table, tableStart, rowIndex) {
  let position = tableStart;
  for (let index = 0; index < rowIndex; index += 1) {
    position += table.child(index).nodeSize;
  }
  return position;
}

function tableCellInsertPosition(table, tableStart, rowIndex, columnIndex) {
  const row = table.child(rowIndex);
  let position = tableRowInsertPosition(table, tableStart, rowIndex) + 1;
  for (let index = 0; index < columnIndex; index += 1) {
    position += row.child(index).nodeSize;
  }
  return position;
}

function dispatchChangedTransaction(tr, dispatch) {
  if (!tr?.docChanged) return false;
  const nextTr = typeof tr.scrollIntoView === "function" ? tr.scrollIntoView() : tr;
  dispatch(nextTr);
  return true;
}

function selectRegularTableRect(tr, tableStart, map, rect, axis) {
  const anchor =
    axis === "row"
      ? tableStart + map.map[rect.top * map.width]
      : tableStart + map.map[rect.left];
  const head =
    axis === "row"
      ? tableStart + map.map[(rect.bottom - 1) * map.width + map.width - 1]
      : tableStart + map.map[(map.height - 1) * map.width + rect.right - 1];
  if (!Number.isFinite(anchor) || !Number.isFinite(head)) return false;

  tr.setSelection(
    axis === "row"
      ? CellSelection.rowSelection(tr.doc.resolve(anchor), tr.doc.resolve(head))
      : CellSelection.colSelection(tr.doc.resolve(anchor), tr.doc.resolve(head)),
  );
  return true;
}

export function duplicateSelectedTableRows(state, dispatch) {
  const rect = currentSelectedTableRect(state);
  const table = rect?.table;
  if (!table || !rect?.map || rect.left !== 0 || rect.right !== rect.map.width) {
    return false;
  }
  if (rect.top < 0 || rect.bottom <= rect.top || rect.bottom > table.childCount) {
    return false;
  }
  if (tableHasSpanningCells(table)) return false;
  if (!dispatch) return true;

  const insertPos = tableRowInsertPosition(table, rect.tableStart, rect.bottom);
  const tr = state.tr;
  for (let rowIndex = rect.bottom - 1; rowIndex >= rect.top; rowIndex -= 1) {
    const row = table.child(rowIndex);
    tr.insert(insertPos, row.copy(row.content));
  }
  selectRegularTableRect(
    tr,
    rect.tableStart,
    rect.map,
    {
      ...rect,
      top: rect.bottom,
      bottom: rect.bottom + (rect.bottom - rect.top),
    },
    "row",
  );
  return dispatchChangedTransaction(tr, dispatch);
}

export function duplicateSelectedTableColumns(state, dispatch) {
  const rect = currentSelectedTableRect(state);
  const table = rect?.table;
  if (!table || !rect?.map || rect.top !== 0 || rect.bottom !== rect.map.height) {
    return false;
  }
  if (rect.left < 0 || rect.right <= rect.left || rect.right > rect.map.width) {
    return false;
  }
  if (tableHasSpanningCells(table)) return false;
  if (!dispatch) return true;

  const tr = state.tr;
  for (let rowIndex = table.childCount - 1; rowIndex >= 0; rowIndex -= 1) {
    const row = table.child(rowIndex);
    if (rect.right > row.childCount) return false;
    const insertPos = tableCellInsertPosition(table, rect.tableStart, rowIndex, rect.right);
    for (let columnIndex = rect.right - 1; columnIndex >= rect.left; columnIndex -= 1) {
      const cell = row.child(columnIndex);
      tr.insert(insertPos, cell.copy(cell.content));
    }
  }
  selectRegularTableRect(
    tr,
    rect.tableStart,
    rect.map,
    {
      ...rect,
      left: rect.right,
      right: rect.right + (rect.right - rect.left),
    },
    "column",
  );
  return dispatchChangedTransaction(tr, dispatch);
}

function isHeaderRow(table, rowIndex) {
  const row = table?.child?.(rowIndex);
  if (!row || row.childCount === 0) return false;
  for (let columnIndex = 0; columnIndex < row.childCount; columnIndex += 1) {
    if (row.child(columnIndex)?.type?.name !== "tableHeader") return false;
  }
  return true;
}

function isHeaderColumn(table, columnIndex) {
  if (!table || table.childCount === 0) return false;
  for (let rowIndex = 0; rowIndex < table.childCount; rowIndex += 1) {
    const row = table.child(rowIndex);
    if (!row?.child || columnIndex >= row.childCount) return false;
    if (row.child(columnIndex)?.type?.name !== "tableHeader") return false;
  }
  return true;
}

function normalizedSortDirection(direction) {
  return String(direction ?? "").toLowerCase() === "desc" ? "desc" : "asc";
}

export function sortSelectedTableRows(state, dispatch, direction = "asc") {
  const rect = currentSelectedTableRect(state);
  const table = rect?.table;
  if (!table || !rect?.map || rect.top !== 0 || rect.bottom !== rect.map.height) {
    return false;
  }
  if (tableHasSpanningCells(table)) return false;

  const sortColumn = rect.left;
  if (!Number.isInteger(sortColumn) || sortColumn < 0 || sortColumn >= rect.map.width) {
    return false;
  }

  const fixedHeaderRows = isHeaderRow(table, 0) ? 1 : 0;
  const sortable = [];
  for (let rowIndex = fixedHeaderRows; rowIndex < table.childCount; rowIndex += 1) {
    const row = table.child(rowIndex);
    if (sortColumn >= row.childCount) return false;
    sortable.push({
      index: rowIndex,
      node: row,
      value: tableSortText(row.child(sortColumn)),
    });
  }
  if (sortable.length < 2) return true;

  const sorted = [...sortable].sort((left, right) =>
    compareTableSortEntries(left, right, normalizedSortDirection(direction)),
  );
  if (!dispatch) return true;

  const rows = [];
  for (let rowIndex = 0; rowIndex < fixedHeaderRows; rowIndex += 1) {
    rows.push(table.child(rowIndex));
  }
  rows.push(...sorted.map((entry) => entry.node));

  const nextTable = table.copy(Fragment.fromArray(rows));
  const tr = state.tr;
  const tablePos = rect.tableStart - 1;
  tr.replaceWith(tablePos, tablePos + table.nodeSize, nextTable);
  const nextMap = TableMap.get(nextTable);
  selectRegularTableRect(tr, rect.tableStart, nextMap, {
    ...rect,
    top: 0,
    bottom: nextMap.height,
  }, "column");
  dispatch(tr.scrollIntoView());
  return true;
}

export function sortSelectedTableColumns(state, dispatch, direction = "asc") {
  const rect = currentSelectedTableRect(state);
  const table = rect?.table;
  if (!table || !rect?.map || rect.left !== 0 || rect.right !== rect.map.width) {
    return false;
  }
  if (tableHasSpanningCells(table)) return false;

  const sortRow = rect.top;
  if (!Number.isInteger(sortRow) || sortRow < 0 || sortRow >= table.childCount) {
    return false;
  }
  const sourceRow = table.child(sortRow);
  const fixedHeaderColumns = isHeaderColumn(table, 0) ? 1 : 0;
  const sortable = [];
  for (let columnIndex = fixedHeaderColumns; columnIndex < rect.map.width; columnIndex += 1) {
    if (columnIndex >= sourceRow.childCount) return false;
    sortable.push({
      index: columnIndex,
      value: tableSortText(sourceRow.child(columnIndex)),
    });
  }
  if (sortable.length < 2) return true;

  const sorted = [...sortable].sort((left, right) =>
    compareTableSortEntries(left, right, normalizedSortDirection(direction)),
  );
  const columnOrder = [
    ...Array.from({ length: fixedHeaderColumns }, (_, index) => index),
    ...sorted.map((entry) => entry.index),
  ];
  if (!dispatch) return true;

  const nextRows = [];
  for (let rowIndex = 0; rowIndex < table.childCount; rowIndex += 1) {
    const row = table.child(rowIndex);
    if (columnOrder.some((columnIndex) => columnIndex >= row.childCount)) return false;
    nextRows.push(row.copy(Fragment.fromArray(columnOrder.map((columnIndex) => row.child(columnIndex)))));
  }

  const nextTable = table.copy(Fragment.fromArray(nextRows));
  const tr = state.tr;
  const tablePos = rect.tableStart - 1;
  tr.replaceWith(tablePos, tablePos + table.nodeSize, nextTable);
  const nextMap = TableMap.get(nextTable);
  selectRegularTableRect(tr, rect.tableStart, nextMap, {
    ...rect,
    left: 0,
    right: nextMap.width,
  }, "row");
  dispatch(tr.scrollIntoView());
  return true;
}

function selectedTableCellTextRanges(selection) {
  if (typeof selection?.forEachCell !== "function") return [];

  const ranges = [];
  selection.forEachCell((cell, cellPos) => {
    if (!cell || !Number.isFinite(cellPos)) return;
    if (isTextNode(cell)) {
      ranges.push({ from: cellPos, to: cellPos + Math.max(0, cell.nodeSize ?? 0) });
      return;
    }

    cell.descendants?.((node, offset) => {
      if (!isTextNode(node)) return true;

      const from = cellPos + 1 + offset;
      const to = from + Math.max(0, node.nodeSize ?? node.text?.length ?? 0);
      if (to > from) {
        ranges.push({ from, to });
      }
      return false;
    });
  });

  return ranges;
}

export function selectedTableCellsPlainText(state) {
  const rect = currentSelectedTableRect(state);

  const table = rect?.table;
  const map = rect?.map;
  if (!table || !map || !Number.isInteger(map.width) || map.width <= 0) {
    return "";
  }

  const used = new Set();
  const rows = [];
  for (let row = rect.top; row < rect.bottom; row += 1) {
    const cells = [];
    for (let column = rect.left; column < rect.right; column += 1) {
      const relativePos = map.map[row * map.width + column];
      if (!Number.isFinite(relativePos) || used.has(relativePos)) {
        cells.push("");
        continue;
      }

      let cellRect = null;
      try {
        cellRect = map.findCell(relativePos);
      } catch (_error) {
        cells.push("");
        continue;
      }

      if (cellRect.top !== row || cellRect.left !== column) {
        cells.push("");
        continue;
      }

      used.add(relativePos);
      cells.push(tableCellClipboardText(table.nodeAt(relativePos)));
    }
    rows.push(cells.join("\t"));
  }

  return rows.join("\n");
}

export async function writeTableTextToClipboard(text, writeText = null) {
  const value = String(text ?? "");
  if (!value) return false;
  const clipboard = clipboardApi();
  const writer =
    typeof writeText === "function" ? writeText : clipboard?.writeText?.bind?.(clipboard);
  if (typeof writer !== "function") return false;
  await writer(value);
  return true;
}

export function resetSelectedTableCellAttrs(selection, tr, names = PAPYRO_TABLE_CELL_RESET_ATTRS) {
  if (typeof selection?.forEachCell !== "function" || !tr) return false;

  let changed = false;
  selection.forEachCell((node, pos) => {
    const nextAttrs = resetTableCellAttrs(node?.attrs, names);
    if (!nextAttrs) return;
    const mappedPos = typeof tr.mapping?.map === "function" ? tr.mapping.map(pos) : pos;
    tr.setNodeMarkup(mappedPos, null, nextAttrs);
    changed = true;
  });
  return changed;
}

export function setSelectedTableCellTextColor(selection, tr, markType, color = null) {
  if (typeof selection?.forEachCell !== "function" || !tr || !markType) return false;

  const ranges = selectedTableCellTextRanges(selection);
  ranges.forEach(({ from, to }) => {
    tr.removeMark(from, to, markType);
    if (color) {
      tr.addMark(from, to, markType.create({ color }));
    }
  });

  return ranges.length > 0;
}

export const PapyroTableCellBackground = Extension.create({
  name: "papyroTableCellBackground",

  addGlobalAttributes() {
    return [
      {
        types: ["tableCell", "tableHeader"],
        attributes: createPapyroCellAttributes(),
      },
    ];
  },
});

export const PapyroTableCellContentActions = Extension.create({
  name: "papyroTableCellContentActions",

  addOptions() {
    return {
      writeText: null,
    };
  },

  addCommands() {
    return {
      clearSelectedTableCells:
        (options = {}) =>
        ({ state, dispatch }) => {
          const resetAttrs = Boolean(options?.resetAttrs);
          if (!resetAttrs) return deleteCellSelection(state, dispatch);
          if (!deleteCellSelection(state)) return false;
          if (!dispatch) return true;

          let clearTransaction = null;
          deleteCellSelection(state, (tr) => {
            clearTransaction = tr;
          });
          const tr = clearTransaction ?? state.tr;
          resetSelectedTableCellAttrs(state.selection, tr);
          if (tr.docChanged) dispatch(tr);
          return true;
        },
      resetSelectedTableCellAttrs:
        () =>
        ({ state, dispatch }) => {
          if (typeof state?.selection?.forEachCell !== "function") return false;
          if (!dispatch) return true;

          const markType = state.schema?.marks?.textStyle ?? null;
          const tr = state.tr;
          resetSelectedTableCellAttrs(state.selection, tr);
          setSelectedTableCellTextColor(state.selection, tr, markType, null);
          if (tr.docChanged) dispatch(tr);
          return true;
        },
      setSelectedTableCellTextColor:
        (color = null) =>
        ({ state, dispatch }) => {
          if (typeof state?.selection?.forEachCell !== "function") return false;
          const markType = state.schema?.marks?.textStyle ?? null;
          if (!markType) return false;
          if (dispatch) {
            const tr = state.tr;
            setSelectedTableCellTextColor(state.selection, tr, markType, color);
            if (tr.docChanged) dispatch(tr);
          }
          return true;
        },
      copySelectedTableCells:
        () =>
        ({ state, dispatch }) => {
          const text = selectedTableCellsPlainText(state);
          if (!text) return false;
          if (!dispatch) return true;
          writeTableTextToClipboard(text, this.options.writeText).catch(() => {});
          return true;
        },
      moveSelectedTableRow:
        (direction) =>
        ({ state, dispatch }) =>
          moveSelectedTableAxis(state, dispatch, "row", direction),
      moveSelectedTableColumn:
        (direction) =>
        ({ state, dispatch }) =>
          moveSelectedTableAxis(state, dispatch, "column", direction),
      duplicateSelectedTableRow:
        () =>
        ({ state, dispatch }) =>
          duplicateSelectedTableRows(state, dispatch),
      duplicateSelectedTableColumn:
        () =>
        ({ state, dispatch }) =>
          duplicateSelectedTableColumns(state, dispatch),
      sortSelectedTableRows:
        (direction = "asc") =>
        ({ state, dispatch }) =>
          sortSelectedTableRows(state, dispatch, direction),
      sortSelectedTableColumns:
        (direction = "asc") =>
        ({ state, dispatch }) =>
          sortSelectedTableColumns(state, dispatch, direction),
    };
  },
});

export const PapyroTable = Table.extend({
  renderMarkdown: (node, helpers) =>
    tableNeedsHtmlMarkdown(node)
      ? renderHtmlTableMarkdown(node, helpers)
      : renderTableToMarkdown(node, helpers),
});

class PapyroTableView extends TableView {
  constructor(node, cellMinWidth, view) {
    super(node, cellMinWidth, view);
    this.#syncPapyroTableClass();
  }

  update(node) {
    const updated = super.update(node);
    if (updated) this.#syncPapyroTableClass();
    return updated;
  }

  #syncPapyroTableClass() {
    this.table?.classList?.add?.("mn-tiptap-table");
  }
}

export function createPapyroTableExtensions({ writeText = null } = {}) {
  return [
    PapyroTable.configure({
      HTMLAttributes: {
        class: "mn-tiptap-table",
      },
      resizable: true,
      handleWidth: 6,
      cellMinWidth: 96,
      lastColumnResizable: true,
      allowTableNodeSelection: false,
      View: PapyroTableView,
    }),
    TableKit.configure({
      table: false,
      tableRow: {
        HTMLAttributes: {
          class: "mn-tiptap-table-row",
        },
      },
      tableHeader: {
        HTMLAttributes: {
          class: "mn-tiptap-table-header",
        },
      },
      tableCell: {
        HTMLAttributes: {
          class: "mn-tiptap-table-cell",
        },
      },
    }),
    PapyroTableCellBackground,
    PapyroTableCellContentActions.configure({ writeText }),
  ];
}
