import { useCallback, useMemo } from "react"
import { addColumnAfter, addRowAfter, CellSelection } from "@tiptap/pm/tables"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

// --- Lib ---
import { isExtensionAvailable } from "@/lib/tiptap-utils"
import {
  getTable,
  getTableSelectionType,
  getRowOrColumnCells,
  updateSelectionAfterAction,
  selectCellsByCoords,
  getIndexCoordinates,
} from "@/components/tiptap-node/table-node/lib/tiptap-table-utils"

// --- Icons ---
import { CopyIcon } from "@/components/tiptap-icons/copy-icon"

const REQUIRED_EXTENSIONS = ["tableHandleExtension"]

export const tableDuplicateRowColumnLabels = {
  row: "Duplicate row",
  column: "Duplicate column",
}

/**
 * Checks if a table row/column duplication can be performed
 * in the current editor state.
 */
function canDuplicateRowColumn(
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

  try {
    const table = getTable(editor, tablePos)
    if (!table) return false

    const cellData = getRowOrColumnCells(editor, index, orientation, tablePos)

    if (cellData.mergedCells.length > 0) {
      return false
    }

    return cellData.cells.length > 0
  } catch {
    return false
  }
}

/**
 * Duplicates a row by using addRowAfter and then replacing the content.
 */
function duplicateRow(
  {
    editor,
    index,
    tablePos
  }
) {
  try {
    const originalRowCells = getRowOrColumnCells(editor, index, "row", tablePos)

    if (originalRowCells.cells.length === 0) {
      return false
    }

    let addSuccess = false
    if (editor.state.selection instanceof CellSelection) {
      addSuccess = editor.chain().focus().addRowAfter().run()
    } else {
      if (!tablePos) return false
      const sourceCoords = getIndexCoordinates({
        editor,
        index,
        orientation: "row",
        tablePos,
      })
      if (!sourceCoords) return false

      const state = selectCellsByCoords(editor, tablePos, sourceCoords, {
        mode: "state",
      })
      addSuccess = addRowAfter(state, editor.view.dispatch)
    }

    if (!addSuccess) return false

    const newRowCells = getRowOrColumnCells(editor, index + 1, "row", tablePos)

    if (newRowCells.cells.length === 0) {
      return false
    }

    const { state, view } = editor
    const tr = state.tr

    // Replace each cell in the new row with duplicated content
    // Process in reverse order to maintain correct positions
    const cellsToReplace = [...newRowCells.cells].reverse()
    const originalCells = [...originalRowCells.cells].reverse()

    cellsToReplace.forEach((newCell, reverseIndex) => {
      const originalCell = originalCells[reverseIndex]
      if (newCell.node && originalCell?.node) {
        const duplicatedCell = newCell.node.type.create(
          { ...originalCell.node.attrs },
          originalCell.node.content,
          originalCell.node.marks
        )

        const cellEnd = newCell.pos + newCell.node.nodeSize
        tr.replaceWith(newCell.pos, cellEnd, duplicatedCell)
      }
    })

    if (tr.docChanged) {
      view.dispatch(tr)

      updateSelectionAfterAction(editor, "row", index + 1, tablePos)

      return true
    }

    return false
  } catch (error) {
    console.error("Error duplicating row:", error)
    return false
  }
}

/**
 * Duplicates a column by using addColumnAfter and then replacing the content.
 */
