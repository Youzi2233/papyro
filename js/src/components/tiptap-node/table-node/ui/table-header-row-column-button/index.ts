"use client";
import { useCallback } from "react"
import { CellSelection, toggleHeader } from "@tiptap/pm/tables"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

// --- Lib ---
import {
  isExtensionAvailable,
  isValidPosition,
} from "@/lib/tiptap-utils"
import {
  getIndexCoordinates,
  getRowOrColumnCells,
  getTableSelectionType,
  selectCellsByCoords,
} from "@/components/tiptap-node/table-node/lib/tiptap-table-utils"

// --- Icons ---
import { TableHeaderRowIcon } from "@/components/tiptap-icons/table-header-row-icon"
import { TableHeaderColumnIcon } from "@/components/tiptap-icons/table-header-column-icon"

const REQUIRED_EXTENSIONS = ["table"]

export const tableHeaderRowColumnLabels = {
  row: "Header row",
  column: "Header column",
}

export const tableHeaderRowColumnIcons = {
  row: TableHeaderRowIcon,
  column: TableHeaderColumnIcon,
}

/**
 * Checks if a table header row/column toggle can be performed
 * in the current editor state (or at tablePos when no selection).
 */
function canToggleHeader(
  {
    editor,
    index,
    orientation,
    tablePos
  }
) {
  if (
    !editor ||
    !editor.isEditable ||
    !isExtensionAvailable(editor, REQUIRED_EXTENSIONS)
  ) {
    return false
  }

  const selectionType = getTableSelectionType(editor, index, orientation, tablePos)
  if (!selectionType) return false

  return selectionType.index === 0
}

/**
 * Executes the header row/column toggle. If there is no cell selection,
 * it will derive the target from (index, orientation) and the table at tablePos.
 */
function toggleTableHeader(
  {
    editor,
    index,
    orientation,
    tablePos
  }
) {
  if (!editor) return false
  if (!canToggleHeader({ editor, index, orientation, tablePos })) return false

  try {
    const selectionType = getTableSelectionType(editor, index, orientation, tablePos)
    if (!selectionType) return false

    const isRow = selectionType.orientation === "row"

    if (editor.state.selection instanceof CellSelection) {
      return isRow
        ? editor.commands.toggleHeaderRow()
        : editor.commands.toggleHeaderColumn();
    }

    if (!isValidPosition(tablePos)) return false

    const cellCoords = getIndexCoordinates({
      editor,
      index: selectionType.index,
      orientation: selectionType.orientation,
      tablePos,
    })
    if (!cellCoords) return false

    const stateWithCellSel = selectCellsByCoords(editor, tablePos, cellCoords, {
      mode: "state",
    })
    if (!stateWithCellSel) return false

    const dispatch = (tr) => editor.view.dispatch(tr)
    return isRow
      ? toggleHeader("row")(stateWithCellSel, dispatch)
      : toggleHeader("column")(stateWithCellSel, dispatch);
  } catch {
    return false
  }
}

/**
 * Determines if the header toggle button should be shown
 * based on editor state and config.
 */
function shouldShowButton(
  {
    editor,
    index,
    orientation,
    hideWhenUnavailable,
    tablePos
  }
) {
  if (!editor || !editor.isEditable) return false
  if (!isExtensionAvailable(editor, REQUIRED_EXTENSIONS)) return false

  if (hideWhenUnavailable) {
    return canToggleHeader({ editor, index, orientation, tablePos });
  }

  const selectionType = getTableSelectionType(editor, index, orientation)
  return Boolean(selectionType);
}

/**
 * Custom hook that provides **table header row/column toggle**
 * functionality for the Tiptap editor. Supports `tablePos` when
 * no cell is selected.
 */
export function useTableHeaderRowColumn(config) {
  const {
    editor: providedEditor,
    index,
    orientation,
    tablePos,
    hideWhenUnavailable = false,
    onToggled,
  } = config

  const { editor } = useTiptapEditor(providedEditor)

  const selectionType = getTableSelectionType(editor, index, orientation)

  const isVisible = shouldShowButton({
    editor,
    index,
    orientation,
    hideWhenUnavailable,
    tablePos,
  })

  const canPerformToggle = canToggleHeader({
    editor,
    index,
    orientation,
    tablePos,
  })

  let isActive = false
  if (editor?.state.selection instanceof CellSelection) {
    isActive = editor?.isActive("tableHeader") || false
  } else {
    const rowsOrCols = getRowOrColumnCells(editor, index, selectionType?.orientation, tablePos)

    if (rowsOrCols) {
      const secondIndex = rowsOrCols.cells.length > 1 ? 1 : 0
      isActive =
        rowsOrCols.cells[secondIndex]?.node?.type.name === "tableHeader" ||
        false
    }
  }

  const handleToggle = useCallback(() => {
    const success = toggleTableHeader({ editor, index, orientation, tablePos })
    if (success) onToggled?.()
    return success
  }, [editor, index, orientation, tablePos, onToggled])

  const label = tableHeaderRowColumnLabels[selectionType?.orientation || "row"]
  const Icon = tableHeaderRowColumnIcons[selectionType?.orientation || "row"]

  return {
    isVisible,
    canToggleHeader: canPerformToggle,
    handleToggle,
    label,
    Icon,
    isActive,
  }
}
