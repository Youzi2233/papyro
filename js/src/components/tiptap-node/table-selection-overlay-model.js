export const PAPYRO_TABLE_SELECTED_CELL_CLASS = "mn-tiptap-table-cell-selected";

export const TABLE_SELECTION_OVERLAY_MODE = Object.freeze({
  HIDDEN: "hidden",
  CELL_SELECTION: "cell-selection",
  VISUAL_CELL_SELECTION: "visual-cell-selection",
});

export function findPapyroSelectedTableCell(tableDom) {
  if (!tableDom) return null;

  try {
    return tableDom.querySelector?.(`.${PAPYRO_TABLE_SELECTED_CELL_CLASS}`) ?? null;
  } catch (_error) {
    return null;
  }
}

export function tableSelectionOverlayMode({
  selection = null,
  CellSelectionClass = null,
  tableDom = null,
} = {}) {
  if (
    typeof CellSelectionClass === "function" &&
    selection instanceof CellSelectionClass
  ) {
    return TABLE_SELECTION_OVERLAY_MODE.CELL_SELECTION;
  }

  if (findPapyroSelectedTableCell(tableDom)) {
    return TABLE_SELECTION_OVERLAY_MODE.VISUAL_CELL_SELECTION;
  }

  return TABLE_SELECTION_OVERLAY_MODE.HIDDEN;
}