function duplicateColumn(
  {
    editor,
    index,
    tablePos
  }
) {
  try {
    const originalColumnCells = getRowOrColumnCells(editor, index, "column", tablePos)
    if (originalColumnCells.cells.length === 0) return false

    let addSuccess = false
    if (editor.state.selection instanceof CellSelection) {
      addSuccess = editor.chain().focus().addColumnAfter().run()
    } else {
      if (!tablePos) return false
      const sourceCoords = getIndexCoordinates({
        editor,
        index,
        orientation: "column",
        tablePos,
      })
      if (!sourceCoords) return false

      const state = selectCellsByCoords(editor, tablePos, sourceCoords, {
        mode: "state",
      })
      addSuccess = addColumnAfter(state, editor.view.dispatch)
    }

    if (!addSuccess) return false

    const newColumnCells = getRowOrColumnCells(editor, index + 1, "column", tablePos)

    if (newColumnCells.cells.length === 0) {
      return false
    }

    const { state, view } = editor
    const tr = state.tr

    // Replace each cell in the new column with duplicated content
    // Process in reverse order to maintain correct positions
    const cellsToReplace = [...newColumnCells.cells].reverse()
    const originalCells = [...originalColumnCells.cells].reverse()

    cellsToReplace.forEach((newCell, reverseIndex) => {
      const originalCell = originalCells[reverseIndex]
      if (newCell.node && originalCell?.node) {
        const duplicatedCell = newCell.node.type.create(
          { ...originalCell.node.attrs },
          originalCell.node.content,
          originalCell.node.marks
        )

        const cellEnd = newCell.pos + newCell.node.nodeSize
        tr.replaceWith(newCell.pos, cellEnd, duplicatedCell)
      }
    })

    if (tr.docChanged) {
      view.dispatch(tr)

      updateSelectionAfterAction(editor, "column", index + 1, tablePos)

      return true
    }

    return false
  } catch (error) {
    console.error("Error duplicating column:", error)
    return false
  }
}

/**
 * Executes the row/column duplication in the editor.
 */
function tableDuplicateRowColumn(
  {
    editor,
    index,
    orientation,
    tablePos
  }
) {
  if (
    !canDuplicateRowColumn({ editor, index, orientation, tablePos }) ||
    !editor
  ) {
    return false
  }

  const table = getTable(editor, tablePos)
  if (!table) return false

  const selectionType = getTableSelectionType(editor, index, orientation, tablePos)
  if (!selectionType) return false

  try {
    if (selectionType.orientation === "row") {
      return duplicateRow({
        editor,
        index: selectionType.index,
        tablePos,
      });
    } else if (selectionType.orientation === "column") {
      return duplicateColumn({
        editor,
        index: selectionType.index,
        tablePos,
      });
    }

    return false
  } catch (error) {
    console.error("Error duplicating row/column:", error)
    return false
  }
}

/**
 * Determines if the duplicate button should be shown
 * based on editor state and config.
 */
function shouldShowButton(
  {
    editor,
    index,
    orientation,
    hideWhenUnavailable
  }
) {
  if (!editor || !editor.isEditable) return false
  if (!isExtensionAvailable(editor, REQUIRED_EXTENSIONS)) return false
  return hideWhenUnavailable
    ? canDuplicateRowColumn({ editor, index, orientation })
    : true;
}

/**
 * Custom hook that provides **table row/column duplication**
 * functionality for the Tiptap editor.
 */
export function useTableDuplicateRowColumn(
  config
) {
  const {
    editor: providedEditor,
    index,
    orientation,
    tablePos,
    hideWhenUnavailable = false,
    onDuplicated,
  } = config

  const { editor } = useTiptapEditor(providedEditor)

  const selectionType = getTableSelectionType(editor, index, orientation)

  const isVisible = shouldShowButton({
    editor,
    index,
    orientation,
    hideWhenUnavailable,
  })

  const canPerformDuplicate = canDuplicateRowColumn({
    editor,
    index,
    tablePos,
    orientation,
  })

  const handleDuplicate = useCallback(() => {
    const success = tableDuplicateRowColumn({
      editor,
      index,
      orientation,
      tablePos,
    })
    if (success) onDuplicated?.()
    return success
  }, [editor, index, orientation, tablePos, onDuplicated])

  const label = useMemo(() => {
    return tableDuplicateRowColumnLabels[selectionType?.orientation || "row"]
  }, [selectionType])

  const Icon = CopyIcon

  return {
    isVisible,
    canDuplicateRowColumn: canPerformDuplicate,
    handleDuplicate,
    label,
    Icon,
  }
}
