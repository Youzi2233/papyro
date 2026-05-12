import { useCallback, useState } from "react"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

// --- Lib ---
import { isExtensionAvailable } from "@/lib/tiptap-utils"

// --- Icons ---
import { TableIcon } from "@/components/tiptap-icons/table-icon"

const REQUIRED_EXTENSIONS = ["table"]

/**
 * Checks if a table can be inserted in the current editor state
 */
export function canInsertTable(editor) {
  if (!editor || !editor.isEditable) return false
  return isExtensionAvailable(editor, REQUIRED_EXTENSIONS);
}

/**
 * Inserts a table with the specified dimensions
 */
export function insertTable(editor, rows, cols) {
  if (!editor || !canInsertTable(editor)) return false

  try {
    return editor
      .chain()
      .focus()
      .insertTable({
        rows,
        cols,
        withHeaderRow: false,
      })
      .run();
  } catch (error) {
    console.error("Error inserting table:", error)
    return false
  }
}

/**
 * Determines if the table trigger button should be shown
 */
export function shouldShowButton(editor, hideWhenUnavailable) {
  if (!editor || !editor.isEditable) return false

  const hasExtension = isExtensionAvailable(editor, REQUIRED_EXTENSIONS)
  if (!hasExtension) return false

  // If hiding when unavailable, also check if we can actually insert
  return !hideWhenUnavailable || canInsertTable(editor);
}

/**
 * Custom hook that provides table insertion functionality for Tiptap editor
 *
 * @example
 * ```tsx
 * function MyTableButton() {
 *   const {
 *     isVisible,
 *     canInsert,
 *     isOpen,
 *     setIsOpen,
 *     hoveredCell,
 *     handleCellHover,
 *     handleCellClick,
 *     resetHoveredCell
 *   } = useTableTriggerButton({ editor })
 *
 *   if (!isVisible) return null
 *
 *   return (
 *     <Popover open={isOpen} onOpenChange={setIsOpen}>
 *       <PopoverTrigger>Insert Table</PopoverTrigger>
 *       <PopoverContent>
 *         <TableGridSelector
 *           hoveredCell={hoveredCell}
 *           onCellHover={handleCellHover}
 *           onCellClick={handleCellClick}
 *           onMouseLeave={resetHoveredCell}
 *         />
 *       </PopoverContent>
 *     </Popover>
 *   )
 * }
 * ```
 */
export function useTableTriggerButton(config) {
  const {
    editor: providedEditor,
    hideWhenUnavailable = false,
    onInserted,
  } = config || {}

  const { editor } = useTiptapEditor(providedEditor)
  const [isOpen, setIsOpen] = useState(false)
  const [hoveredCell, setHoveredCell] = useState(null)

  const isVisible = shouldShowButton(editor, hideWhenUnavailable)
  const canInsert = canInsertTable(editor)

  const handleCellHover = useCallback((row, col) => {
    setHoveredCell({ row, col })
  }, [])

  const handleCellClick = useCallback((row, col) => {
    const success = insertTable(editor, row + 1, col + 1)
    if (success) {
      setIsOpen(false)
      onInserted?.(row + 1, col + 1)
    }
  }, [editor, onInserted])

  const resetHoveredCell = useCallback(() => {
    setHoveredCell(null)
  }, [])

  return {
    isVisible,
    canInsert,
    isOpen,
    setIsOpen,
    hoveredCell,
    handleCellHover,
    handleCellClick,
    resetHoveredCell,
    label: "Insert table",
    Icon: TableIcon,
  }
}
