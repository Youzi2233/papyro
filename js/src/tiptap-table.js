import {
  Table,
  TableKit,
  TableView,
  renderTableToMarkdown,
} from "@tiptap/extension-table";
import { Extension } from "@tiptap/core";
import {
  deleteCellSelection,
  selectedRect,
} from "@tiptap/pm/tables";
import { TableHandleExtension } from "./components/tiptap-node/table-node/extensions/table-handle/index.ts";

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

function currentSelectedTableRect(state) {
  try {
    return selectedRect(state);
  } catch (_error) {
    return null;
  }
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
    this.#mountOfficialTableContainers();
  }

  update(node) {
    const updated = super.update(node);
    if (updated) {
      this.#mountOfficialTableContainers();
    }
    return updated;
  }

  #mountOfficialTableContainers() {
    this.dom.dataset.contentType = "table";
    if (!this.dom.querySelector?.(":scope > .table-controls")) {
      const controls = document.createElement("div");
      controls.className = "table-controls";
      this.dom.appendChild(controls);
    }
    if (!this.dom.querySelector?.(":scope > .table-selection-overlay-container")) {
      const overlay = document.createElement("div");
      overlay.className = "table-selection-overlay-container";
      this.dom.appendChild(overlay);
    }
  }
}

export function createPapyroTableExtensions({ writeText = null } = {}) {
  return [
    PapyroTable.configure({
      resizable: true,
      handleWidth: 6,
      cellMinWidth: 96,
      lastColumnResizable: true,
      allowTableNodeSelection: false,
      View: PapyroTableView,
    }),
    TableKit.configure({
      table: false,
    }),
    TableHandleExtension,
    PapyroTableCellBackground,
    PapyroTableCellContentActions.configure({ writeText }),
  ];
}
