import { TableKit } from "@tiptap/extension-table";
import { Extension } from "@tiptap/core";
import {
  deleteCellSelection,
  moveTableColumn,
  moveTableRow,
  selectedRect,
} from "@tiptap/pm/tables";

export const PAPYRO_TABLE_CELL_RESET_ATTRS = Object.freeze([
  "align",
  "backgroundColor",
]);

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
    };
  },
});

export function createPapyroTableExtensions({ writeText = null } = {}) {
  return [
    TableKit.configure({
      table: {
        HTMLAttributes: {
          class: "mn-tiptap-table",
        },
        resizable: true,
        handleWidth: 6,
        cellMinWidth: 96,
        lastColumnResizable: true,
        allowTableNodeSelection: false,
      },
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
