import { useCallback } from "react"
import {
  addRowBefore,
  addRowAfter,
  addColumnBefore,
  addColumnAfter,
  CellSelection,
  rowIsHeader,
  columnIsHeader,
} from "@tiptap/pm/tables"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

// --- Lib ---
import { isExtensionAvailable } from "@/lib/tiptap-utils"
import {
  getTable,
  getTableSelectionType,
  selectCellsByCoords,
  updateSelectionAfterAction,
} from "@/components/tiptap-node/table-node/lib/tiptap-table-utils"

// --- Icons ---
import { AddColLeftIcon } from "@/components/tiptap-icons/add-col-left-icon"
import { AddColRightIcon } from "@/components/tiptap-icons/add-col-right-icon"
import { AddRowBottomIcon } from "@/components/tiptap-icons/add-row-bottom-icon"
import { AddRowTopIcon } from "@/components/tiptap-icons/add-row-top-icon"

const REQUIRED_EXTENSIONS = ["table"]

export const tableAddRowColumnLabels = {
  row: {
    above: "Insert row above",
    below: "Insert row below"
  },

  column: {
    left: "Insert column left",
    right: "Insert column right"
  }
}

function safeColumnIsHeader(map, node, index) {
  try {
    return columnIsHeader(map, node, index);
  } catch {
    return false
  }
}

function safeRowIsHeader(map, node, index) {
  try {
    return rowIsHeader(map, node, index);
  } catch {
    return false
  }
}

/**
 * Checks if a table row/column addition can be performed
 * in the current editor state.
 */
function canAddRowColumn(
  {
    editor,
    index,
    orientation,
    tablePos,
    side
  }
) {
  if (
    !editor ||
    !editor.isEditable ||
    !isExtensionAvailable(editor, REQUIRED_EXTENSIONS)
  ) {
    return false
  }

  const table = getTable(editor, tablePos)
  if (!table) return false

  const selectionType = getTableSelectionType(editor, index, orientation)
  if (!selectionType) return false

  const { map, node } = table
  const selIndex = selectionType.index
  const selOrient = selectionType.orientation

  // Bounds check
  if (typeof selIndex !== "number" || selIndex < 0) return false
  if (selOrient === "column" && selIndex >= map.width) return false
  if (selOrient === "row" && selIndex >= map.height) return false

  // Block inserting to the LEFT of a header column
  if (side === "left" && selOrient === "column") {
    if (safeColumnIsHeader(map, node, selIndex)) return false
  }

  // Block inserting ABOVE a header row
  if (side === "above" && selOrient === "row") {
    if (safeRowIsHeader(map, node, selIndex)) return false
  }

  return true
}

/**
 * Calculates the index of the newly added row or column.
 */
function calculateNewIndex(index, orientation, side) {
  if (orientation === "row") {
    // For rows: above means the new row is at the same index (pushes original down)
    // below means the new row is at index + 1
    return side === "above" ? index : index + 1
  } else {
    // For columns: left means the new column is at the same index (pushes original right)
    // right means the new column is at index + 1
    return side === "left" ? index : index + 1
  }
}

/**
 * Executes the row/column addition in the editor.
 */
function tableAddRowColumn(
  {
    editor,
    index,
    orientation,
    side,
    tablePos
  }
) {
  if (
    !canAddRowColumn({ editor, index, orientation, tablePos, side }) ||
    !editor
  ) {
    return false
  }

  const selectionType = getTableSelectionType(editor, index, orientation)
  if (!selectionType) return false

  const { orientation: finalOrientation, index: finalIndex } = selectionType

  const isRow = finalOrientation === "row"
  const dispatch = (tr) => editor.view.dispatch(tr)
  const addOperation = isRow
    ? side === "above"
      ? addRowBefore
      : addRowAfter
    : side === "left"
      ? addColumnBefore
      : addColumnAfter

  try {
    let success = false

    if (editor.state.selection instanceof CellSelection) {
      success = addOperation(editor.state, dispatch)
    } else {
      const table = getTable(editor, tablePos)
      if (!table) return false

      const cellCoords =
        finalOrientation === "row"
          ? { row: finalIndex, col: 0 }
          : { row: 0, col: finalIndex }

      const cellState = selectCellsByCoords(editor, table.pos, [cellCoords], {
        mode: "state",
      })

      if (!cellState) return false

      success = addOperation(cellState, dispatch)
    }

    if (success) {
      const newIndex = calculateNewIndex(finalIndex, finalOrientation, side)
      updateSelectionAfterAction(editor, finalOrientation, newIndex, tablePos)
    }

    return success
  } catch (error) {
    console.error("Error adding row/column:", error)
    return false
  }
}

/**
 * Determines if the add button should be shown
 * based on editor state and config.
 */
function shouldShowButton(
  {
    editor,
    index,
    orientation,
    tablePos,
    side,
    hideWhenUnavailable
  }
) {
  if (!editor || !editor.isEditable) return false
  if (!isExtensionAvailable(editor, REQUIRED_EXTENSIONS)) return false

  if (hideWhenUnavailable) {
    return canAddRowColumn({ editor, index, orientation, tablePos, side });
  }

  const selectionType = getTableSelectionType(editor, index, orientation)
  return Boolean(selectionType);
}

/**
 * Custom hook that provides **table row/column addition**
 * functionality for the Tiptap editor.
 */
export function useTableAddRowColumn(config) {
  const {
    editor: providedEditor,
    index,
    orientation,
    side,
    tablePos,
    hideWhenUnavailable = false,
    onAdded,
  } = config

  const { editor } = useTiptapEditor(providedEditor)

  const selectionType = getTableSelectionType(editor, index, orientation)

  const isVisible = shouldShowButton({
    editor,
    index,
    orientation,
    tablePos,
    side,
    hideWhenUnavailable,
  })

  const canPerformAdd = canAddRowColumn({
    editor,
    index,
    orientation,
    tablePos,
    side,
  })

  const handleAdd = useCallback(() => {
    const success = tableAddRowColumn({
      editor,
      index,
      orientation,
      tablePos,
      side,
    })
    if (success) onAdded?.()
    return success
  }, [editor, index, orientation, tablePos, side, onAdded])

  const label =
    selectionType?.orientation === "row"
      ? tableAddRowColumnLabels.row[side]
      : tableAddRowColumnLabels.column[side]

  const Icon =
    selectionType?.orientation === "row"
      ? side === "above"
        ? AddRowTopIcon
        : AddRowBottomIcon
      : side === "left"
        ? AddColLeftIcon
        : AddColRightIcon

  return {
    isVisible,
    canAddRowColumn: canPerformAdd,
    handleAdd,
    label,
    Icon,
  }
}
